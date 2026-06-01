import type { Product } from "./products";

export type Intent = {
  room: string;
  styles: string[];
  constraints: string[];
  budget: number;
  rawQuery: string;
};

export type ScoredProduct = {
  product: Product;
  score: number;
  reason: string;
};

export type Look = {
  title: string;
  intentSummary: string;
  items: ScoredProduct[];
  total: number;
  budget: number;
  fitScore: number;
  rationale: string;
};

const ROOM_KEYWORDS: Record<string, string[]> = {
  "reading corner": ["reading", "corner", "nook"],
  "bedroom": ["bedroom", "bed"],
  "living room": ["living", "lounge", "sofa"],
  "balcony": ["balcony", "patio"],
  "entryway": ["entry", "entryway", "foyer"],
  "study": ["study", "desk", "wfh"],
};

const STYLE_KEYWORDS = ["warm","cozy","minimalist","boho","modern","earthy","colorful","calm","scandi","luxe","romantic","natural"];

const CONSTRAINT_KEYWORDS: Record<string, string[]> = {
  "no-drill": ["no drill", "no drilling", "can't drill", "cannot drill", "no-drill", "without drilling"],
  "renter-friendly": ["rented", "renter", "rental", "temporary", "lease"],
  "small-space": ["small", "tiny", "compact", "studio", "1bhk", "1 bhk"],
  "low-maintenance": ["low maintenance", "easy", "low-maintenance"],
};

// Preferred category bundles per room
const ROOM_BUNDLES: Record<string, string[]> = {
  "reading corner": ["Lighting", "Rugs", "Cushions", "Throws", "Side tables", "Plants", "Decor accents", "Shelves"],
  "bedroom": ["Curtains", "Lighting", "Rugs", "Cushions", "Throws", "Storage", "Wall decor"],
  "living room": ["Rugs", "Lighting", "Cushions", "Throws", "Decor accents", "Plants", "Side tables"],
  "balcony": ["Lighting", "Plants", "Cushions", "Rugs", "Decor accents"],
  "entryway": ["Mirrors", "Storage", "Lighting", "Rugs", "Wall decor"],
  "study": ["Lighting", "Shelves", "Storage", "Decor accents", "Plants"],
};

const TARGET_BUNDLE_SIZE = 5;

export function parseIntent(query: string, opts: { budget?: number; room?: string; constraints?: string[] } = {}): Intent {
  const q = query.toLowerCase();

  let room = opts.room || "";
  if (!room) {
    for (const [r, kws] of Object.entries(ROOM_KEYWORDS)) {
      if (kws.some(k => q.includes(k))) { room = r; break; }
    }
  }
  if (!room) room = "living room";

  const styles = STYLE_KEYWORDS.filter(s => q.includes(s));

  const constraints = new Set<string>(opts.constraints || []);
  for (const [c, kws] of Object.entries(CONSTRAINT_KEYWORDS)) {
    if (kws.some(k => q.includes(k))) constraints.add(c);
  }

  // Budget extraction: ₹8k, 8000, under 5000
  let budget = opts.budget || 0;
  if (!budget) {
    const kMatch = q.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3})\s*k\b/);
    const nMatch = q.match(/(?:₹|rs\.?|inr|under|below|upto|up to)\s*(\d{3,6})/);
    const anyNum = q.match(/(\d{4,6})/);
    if (kMatch) budget = parseInt(kMatch[1]) * 1000;
    else if (nMatch) budget = parseInt(nMatch[1]);
    else if (anyNum) budget = parseInt(anyNum[1]);
  }
  if (!budget) budget = 10000;

  return { room, styles, constraints: Array.from(constraints), budget, rawQuery: query };
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function scoreProduct(p: Product, intent: Intent): { score: number; reasons: string[] } {
  const qTokens = new Set(tokenize(intent.rawQuery + " " + intent.styles.join(" ") + " " + intent.room));
  const pTokens = tokenize(p.embeddingText + " " + p.name + " " + p.category);
  let overlap = 0;
  for (const t of pTokens) if (qTokens.has(t)) overlap++;
  let score = overlap * 1.0;
  const reasons: string[] = [];

  if (p.roomTags.includes(intent.room)) { score += 4; reasons.push(`great for a ${intent.room}`); }
  for (const s of intent.styles) {
    if (p.styleTags.includes(s)) { score += 2.5; reasons.push(`${s} vibe`); }
  }
  for (const c of intent.constraints) {
    if (p.constraints.includes(c)) { score += 3; reasons.push(c); }
    else if (c === "no-drill" && !p.constraints.includes("no-drill")) { score -= 999; }
    else if (c === "renter-friendly" && !p.constraints.includes("renter-friendly")) { score -= 5; }
  }
  if (p.price <= intent.budget * 0.5) score += 1;
  if (p.price > intent.budget) score -= 2;

  return { score, reasons };
}

export function generateLook(intent: Intent, PRODUCTS: Product[]): Look {
  const categories = ROOM_BUNDLES[intent.room] || ROOM_BUNDLES["living room"];

  // Hard filter by constraints
  const candidates = PRODUCTS.filter(p => {
    if (intent.constraints.includes("no-drill") && !p.constraints.includes("no-drill")) return false;
    if (intent.constraints.includes("renter-friendly") && !p.constraints.includes("renter-friendly")) return false;
    return true;
  });

  const scored = candidates.map(p => {
    const { score, reasons } = scoreProduct(p, intent);
    return { product: p, score, reasons };
  });

  // Pick best product per preferred category, greedily within budget
  const picked: ScoredProduct[] = [];
  let remaining = intent.budget;

  for (const cat of categories) {
    if (picked.length >= TARGET_BUNDLE_SIZE) break;
    const inCat = scored
      .filter(s => s.product.category === cat && s.product.price <= remaining)
      .filter(s => !picked.find(pp => pp.product.id === s.product.id))
      .sort((a, b) => b.score - a.score);
    const top = inCat[0];
    if (top && top.score > -100) {
      const reason = buildReason(top.product, top.reasons, intent);
      picked.push({ product: top.product, score: top.score, reason });
      remaining -= top.product.price;
    }
  }

  // Backfill if fewer than 4 items
  if (picked.length < 4) {
    const extras = scored
      .filter(s => !picked.find(pp => pp.product.id === s.product.id) && s.product.price <= remaining)
      .sort((a, b) => b.score - a.score);
    for (const e of extras) {
      if (picked.length >= 4) break;
      picked.push({ product: e.product, score: e.score, reason: buildReason(e.product, e.reasons, intent) });
      remaining -= e.product.price;
    }
  }

  const total = picked.reduce((s, x) => s + x.product.price, 0);
  const maxScore = picked.length * 12;
  const sumScore = picked.reduce((s, x) => s + Math.max(0, x.score), 0);
  const fitScore = Math.min(98, Math.round((sumScore / Math.max(1, maxScore)) * 100) + 35);

  return {
    title: buildTitle(intent),
    intentSummary: buildIntentSummary(intent),
    items: picked,
    total,
    budget: intent.budget,
    fitScore,
    rationale: buildRationale(intent, picked),
  };
}

function buildReason(p: Product, reasons: string[], intent: Intent): string {
  const uniq = Array.from(new Set(reasons)).slice(0, 2);
  const tail = uniq.length ? ` — ${uniq.join(", ")}.` : ".";
  return `${p.description}${tail}`;
}

function buildTitle(intent: Intent): string {
  const adj = intent.styles[0] ? cap(intent.styles[0]) : "Curated";
  const constraintBit = intent.constraints.includes("no-drill") ? "No-Drill " : "";
  const room = intent.room.split(" ").map(cap).join(" ");
  return `${adj} ${constraintBit}${room}`.replace(/\s+/g, " ").trim();
}

function buildIntentSummary(intent: Intent): string {
  const parts: string[] = [];
  if (intent.styles.length) parts.push(intent.styles.slice(0, 2).join(", "));
  parts.push(intent.room);
  if (intent.constraints.includes("no-drill")) parts.push("no drilling");
  if (intent.constraints.includes("renter-friendly")) parts.push("renter-friendly");
  if (intent.constraints.includes("small-space")) parts.push("small space");
  return `${cap(parts.join(", "))}. Budget: ₹${intent.budget.toLocaleString("en-IN")}.`;
}

function buildRationale(intent: Intent, items: ScoredProduct[]): string {
  const cats = items.map(i => i.product.category.toLowerCase()).join(", ");
  const palette = intent.styles.includes("warm") || intent.styles.includes("cozy")
    ? "warm neutrals — creams, ochres and wood tones — layered with soft texture"
    : "a calm, consistent palette of soft neutrals and natural materials";
  const renter = intent.constraints.includes("no-drill")
    ? " Every piece is floor-standing, leaning, plug-in, or adhesive — nothing requires drilling."
    : "";
  return `This look pairs ${cats} so the corner feels intentional, not assembled. The palette stays in ${palette}, with lighting carrying the mood and textiles adding the cozy.${renter}`;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function swapItem(look: Look, itemId: string, intent: Intent, PRODUCTS: Product[]): Look {
  const idx = look.items.findIndex(i => i.product.id === itemId);
  if (idx < 0) return look;
  const original = look.items[idx].product;
  const remainingBudget = intent.budget - (look.total - original.price);
  const used = new Set(look.items.map(i => i.product.id));

  const candidates = PRODUCTS
    .filter((p: Product) => p.category === original.category && !used.has(p.id) && p.price <= remainingBudget)
    .filter((p: Product) => {
      if (intent.constraints.includes("no-drill") && !p.constraints.includes("no-drill")) return false;
      if (intent.constraints.includes("renter-friendly") && !p.constraints.includes("renter-friendly")) return false;
      return true;
    });
  if (!candidates.length) return look;
  const newProd = candidates[Math.floor(Math.random() * candidates.length)];
  const { score, reasons } = scoreProduct(newProd, intent);
  const newItems = [...look.items];
  newItems[idx] = { product: newProd, score, reason: buildReason(newProd, reasons, intent) };
  const total = newItems.reduce((s, x) => s + x.product.price, 0);
  return { ...look, items: newItems, total };
}

export function makeCheaper(intent: Intent, PRODUCTS: Product[]): Look {
  return generateLook({ ...intent, budget: Math.floor(intent.budget * 0.7) }, PRODUCTS);
}

export function makeWarmer(intent: Intent, PRODUCTS: Product[]): Look {
  const styles = Array.from(new Set([...intent.styles, "warm", "cozy"]));
  return generateLook({ ...intent, styles }, PRODUCTS);
}

