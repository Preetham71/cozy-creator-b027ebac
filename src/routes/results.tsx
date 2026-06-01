import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/ProductCard";
import { parseIntent, generateLook, swapItem, makeCheaper, makeWarmer, type Look, type Intent } from "@/lib/rag";
import { getProducts } from "@/lib/products.functions";
import { ArrowLeft, RefreshCw, Coins, Flame, Heart, Sparkles, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { DebugPanel } from "@/components/DebugPanel";
import { useAdmin } from "@/lib/admin";
import { useCart } from "@/lib/cart";
import type { DebugInfo } from "@/lib/debug.functions";
import type { Intent as AIIntent } from "@/lib/intent.functions";

type Search = { q?: string; budget?: string; room?: string; constraints?: string };

const productsQueryOptions = queryOptions({
  queryKey: ["products"],
  queryFn: () => getProducts(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/results")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: (s.q as string) || "",
    budget: (s.budget as string) || "",
    room: (s.room as string) || "",
    constraints: (s.constraints as string) || "",
  }),
  head: () => ({
    meta: [
      { title: "Your curated look · ShopMind" },
      { name: "description", content: "A cohesive, budget-aware decor bundle assembled by ShopMind." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQueryOptions),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
      Couldn't load the catalog: {error.message}
    </div>
  ),
  component: Results,
});


function Results() {
  const { q, budget, room, constraints } = Route.useSearch();
  const { data: products } = useSuspenseQuery(productsQueryOptions);
  const { totalItems } = useCart();

  const baseIntent: Intent = useMemo(() => parseIntent(q || "", {
    budget: budget ? parseInt(budget) : undefined,
    room: room || undefined,
    constraints: constraints ? constraints.split(",").filter(Boolean) : [],
  }), [q, budget, room, constraints]);

  const isAdmin = useAdmin();
  const [intent, setIntent] = useState<Intent>(baseIntent);
  const [look, setLook] = useState<Look>(() => generateLook(baseIntent, products));
  const [saved, setSaved] = useState(false);

  // Regenerate when products load / intent changes from URL
  useEffect(() => {
    const next = generateLook(baseIntent, products);
    setIntent(baseIntent);
    setLook(next);
  }, [baseIntent, products]);

  const apply = (newLook: Look, newIntent?: Intent) => {
    setLook(newLook);
    if (newIntent) setIntent(newIntent);
  };

  const regen = () => {
    apply(generateLook(intent, products));
    toast.success("New look generated");
  };
  const cheaper = () => {
    const ni = { ...intent, budget: Math.floor(intent.budget * 0.7) };
    apply(makeCheaper(intent, products), ni);
    toast.success(`Tightened budget to ₹${ni.budget.toLocaleString("en-IN")}`);
  };
  const warmer = () => {
    const ni = { ...intent, styles: Array.from(new Set([...intent.styles, "warm", "cozy"])) };
    apply(makeWarmer(intent, products), ni);
    toast.success("Warmed it up");
  };
  const swap = (id: string) => {
    const next = swapItem(look, id, intent, products);
    if (next === look) {
      toast.error("No alternative fits the budget");
      return;
    }
    apply(next);
  };

  const overBudget = look.total > look.budget;

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[40vh] bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklab,_var(--terracotta)_14%,_transparent),_transparent_70%)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          New look
        </Link>
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display text-lg tracking-tight">ShopMind</span>
        </div>
        <Link to="/checkout" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent/50 text-foreground transition-colors hover:bg-accent">
          <ShoppingCart className="h-5 w-5" />
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {totalItems}
            </span>
          )}
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        {/* Intent summary */}
        <section className="rounded-3xl border border-border bg-card/70 p-6 shadow-sm backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Interpreted intent</span>
              <p className="mt-2 text-base leading-relaxed text-foreground">"{look.intentSummary}"</p>
              <h1 className="mt-5 font-display text-4xl leading-tight text-foreground sm:text-5xl">
                {look.title}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <FitDial value={look.fitScore} />
              <div className="text-right">
                <div className={`font-display text-2xl ${overBudget ? "text-destructive" : "text-foreground"}`}>
                  ₹{look.total.toLocaleString("en-IN")}
                  <span className="ml-1 text-sm text-muted-foreground">of ₹{look.budget.toLocaleString("en-IN")}</span>
                </div>
                <div className="text-xs text-muted-foreground">{look.items.length} pieces</div>
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            <Button size="sm" variant="outline" className="rounded-full" onClick={regen}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={cheaper}>
              <Coins className="mr-1.5 h-3.5 w-3.5" /> Make it cheaper
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={warmer}>
              <Flame className="mr-1.5 h-3.5 w-3.5" /> Make it warmer
            </Button>
            {isAdmin && (
              <DebugPanel
                query={q || ""}
                intent={buildAIIntentFromLook(intent)}
                precomputed={buildDebugInfoFromLook(q || "", intent, look)}
                label="Debug retrieval"
              />
            )}
            <Button
              size="sm"
              variant={saved ? "default" : "secondary"}
              className="ml-auto rounded-full"
              onClick={() => { setSaved(true); toast.success("Look saved"); }}
            >
              <Heart className={`mr-1.5 h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} /> {saved ? "Saved" : "Save look"}
            </Button>
          </div>
        </section>

        {/* Products */}
        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl text-foreground">The look</h2>
            <div className="text-xs text-muted-foreground">Tap shuffle to swap any piece</div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {look.items.map((item) => (
              <ProductCard
                key={item.product.id}
                item={item}
                onSwap={() => swap(item.product.id)}
              />
            ))}
          </div>
        </section>

        {/* Why */}
        <section className="mt-10 grid gap-6 rounded-3xl border border-border bg-card/70 p-6 backdrop-blur sm:p-8 lg:grid-cols-[1fr_280px]">
          <div>
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Why this look works</span>
            <p className="mt-3 text-base leading-relaxed text-foreground">{look.rationale}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {intent.constraints.map(c => (
                <Badge key={c} variant="secondary" className="rounded-full">{c}</Badge>
              ))}
              {intent.styles.map(s => (
                <Badge key={s} variant="outline" className="rounded-full">{s}</Badge>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-accent/40 p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Budget</div>
            <div className="mt-2 font-display text-3xl text-foreground">
              ₹{look.total.toLocaleString("en-IN")}
            </div>
            <div className="text-sm text-muted-foreground">of ₹{look.budget.toLocaleString("en-IN")}</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (look.total / look.budget) * 100)}%` }}
              />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {look.budget - look.total >= 0
                ? `₹${(look.budget - look.total).toLocaleString("en-IN")} left to play with`
                : `Over by ₹${(look.total - look.budget).toLocaleString("en-IN")} — try "make it cheaper"`}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FitDial({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="relative grid h-20 w-20 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={r} fill="none"
          stroke="var(--primary)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
        />
      </svg>
      <div className="text-center">
        <div className="font-display text-lg leading-none text-foreground">{value}%</div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">match</div>
      </div>
    </div>
  );
}

function buildAIIntentFromLook(intent: Intent): AIIntent {
  return {
    inDomain: true,
    primaryProduct: intent.room,
    primaryCategory: null,
    attributes: {
      colors: [],
      materials: [],
      styles: intent.styles,
      rooms: [intent.room],
      size: null,
      budgetMax: intent.budget,
      constraints: intent.constraints,
    },
    clarifications: [],
    summary: `Rule-based curation for ${intent.room}`,
    outOfScopeReason: null,
  };
}

function buildDebugInfoFromLook(query: string, intent: Intent, look: Look): DebugInfo {
  const chunks = look.items.map((item, i) => {
    const styleHits = intent.styles.filter((s) => item.product.styleTags.includes(s));
    const roomHits = item.product.roomTags.includes(intent.room) ? [intent.room] : [];
    const consHits = intent.constraints.filter((c) => item.product.constraints.includes(c));
    const hits = [
      ...styleHits.map((v) => ({ field: "style" as const, value: v, weight: 2.5 })),
      ...roomHits.map((v) => ({ field: "room" as const, value: v, weight: 2 })),
      ...consHits.map((v) => ({ field: "constraint" as const, value: v, weight: 2 })),
    ];
    return {
      rank: i + 1,
      id: item.product.id,
      source: `products.${item.product.category}`,
      preview: `${item.product.name} — ₹${item.product.price.toLocaleString("en-IN")} · ${item.reason.slice(0, 140)}`,
      score: Number(item.score.toFixed(2)),
      keywordHits: hits.map((h) => `${h.value}(${h.field}+${h.weight})`),
      hits,
      imageRelevance: item.product.imageUrl && !item.product.imageUrl.includes("placehold") ? 1 : 0,
    };
  });


  const contextBlock = chunks
    .map(
      (c) =>
        `# Chunk ${c.rank} (id=${c.id}, score=${c.score})\n${c.preview}\nkeywords: ${c.keywordHits.join(", ") || "—"}`
    )
    .join("\n\n");

  const systemPrompt = `ShopMind rule-based curator. Build a cohesive ${intent.room} look within budget ₹${intent.budget.toLocaleString("en-IN")}. Respect constraints: ${intent.constraints.join(", ") || "(none)"}. Prefer styles: ${intent.styles.join(", ") || "(any)"}.`;

  const finalPrompt = `<SYSTEM>\n${systemPrompt}\n</SYSTEM>\n\n<INTENT>\n${JSON.stringify(intent, null, 2)}\n</INTENT>\n\n<RETRIEVED>\n${contextBlock || "(no chunks)"}\n</RETRIEVED>\n\n<USER>\n${query || "(no free-text query)"}\n</USER>\n\n<OUTPUT>\nTitle: ${look.title}\nFit: ${look.fitScore}%\nTotal: ₹${look.total} of ₹${look.budget}\nRationale: ${look.rationale}\n</OUTPUT>`;

  return {
    query: query || "(no free-text query)",
    intent: buildAIIntentFromLook(intent),
    systemPrompt,
    intentMessages: [],
    retrievalSql: `(client-side rule engine — ROOM_BUNDLES["${intent.room}"] filtered by constraints, scored by overlap, greedy per-category pick within budget ₹${intent.budget})`,
    scoringFormula: `Rule-based curator: per-item score = style overlap + room match + constraint overlap (greedy pick per category within budget).`,
    chunks,
    finalPrompt,
    generatedAt: new Date().toISOString(),
  };
}
