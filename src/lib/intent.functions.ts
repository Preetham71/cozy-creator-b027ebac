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
  "Lighting",
  "Rugs",
  "Cushions",
  "Throws",
  "Curtains",
  "Wall decor",
  "Mirrors",
  "Storage",
  "Shelves",
  "Side tables",
  "Plants",
  "Decor accents",
];

const SYSTEM = `You are ShopMind, an AI shopping assistant strictly for HOME DECOR products.

Your job: parse the user's natural-language query (and any prior turns of the conversation) into a structured intent. Be GENEROUS — vibe/mood/scene queries ("warm cozy reading corner", "calm coastal balcony", "make my bedroom feel warmer") are valid and in-domain.

RULES:
1. Home decor scope: clothing, electronics, food, services etc. → inDomain=false. Anything about decorating, furnishing, lighting, soft furnishings, plants, wall styling, mood/vibe of a room → inDomain=true.
2. primaryCategory: map to ONE of [${CATEGORIES.join(", ")}] ONLY if the user is clearly asking for one specific product type (e.g. "pillow covers" → Cushions, "table lamp" → Lighting). For SCENE/VIBE/MOOD queries that span multiple categories (a "reading corner", "warmer bedroom", "coastal balcony"), set primaryCategory=null — the search layer will fan out across relevant categories. Still set primaryProduct to the user's term.
3. Extract attributes aggressively from natural language:
   - colors, materials, styles (warm/cozy/boho/scandi/coastal/calm/modern/minimalist/earthy/luxe etc.)
   - rooms (bedroom, living room, balcony, reading corner, entryway, study)
   - size, budgetMax in INR ("1k"=1000, "8k"=8000, "under 5000"=5000)
   - constraints: detect renting/temporary phrases → "renter-friendly"; "can't drill / no drilling / no holes / rented / temporary" → "no-drill" AND "renter-friendly"; "no paint / can't paint" → "no-paint"; "small/tiny/studio/compact/1bhk" → "small-space"; "washable/easy clean" → "washable"; "low maintenance" → "low-maintenance".
4. CLARIFICATIONS: only ask if the query is genuinely too thin to act on. For scene/vibe queries with at least a room OR a mood, return clarifications=[] and let the search show curated picks. Don't ask redundant questions when constraints/styles/budget are already given.
5. summary: one short sentence summarizing your understanding in plain language.
6. Be tolerant of synonyms: "pillow covers" = Cushions, "rug/carpet" = Rugs, "fairy lights/string lights" = Lighting.

Return ONLY via the structured tool call. No prose.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "register_intent",
    description: "Register the structured shopping intent.",
    parameters: {
      type: "object",
      properties: {
        inDomain: { type: "boolean" },
        outOfScopeReason: { type: ["string", "null"] },
        primaryProduct: { type: ["string", "null"] },
        primaryCategory: { type: ["string", "null"], enum: [...CATEGORIES, null] },
        attributes: {
          type: "object",
          properties: {
            colors: { type: "array", items: { type: "string" } },
            materials: { type: "array", items: { type: "string" } },
            styles: { type: "array", items: { type: "string" } },
            rooms: { type: "array", items: { type: "string" } },
            size: { type: ["string", "null"] },
            budgetMax: { type: ["number", "null"] },
            constraints: { type: "array", items: { type: "string" } },
          },
          required: ["colors", "materials", "styles", "rooms", "size", "budgetMax", "constraints"],
        },
        clarifications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              question: { type: "string" },
              suggestions: { type: "array", items: { type: "string" } },
            },
            required: ["field", "question", "suggestions"],
          },
        },
        summary: { type: "string" },
      },
      required: [
        "inDomain",
        "outOfScopeReason",
        "primaryProduct",
        "primaryCategory",
        "attributes",
        "clarifications",
        "summary",
      ],
    },
  },
};

export const analyzeIntent = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; history?: { role: "user" | "assistant"; content: string }[] }) => input)
  .handler(async ({ data }): Promise<Intent> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const messages = [
      { role: "system", content: SYSTEM },
      ...(data.history ?? []),
      { role: "user", content: data.query },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "register_intent" } },
      }),
    });

    if (res.status === 429) throw new Error("Rate limited — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("AI returned no structured output");
    const args = JSON.parse(call.function.arguments);
    return args as Intent;
  });
