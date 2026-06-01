import { createServerFn } from "@tanstack/react-start";

export type Clarification = {
  field: string;
  question: string;
  suggestions: string[];
};

export type Intent = {
  inDomain: boolean;
  primaryProduct: string | null;
  primaryCategory: string | null;
  attributes: {
    colors: string[];
    materials: string[];
    styles: string[];
    rooms: string[];
    size: string | null;
    budgetMax: number | null;
    constraints: string[];
  };
  clarifications: Clarification[];
  summary: string;
  outOfScopeReason: string | null;
};

const CATEGORIES = [
  "Lighting", "Rugs", "Cushions", "Throws", "Curtains", "Wall decor", "Mirrors", "Storage", "Shelves", "Side tables", "Plants", "Decor accents",
];

const SYSTEM = `You are ShopMind, an AI assistant for HOME DECOR. 
Parse the user's query into a structured intent JSON.

CRITICAL INSTRUCTION for "summary":
Your summary should be a punchy, attention-grabbing design headline that captures the "vibe" of the search. 
DO NOT list specific products. 
Example: "Creating a cozy sanctuary" or "Modern minimalist vibes incoming".

Return ONLY valid JSON with this exact structure:
{
  "inDomain": boolean,
  "primaryProduct": string | null,
  "primaryCategory": string | null,
  "attributes": {
    "colors": string[],
    "materials": string[],
    "styles": string[],
    "rooms": string[],
    "size": string | null,
    "budgetMax": number | null,
    "constraints": string[]
  },
  "clarifications": [],
  "summary": "string",
  "outOfScopeReason": string | null
}`;

async function analyzeWithOpenRouter(prompt: string): Promise<Intent | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

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
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (res.ok) {
      const j = await res.json();
      const content = j.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          inDomain: parsed.inDomain ?? parsed.in_domain ?? true,
          primaryProduct: parsed.primaryProduct ?? parsed.primary_product ?? null,
          primaryCategory: parsed.primaryCategory ?? parsed.primary_category ?? null,
          attributes: {
            colors: parsed.attributes?.colors ?? [],
            materials: parsed.attributes?.materials ?? [],
            styles: parsed.attributes?.styles ?? [],
            rooms: parsed.attributes?.rooms ?? [],
            size: parsed.attributes?.size ?? null,
            budgetMax: parsed.attributes?.budgetMax ?? parsed.attributes?.budget_max ?? null,
            constraints: parsed.attributes?.constraints ?? [],
          },
          clarifications: parsed.clarifications ?? [],
          summary: parsed.summary ?? "Furniture search",
          outOfScopeReason: parsed.outOfScopeReason ?? parsed.out_of_scope_reason ?? null,
        } as Intent;
      }
    }
  } catch (e) {
    console.error("OpenRouter intent analysis error:", e);
  }
  return null;
}

export const analyzeIntent = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; history?: { role: "user" | "assistant"; content: string }[] }) => input)
  .handler(async ({ data }): Promise<Intent> => {
    console.log(`[Intent] Analyzing query: "${data.query}"`);
    const prompt = `${SYSTEM}\n\nCategories: ${CATEGORIES.join(", ")}\n\nUser Query: ${data.query}`;

    const result = await analyzeWithOpenRouter(prompt);
    if (result) {
      console.log(`[Intent] Success! In-domain: ${result.inDomain}, Summary: ${result.summary}`);
      return result;
    }

    throw new Error("Intent analysis failed. Please check your OpenRouter API key in the .env file.");
  });
