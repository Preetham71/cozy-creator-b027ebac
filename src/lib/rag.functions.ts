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
  chunks: RetrievedChunk[];          
  topChunks: RetrievedChunk[];       
  topProducts: (Product & { similarity: number })[];        
  additionalProducts: (Product & { similarity: number })[]; 
  prompt: {
    system: string;
    retrievedContext: string;
    userQuery: string;
    full: string;
  };
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are ShopMind, a knowledgeable home decor shopping assistant and professional interior stylist. 

CRITICAL INSTRUCTIONS:
1. Catch the user's attention with an exciting, design-savvy opening.
2. DO NOT list or describe the specific products provided in the context, as they are already displayed as interactive cards below your message.
3. Focus exclusively on the "vibe", styling tips, and how this curated collection transforms their space.
4. Use punchy, inspiring language. Keep it concise (under 3-4 sentences).
5. Address the user directly and make them feel like they're getting expert advice.`;
const TOP_K_RETRIEVAL = 20;

/** Use OpenRouter for embeddings (OpenAI-compatible) */
async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  console.log(`[RAG] Embedding query: "${query}" using OpenRouter. API Key present: ${!!apiKey}`);
  
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  
  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ 
        model: "openai/text-embedding-3-small", 
        input: query 
      }),
    });
    
    if (res.ok) {
      const j = await res.json();
      console.log(`[RAG] Embedding success. Vector length: ${j.data[0].embedding.length}`);
      return j.data[0].embedding;
    }
    const err = await res.text();
    console.error(`[RAG] Embedding error response: ${err}`);
  } catch (e) {
    console.error(`[RAG] Embedding connection error:`, e);
  }
  throw new Error("Failed to generate embeddings. Check your OpenRouter key.");
}

/** Try different models/endpoints for text generation */
async function generateWithOpenRouter(prompt: string, temperature: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cozy-creator.lovable.app",
        "X-Title": "Cozy Creator",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [{ role: "user", content: prompt }],
        temperature,
      }),
    });

    if (res.ok) {
      const j = await res.json();
      return j.choices?.[0]?.message?.content ?? "";
    }
    const err = await res.text();
    console.error("OpenRouter generation error:", err);
  } catch (e) {
    console.error("OpenRouter connection error:", e);
  }
  return "";
}

export const ragQuery = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; temperature?: number }) => input)
  .handler(async ({ data }): Promise<RagResult> => {
    console.log(`[RAG] Handling ragQuery for: "${data.query}"`);
    const query = data.query.trim();
    const temperature = data.temperature ?? 0.6;
    
    // This will trigger dotenv.config in client.server.ts
    const testClient = supabaseAdmin; 
    
    const embedding = await embedQuery(query);

    console.log(`[RAG] Calling match_chunks RPC...`);
    const { data: matches, error } = await supabaseAdmin.rpc("match_chunks", {
      query_embedding: embedding as unknown as string,
      match_count: TOP_K_RETRIEVAL,
    });
    
    if (error) {
      console.error(`[RAG] DB RPC Error: ${error.message}`);
      throw new Error(`DB Error: ${error.message}`);
    }

    console.log(`[RAG] RPC Success. Matches found: ${matches?.length || 0}`);

    const chunks = (matches ?? []).map((m: any) => ({
      id: m.id, productId: m.product_id, content: m.content, similarity: Number(m.similarity)
    }));

    const productIds = Array.from(new Set(chunks.map((c: any) => c.productId)));
    let topProducts: (Product & { similarity: number })[] = [];

    if (productIds.length) {
      console.log(`[RAG] Fetching products for IDs: ${productIds.join(", ")}`);
      const { data: rows, error: pError } = await supabaseAdmin.from("products").select("*").in("id", productIds);
      
      if (pError) console.error(`[RAG] Error fetching products: ${pError.message}`);
      
      const productMap = new Map((rows ?? []).map(r => [r.id, toProduct(r)]));
      
      const seen = new Set();
      for (const c of chunks) {
        if (!seen.has(c.productId)) {
          const p = productMap.get(c.productId);
          if (p) {
            topProducts.push({ ...p, similarity: c.similarity });
            seen.add(c.productId);
          }
        }
      }
    }

    console.log(`[RAG] Found ${topProducts.length} final products.`);

    const context = topProducts.slice(0, 5).map(p => `${p.name}: ${p.description}`).join("\n\n");
    const fullPrompt = SYSTEM_PROMPT + "\n\nQuery: " + query + "\n\nContext:\n" + context;

    let aiResponse = await generateWithOpenRouter(fullPrompt, temperature);
    
    if (!aiResponse) {
      console.warn(`[RAG] AI response is empty!`);
      aiResponse = "I'm sorry, I couldn't generate a response at this moment.";
    }

    return {
      aiResponse,
      chunks,
      topChunks: chunks.slice(0, 5),
      topProducts: topProducts.slice(0, 5),
      additionalProducts: topProducts.slice(5),
      prompt: { system: SYSTEM_PROMPT, retrievedContext: context, userQuery: query, full: "OpenRouter used" },
      generatedAt: new Date().toISOString(),
    };
  });
