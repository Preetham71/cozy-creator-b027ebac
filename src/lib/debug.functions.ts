import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { toProduct } from "./products.functions";
import { scoreProduct, type ScoreHit } from "./search.functions";
import type { Intent } from "./intent.functions";

export type RetrievedChunk = {
  rank: number;
  id: string;
  source: string;
  preview: string;
  score: number;
  keywordHits: string[];
  hits: ScoreHit[];
  imageRelevance: number;
};

export type DebugInfo = {
  query: string;
  intent: Intent;
  systemPrompt: string;
  intentMessages: { role: string; content: string }[];
  retrievalSql: string;
  scoringFormula: string;
  chunks: RetrievedChunk[];
  finalPrompt: string;
  generatedAt: string;
};

const SYSTEM_PROMPT_FOR_RESPONSE = `You are ShopMind, a home decor shopping assistant.
Given the user's intent and the retrieved product chunks below, recommend the best matches.
Honor budget, color, material, style, room, and constraint preferences.
Return concise rationale per product tied to the user's stated needs.`;

const SCORING_FORMULA = `score = 1 (base)
  + 3 × color matches      (colorTags fuzzy-overlap with intent.colors)
  + 2.5 × style matches    (styleTags exact-match with intent.styles)
  + 2 × room matches       (roomTags fuzzy-overlap with intent.rooms)
  + 2 × constraint matches (constraints exact-match with intent.constraints)
  + 2 × material hits      (substring of name + description + embeddingText)
Tie-break: lower price first.`;

export const getDebugInfo = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      query: string;
      intent: Intent;
      intentSystemPrompt?: string;
      intentHistory?: { role: string; content: string }[];
    }) => input
  )
  .handler(async ({ data }): Promise<DebugInfo> => {
    const { query, intent } = data;

    let chunks: RetrievedChunk[] = [];
    let retrievalSql = "(no retrieval — out of domain)";

    if (intent.inDomain) {
      // Mirror search.functions.ts fan-out: scene/vibe queries with no
      // primaryCategory expand to room-based category bundles.
      const ROOM_BUNDLES: Record<string, string[]> = {
        "reading corner": ["Lighting", "Rugs", "Cushions", "Throws", "Side tables", "Plants", "Decor accents", "Shelves"],
        "bedroom": ["Curtains", "Lighting", "Rugs", "Cushions", "Throws", "Storage", "Wall decor", "Mirrors"],
        "living room": ["Rugs", "Lighting", "Cushions", "Throws", "Decor accents", "Plants", "Side tables", "Wall decor"],
        "balcony": ["Lighting", "Plants", "Cushions", "Rugs", "Decor accents"],
        "entryway": ["Mirrors", "Storage", "Lighting", "Rugs", "Wall decor"],
        "study": ["Lighting", "Shelves", "Storage", "Decor accents", "Plants"],
      };
      const DEFAULT_CATEGORIES = ["Lighting", "Rugs", "Cushions", "Throws", "Decor accents", "Plants", "Wall decor", "Mirrors"];

      let categories: string[];
      if (intent.primaryCategory) {
        categories = [intent.primaryCategory];
      } else {
        const cats = new Set<string>();
        for (const room of intent.attributes.rooms) {
          const key = Object.keys(ROOM_BUNDLES).find(k => room.toLowerCase().includes(k) || k.includes(room.toLowerCase()));
          if (key) ROOM_BUNDLES[key].forEach(c => cats.add(c));
        }
        if (cats.size === 0) DEFAULT_CATEGORIES.forEach(c => cats.add(c));
        categories = Array.from(cats);
      }

      const catList = categories.map(c => `'${c}'`).join(", ");
      retrievalSql = `SELECT * FROM products WHERE category IN (${catList})${
        intent.attributes.budgetMax ? ` AND price <= ${intent.attributes.budgetMax}` : ""
      } LIMIT 1000${categories.length > 1 ? "  -- scene query: fan-out across room-relevant categories" : ""}`;

      let q = supabaseAdmin.from("products").select("*").in("category", categories);
      if (intent.attributes.budgetMax) q = q.lte("price", intent.attributes.budgetMax);
      const { data: rows, error } = await q.limit(1000);
      if (error) throw new Error(error.message);

      const products = ((rows ?? []) as Parameters<typeof toProduct>[0][]).map(toProduct);
      // Hard filter: no-drill drops wall-mounted items that lack that tag
      const filtered = products.filter(p => {
        if (intent.attributes.constraints.includes("no-drill") && !p.constraints.includes("no-drill")) {
          if (["Wall decor", "Mirrors", "Shelves", "Lighting"].includes(p.category)) return false;
        }
        return true;
      });
      const scored = filtered.map((p) => {
        const sc = scoreProduct(p, intent);
        const imageRelevance = p.imageUrl && !p.imageUrl.includes("placehold") ? 1 : 0;
        return { p, ...sc, imageRelevance };
      });
      scored.sort((a, b) => b.score - a.score || a.p.price - b.p.price);

      chunks = scored.slice(0, 12).map((s, i) => ({
        rank: i + 1,
        id: s.p.id,
        source: `products.${s.p.category}`,
        preview: `${s.p.name} — ₹${s.p.price.toLocaleString("en-IN")} · ${s.p.description.slice(0, 140)}${s.p.description.length > 140 ? "…" : ""}`,
        score: Number(s.score.toFixed(2)),
        keywordHits: s.hits.map((h) => `${h.value}(${h.field}+${h.weight})`),
        hits: s.hits,
        imageRelevance: s.imageRelevance,
      }));
    }

    const contextBlock = chunks
      .map(
        (c) =>
          `# Chunk ${c.rank} (id=${c.id}, score=${c.score})\n${c.preview}\nmatches: ${c.keywordHits.join(", ") || "—"}`
      )
      .join("\n\n");

    const finalPrompt = `<SYSTEM>\n${SYSTEM_PROMPT_FOR_RESPONSE}\n</SYSTEM>\n\n<INTENT>\n${JSON.stringify(intent, null, 2)}\n</INTENT>\n\n<CONTEXT>\n${contextBlock || "(no chunks)"}\n</CONTEXT>\n\n<USER>\n${query}\n</USER>`;

    return {
      query,
      intent,
      systemPrompt: SYSTEM_PROMPT_FOR_RESPONSE,
      intentMessages: data.intentHistory ?? [],
      retrievalSql,
      scoringFormula: SCORING_FORMULA,
      chunks,
      finalPrompt,
      generatedAt: new Date().toISOString(),
    };
  });
