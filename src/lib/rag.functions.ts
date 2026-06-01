import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { toProduct } from "./products.functions";
import type { Product } from "./products";

export type RetrievedChunk = {
  id: string;
  productId: string;
  content: string;
  similarity: number;
};

export type RagResult = {
  aiResponse: string;
  chunks: RetrievedChunk[];          // top N retrieved (default 20)
  topChunks: RetrievedChunk[];       // top 5 (used for generation)
  topProducts: (Product & { similarity: number })[];        // products mapped from topChunks
  additionalProducts: (Product & { similarity: number })[]; // rest
  prompt: {
    system: string;
    retrievedContext: string;
    userQuery: string;
    full: string;
  };
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are ShopMind, a warm and knowledgeable home decor shopping assistant.

PERSONA:
- Friendly, concise, and design-savvy.
- You help shoppers find pieces that fit their space, vibe, and constraints (renting, no-drill, budget, room).

GUARDRAILS:
- Only discuss home decor products and styling. If the query is off-topic, gently redirect.
- Never invent products or prices. ONLY reference items present in [RETRIEVED CONTEXT].
- Honor the user's stated budget, constraints, room, and mood.

OUTPUT FORMAT:
- 2–4 short sentences.
- Open with a one-line read of the user's vibe/need.
- Then briefly explain why the retrieved picks fit (mention 1–2 product names from the context).
- No bullet lists, no markdown headings, no prices unless the user asked.`;

const TOP_K_GENERATION = 5;
const TOP_K_RETRIEVAL = 20;

async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: query,
      dimensions: 1536,
    }),
  });
  if (!r.ok) throw new Error(`Embeddings error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.data[0].embedding as number[];
}

async function generateAnswer(userQuery: string, retrievedContext: string, temperature: number): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const userMsg = `[RETRIEVED CONTEXT]\n${retrievedContext}\n\n[USER QUESTION]\n${userQuery}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (r.status === 429) throw new Error("Rate limited — try again in a moment.");
  if (r.status === 402) throw new Error("AI credits exhausted.");
  if (!r.ok) throw new Error(`AI gateway error ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

const RERANK_SYSTEM = `You are a product curation engine for a home decor shopping app.
You will receive a user query, an explicit EXPLORATION LEVEL (0.0–1.0), and a JSON list of candidate products (each with id, name, category, tags, price, similarity).
Your job is to choose exactly 5 product IDs from the list to surface as the user's top matches.

EXPLORATION LEVEL is the SINGLE MOST IMPORTANT signal — treat it literally, do not infer it from your sampling temperature:
- 0.0–0.2 (STRICT): Pick the 5 highest-similarity items that literally match the query. Do not diversify. Repeatable.
- 0.3–0.5 (BALANCED): Mostly strong matches, but swap 1 item for a complementary pick in a related category.
- 0.6–0.8 (DIVERSE): Spread picks across DIFFERENT categories. No more than 2 picks from any single category. Include at least 2 complementary/adjacent items that the user did not literally ask for but would pair well stylistically.
- 0.9–1.0 (EXPLORATORY): Every pick must be from a DIFFERENT category if possible. Strongly favor unexpected, complementary, mood-adjacent items over literal matches. Treat the query as a vibe, not a shopping list.

HARD RULES (override exploration):
- You may ONLY return IDs that appear in the candidate list. Never invent IDs.
- Always honor explicit hard constraints in the query (budget cap, no-drill, renting, specific room) before exploring.
- Return JSON ONLY in this exact shape: {"ids": ["id1","id2","id3","id4","id5"]}`;

async function rerankWithLLM(
  query: string,
  candidates: (Product & { similarity: number })[],
  temperature: number,
): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const compact = candidates.map((p) => ({
    id: p.id,
    name: p.name,
    category: (p as any).category ?? null,
    tags: (p as any).tags ?? [],
    price: (p as any).price ?? null,
    similarity: Number(p.similarity.toFixed(4)),
  }));
  const level = temperature.toFixed(2);
  const bucket =
    temperature <= 0.2 ? "STRICT"
    : temperature <= 0.5 ? "BALANCED"
    : temperature <= 0.8 ? "DIVERSE"
    : "EXPLORATORY";
  const userMsg = `EXPLORATION LEVEL: ${level} / 1.00 (${bucket})

User query: ${query}

Candidates (${compact.length}):
${JSON.stringify(compact)}

Return JSON: {"ids":[...5 ids...]}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RERANK_SYSTEM },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Rerank gateway error ${r.status}`);
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter((x: unknown): x is string => typeof x === "string") : [];
  return ids;
}

// Enforce category diversity at higher exploration levels.
// At temp >= 0.6, cap each category at 2 picks. At temp >= 0.9, cap at 1 pick where possible.
function enforceCategoryDiversity(
  picked: (Product & { similarity: number })[],
  pool: (Product & { similarity: number })[],
  temperature: number,
  target: number,
): (Product & { similarity: number })[] {
  if (temperature < 0.6) return picked.slice(0, target);
  const cap = temperature >= 0.9 ? 1 : 2;
  const counts = new Map<string, number>();
  const result: (Product & { similarity: number })[] = [];
  const usedIds = new Set<string>();
  const keyOf = (p: Product) => ((p as any).category ?? "_uncat") as string;

  for (const p of picked) {
    if (result.length >= target) break;
    const k = keyOf(p);
    const c = counts.get(k) ?? 0;
    if (c >= cap) continue;
    result.push(p);
    counts.set(k, c + 1);
    usedIds.add(p.id);
  }
  if (result.length < target) {
    const remaining = pool.filter((p) => !usedIds.has(p.id));
    remaining.sort((a, b) => (counts.get(keyOf(a)) ?? 0) - (counts.get(keyOf(b)) ?? 0));
    for (const p of remaining) {
      if (result.length >= target) break;
      const k = keyOf(p);
      const c = counts.get(k) ?? 0;
      if (c >= cap) continue;
      result.push(p);
      counts.set(k, c + 1);
      usedIds.add(p.id);
    }
    // Final fallback: ignore cap if still short
    for (const p of remaining) {
      if (result.length >= target) break;
      if (usedIds.has(p.id)) continue;
      result.push(p);
      usedIds.add(p.id);
    }
  }
  return result;
}


export const ragQuery = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; temperature?: number }) => input)
  .handler(async ({ data }): Promise<RagResult> => {
    const query = data.query.trim();
    if (!query) throw new Error("Empty query");
    const temperature = Math.max(0, Math.min(1, data.temperature ?? 0.6));

    // 1. Embed query
    const embedding = await embedQuery(query);

    // 2. Vector search via RPC
    const { data: matches, error } = await supabaseAdmin.rpc("match_chunks", {
      query_embedding: embedding as unknown as string,
      match_count: TOP_K_RETRIEVAL,
    });
    if (error) throw new Error(`match_chunks failed: ${error.message}`);

    const chunks: RetrievedChunk[] = ((matches ?? []) as Array<{
      id: string; product_id: string; content: string; similarity: number;
    }>).map(m => ({
      id: m.id,
      productId: m.product_id,
      content: m.content,
      similarity: Number(m.similarity),
    }));

    // 3. Fetch products for all matched chunks (unique product ids)
    const productIds = Array.from(new Set(chunks.map(c => c.productId)));
    let productMap = new Map<string, Product>();
    if (productIds.length) {
      const { data: rows, error: pErr } = await supabaseAdmin
        .from("products")
        .select("*")
        .in("id", productIds);
      if (pErr) throw new Error(pErr.message);
      productMap = new Map(
        (rows ?? []).map((r) => {
          const p = toProduct(r as Parameters<typeof toProduct>[0]);
          return [p.id, p];
        })
      );
    }

    // 4. Preserve chunk ranking when ordering products
    const seen = new Set<string>();
    const orderedProducts: (Product & { similarity: number })[] = [];
    for (const c of chunks) {
      if (seen.has(c.productId)) continue;
      const p = productMap.get(c.productId);
      if (!p) continue;
      seen.add(c.productId);
      orderedProducts.push({ ...p, similarity: c.similarity });
    }

    // 4b. LLM-driven rerank of the candidate pool — temperature controls curation
    let rerankedOrdered = orderedProducts;
    if (orderedProducts.length > 1) {
      try {
        const ids = await rerankWithLLM(query, orderedProducts, temperature);
        const validIds = ids.filter((id) => orderedProducts.some((p) => p.id === id));
        if (validIds.length) {
          const byId = new Map(orderedProducts.map((p) => [p.id, p]));
          const llmPicked: (Product & { similarity: number })[] = [];
          for (const id of validIds) {
            const p = byId.get(id);
            if (p && !llmPicked.some((x) => x.id === id)) llmPicked.push(p);
          }
          // Apply category-diversity enforcement (no-op when temperature < 0.6)
          const diversified = enforceCategoryDiversity(
            llmPicked,
            orderedProducts,
            temperature,
            TOP_K_GENERATION,
          );
          const pickedIds = new Set(diversified.map((p) => p.id));
          const rest = orderedProducts.filter((p) => !pickedIds.has(p.id));
          rerankedOrdered = [...diversified, ...rest];
        }
      } catch {
        // Silent fallback to similarity ordering
      }
    }

    const topProducts = rerankedOrdered.slice(0, TOP_K_GENERATION);
    const additionalProducts = rerankedOrdered.slice(TOP_K_GENERATION);

    // Realign topChunks so the written summary matches the surfaced top products
    const topProductIds = new Set(topProducts.map((p) => p.id));
    const topChunks = [
      ...chunks.filter((c) => topProductIds.has(c.productId)),
      ...chunks.filter((c) => !topProductIds.has(c.productId)),
    ].slice(0, TOP_K_GENERATION);


    // 5. Build retrieval context block and call LLM
    const retrievedContext = topChunks
      .map((c, i) => `Chunk ${i + 1} (similarity: ${c.similarity.toFixed(4)}):\n${c.content}`)
      .join("\n\n---\n\n");

    let aiResponse = "";
    try {
      aiResponse = await generateAnswer(query, retrievedContext, temperature);
    } catch (e) {
      aiResponse = topProducts.length
        ? `Here are some picks that match "${query}". (AI summary unavailable.)`
        : `I couldn't find a strong match for "${query}" in the catalog. Try a different vibe or constraint.`;
    }

    const fullPrompt = `## System Prompt\n${SYSTEM_PROMPT}\n\n## Retrieved Context\n${retrievedContext}\n\n## User Question\n${query}`;

    return {
      aiResponse,
      chunks,
      topChunks,
      topProducts,
      additionalProducts,
      prompt: { system: SYSTEM_PROMPT, retrievedContext, userQuery: query, full: fullPrompt },
      generatedAt: new Date().toISOString(),
    };
  });
