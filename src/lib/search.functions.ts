import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Product } from "./products";
import type { Intent } from "./intent.functions";
import { toProduct } from "./products.functions";

type DbRow = Parameters<typeof toProduct>[0];

export type SearchResult = {
  products: (Product & { score: number; matchReasons: string[] })[];
  total: number;
};

const lc = (s: string) => s.toLowerCase();

export type ScoreHit = { field: "color" | "style" | "room" | "constraint" | "material"; value: string; weight: number };
export type ScoreBreakdown = { score: number; reasons: string[]; hits: ScoreHit[] };

export function scoreProduct(p: Product, intent: Intent): ScoreBreakdown {
  const reasons: string[] = [];
  const hits: ScoreHit[] = [];
  let s = 1; // base score
  const a = intent.attributes;

  const colorHit = a.colors.filter(c => p.colorTags.some(t => lc(t).includes(lc(c)) || lc(c).includes(lc(t))));
  if (colorHit.length) {
    s += colorHit.length * 3;
    reasons.push(`${colorHit.join("/")} tones`);
    colorHit.forEach(v => hits.push({ field: "color", value: v, weight: 3 }));
  }

  const styleHit = a.styles.filter(c => p.styleTags.some(t => lc(t) === lc(c)));
  if (styleHit.length) {
    s += styleHit.length * 2.5;
    reasons.push(`${styleHit.join("/")} style`);
    styleHit.forEach(v => hits.push({ field: "style", value: v, weight: 2.5 }));
  }

  const roomHit = a.rooms.filter(c => p.roomTags.some(t => lc(t).includes(lc(c)) || lc(c).includes(lc(t))));
  if (roomHit.length) {
    s += roomHit.length * 2;
    reasons.push(`fits ${roomHit.join("/")}`);
    roomHit.forEach(v => hits.push({ field: "room", value: v, weight: 2 }));
  }

  const consHit = a.constraints.filter(c => p.constraints.some(t => lc(t) === lc(c)));
  if (consHit.length) {
    s += consHit.length * 2;
    reasons.push(...consHit);
    consHit.forEach(v => hits.push({ field: "constraint", value: v, weight: 2 }));
  }

  const blob = lc(p.embeddingText + " " + p.name + " " + p.description);
  for (const m of a.materials) {
    if (blob.includes(lc(m))) {
      s += 2;
      reasons.push(m);
      hits.push({ field: "material", value: m, weight: 2 });
    }
  }

  return { score: s, reasons: Array.from(new Set(reasons)).slice(0, 3), hits };
}

function score(p: Product, intent: Intent): { score: number; reasons: string[] } {
  const { score, reasons } = scoreProduct(p, intent);
  return { score, reasons };
}

// Room → preferred categories for scene/vibe fan-out
const ROOM_BUNDLES: Record<string, string[]> = {
  "reading corner": ["Lighting", "Rugs", "Cushions", "Throws", "Side tables", "Plants", "Decor accents", "Shelves"],
  "bedroom": ["Curtains", "Lighting", "Rugs", "Cushions", "Throws", "Storage", "Wall decor", "Mirrors"],
  "living room": ["Rugs", "Lighting", "Cushions", "Throws", "Decor accents", "Plants", "Side tables", "Wall decor"],
  "balcony": ["Lighting", "Plants", "Cushions", "Rugs", "Decor accents"],
  "entryway": ["Mirrors", "Storage", "Lighting", "Rugs", "Wall decor"],
  "study": ["Lighting", "Shelves", "Storage", "Decor accents", "Plants"],
};
const DEFAULT_CATEGORIES = ["Lighting", "Rugs", "Cushions", "Throws", "Decor accents", "Plants", "Wall decor", "Mirrors"];

function categoriesForIntent(intent: Intent): string[] {
  if (intent.primaryCategory) return [intent.primaryCategory];
  const cats = new Set<string>();
  for (const room of intent.attributes.rooms) {
    const key = Object.keys(ROOM_BUNDLES).find(k => room.toLowerCase().includes(k) || k.includes(room.toLowerCase()));
    if (key) ROOM_BUNDLES[key].forEach(c => cats.add(c));
  }
  if (cats.size === 0) DEFAULT_CATEGORIES.forEach(c => cats.add(c));
  return Array.from(cats);
}

function passesHardConstraints(p: Product, intent: Intent): boolean {
  if (intent.attributes.constraints.includes("no-drill") && !p.constraints.includes("no-drill")) {
    // Drop wall-mounted items the user can't install
    if (["Wall decor", "Mirrors", "Shelves", "Lighting"].includes(p.category)) {
      // Allow lighting/mirrors only if explicitly no-drill (leaning, plug-in, floor)
      return false;
    }
  }
  return true;
}

export const searchProducts = createServerFn({ method: "POST" })
  .inputValidator((input: { intent: Intent }) => input)
  .handler(async ({ data }): Promise<SearchResult> => {
    const { intent } = data;
    if (!intent.inDomain) return { products: [], total: 0 };

    const categories = categoriesForIntent(intent);
    const isMulti = categories.length > 1;

    let q = supabaseAdmin.from("products").select("*").in("category", categories);
    if (intent.attributes.budgetMax) q = q.lte("price", intent.attributes.budgetMax);

    const { data: rows, error } = await q.limit(1000);
    if (error) throw new Error(error.message);

    const all = (rows as DbRow[]).map(toProduct).filter(p => passesHardConstraints(p, intent));
    const scored = all.map(p => {
      const sc = score(p, intent);
      return { ...p, score: sc.score, matchReasons: sc.reasons };
    });
    scored.sort((a, b) => b.score - a.score || a.price - b.price);

    let final = scored;
    if (isMulti) {
      // Diversify: take up to 4 per category, preserving rank
      const perCat: Record<string, typeof scored> = {};
      const ordered: typeof scored = [];
      for (const p of scored) {
        const arr = (perCat[p.category] ??= []);
        if (arr.length < 4) { arr.push(p); ordered.push(p); }
      }
      final = ordered;
    }

    return { products: final.slice(0, 24), total: scored.length };
  });
