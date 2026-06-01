import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { ProductImage } from "@/components/ProductImage";
import { ProductDetailModal } from "@/components/ProductDetailModal";
import { DebugPanel } from "@/components/DebugPanel";
import { analyzeIntent, type Intent, type Clarification } from "@/lib/intent.functions";
import { ragQuery, type RagResult } from "@/lib/rag.functions";
import type { Product } from "@/lib/products";
import { ArrowLeft, Send, Sparkles, SlidersHorizontal, Loader2, Mic, MicOff, Star, ChevronDown, ShoppingBag, LayoutDashboard, Plus, Minus, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useAdmin } from "@/lib/admin";
import { useTemperature } from "@/lib/temperature";
import { useCart } from "@/lib/cart";

type ScoredProduct = Product & { similarity: number };
type Search = { q?: string };

export const Route = createFileRoute("/chat")({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: (s.q as string) || "" }),
  head: () => ({
    meta: [
      { title: "ShopMind · Your results" },
      { name: "description", content: "AI-curated home decor results based on your query." },
    ],
  }),
  component: ChatPage,
});

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; intent: Intent; rag: RagResult | null };

function ChatPage() {
  const { q: initialQ } = Route.useSearch();
  const analyze = useServerFn(analyzeIntent);
  const runRag = useServerFn(ragQuery);
  const isAdmin = useAdmin();
  const [adminView, setAdminView] = useState(false);
  useEffect(() => { if (isAdmin) setAdminView(true); }, [isAdmin]);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [temperature, setTemperature] = useTemperature();
  const temperatureRef = useRef(temperature);
  useEffect(() => { temperatureRef.current = temperature; }, [temperature]);
  const [rerunning, setRerunning] = useState(false);
  const [filters, setFilters] = useState<{ maxPrice: number | null; colors: string[]; styles: string[] }>({
    maxPrice: null, colors: [], styles: [],
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const startedRef = useRef(false);
  const { totalItems, setIsCartOpen } = useCart();

  const lastAssistant = useMemo(
    () => [...turns].reverse().find((t): t is Extract<Turn, { role: "assistant" }> => t.role === "assistant"),
    [turns]
  );
  const allProductsLast: ScoredProduct[] = useMemo(() => {
    if (!lastAssistant?.rag) return [];
    return [...lastAssistant.rag.topProducts, ...lastAssistant.rag.additionalProducts];
  }, [lastAssistant]);
  const lastUserQuery = useMemo(
    () => [...turns].reverse().find((t): t is Extract<Turn, { role: "user" }> => t.role === "user")?.content ?? "",
    [turns]
  );
  const userTurnCount = turns.filter(t => t.role === "user").length;
  const showFilters = userTurnCount >= 2 && allProductsLast.length > 0;

  const ask = async (text: string) => {
    if (!text.trim() || pending) return;
    const userTurn: Turn = { role: "user", content: text.trim() };
    const history: { role: "user" | "assistant"; content: string }[] = turns.map(t =>
      t.role === "user"
        ? { role: "user", content: t.content }
        : { role: "assistant", content: t.intent.summary }
    );
    setTurns(prev => [...prev, userTurn]);
    setInput("");
    setPending(true);
    try {
      const [intent, rag] = await Promise.all([
        analyze({ data: { query: text.trim(), history } }),
        runRag({ data: { query: text.trim(), temperature: temperatureRef.current } }).catch(() => null),
      ]);
      setTurns(prev => [...prev, { role: "assistant", intent, rag: intent.inDomain ? rag : null }]);
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong");
      setTurns(prev => prev.slice(0, -1));
    } finally {
      setPending(false);
    }
  };

  const rerunWithTemperature = async () => {
    if (!lastUserQuery || rerunning || pending) return;
    setRerunning(true);
    try {
      const rag = await runRag({ data: { query: lastUserQuery, temperature: temperatureRef.current } });
      setTurns(prev => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const t = prev[i];
          if (t.role === "assistant") {
            const next = [...prev];
            next[i] = { ...t, rag };
            return next;
          }
        }
        return prev;
      });
    } catch (e: any) {
      toast.error(e.message ?? "Re-run failed");
    } finally {
      setRerunning(false);
    }
  };

  // Run initial query once
  useEffect(() => {
    if (startedRef.current) return;
    if (initialQ) { startedRef.current = true; void ask(initialQ); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  // Voice input
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  useEffect(() => {
    const W: any = window;
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = false; r.interimResults = true; r.lang = "en-IN";
    r.onresult = (e: any) => setInput(Array.from(e.results).map((x: any) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
  }, []);
  const toggleMic = () => {
    if (!recogRef.current) { toast.error("Voice not supported in this browser"); return; }
    if (listening) recogRef.current.stop();
    else { try { recogRef.current.start(); setListening(true); } catch { /* */ } }
  };

  // Filter helper
  const applyFilters = (list: ScoredProduct[]) => {
    let out = list;
    if (filters.maxPrice) out = out.filter(p => p.price <= filters.maxPrice!);
    if (filters.colors.length)
      out = out.filter(p => filters.colors.some(c => p.colorTags.some(t => t.toLowerCase().includes(c.toLowerCase()))));
    if (filters.styles.length)
      out = out.filter(p => filters.styles.some(s => p.styleTags.includes(s)));
    return out;
  };

  const availableColors = useMemo(() => {
    const s = new Set<string>();
    allProductsLast.forEach(p => p.colorTags.forEach(c => s.add(c)));
    return Array.from(s).slice(0, 12);
  }, [allProductsLast]);
  const availableStyles = useMemo(() => {
    const s = new Set<string>();
    allProductsLast.forEach(p => p.styleTags.forEach(c => s.add(c)));
    return Array.from(s).slice(0, 10);
  }, [allProductsLast]);

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[30vh] bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklab,_var(--terracotta)_12%,_transparent),_transparent_70%)]" />

      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> 
            <span className="hidden sm:inline">New search</span>
          </Link>
          
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-display text-lg tracking-tight">ShopMind</span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-accent/50 text-foreground transition-all hover:scale-110 active:scale-95 cursor-pointer"
            >
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-in zoom-in">
                  {totalItems}
                </span>
              )}
            </button>

            {isAdmin && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="sm" variant="outline" className="rounded-full bg-primary/5 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                    <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" /> Intelligence
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader className="mb-6">
                    <SheetTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" /> Admin Controls
                    </SheetTitle>
                  </SheetHeader>
                  <div className="space-y-8">
                    <div className="flex items-center justify-between bg-muted/50 p-4 rounded-2xl border border-border">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold">Admin View</Label>
                        <p className="text-[10px] text-muted-foreground">Toggle internal AI data overlays</p>
                      </div>
                      <Switch checked={adminView} onCheckedChange={setAdminView} />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-primary">
                        <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold">LLM Parameters</span>
                      </div>
                      <TemperaturePanel
                        value={temperature}
                        onChange={setTemperature}
                        onRerun={rerunWithTemperature}
                        rerunning={rerunning}
                        canRerun={!!lastUserQuery && !pending}
                      />
                    </div>

                    {lastAssistant?.intent && lastUserQuery && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                          <span className="text-[10px] uppercase tracking-[0.2em] font-bold">Retrieval Analysis</span>
                        </div>
                        <DebugPanel query={lastUserQuery} intent={lastAssistant.intent} label="View Full Debug Report" />
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            )}

            {showFilters ? (
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" variant="outline" className="rounded-full hover:border-primary/50 transition-colors">
                    <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Filters
                  </Button>
                </SheetTrigger>
                <FilterSheet
                  colors={availableColors}
                  styles={availableStyles}
                  filters={filters}
                  setFilters={setFilters}
                />
              </Sheet>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-40 pt-8">
        <div className="space-y-8">
          {turns.map((t, i) => t.role === "user" ? (
            <UserBubble key={i} text={t.content} />
          ) : (
            <AssistantTurn
              key={i}
              intent={t.intent}
              rag={t.rag}
              isLatest={i === turns.length - 1}
              adminView={adminView}
              applyFilters={applyFilters}
              onClarify={(answer) => ask(answer)}
              onSelect={(p) => setSelected(p)}
            />
          ))}

          {pending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}

          {adminView && lastAssistant && (
            <TemperaturePanel
              value={temperature}
              onChange={setTemperature}
              onRerun={rerunWithTemperature}
              rerunning={rerunning}
              canRerun={!!lastUserQuery && !pending}
            />
          )}
        </div>
      </main>

      {/* Composer */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-2 px-6 py-4">
          <div className="flex-1 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input); }
              }}
              placeholder={pending ? "Working…" : "Refine your search or ask for something else…"}
              className="min-h-[44px] resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
              disabled={pending}
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <button
                type="button"
                onClick={toggleMic}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${
                  listening ? "text-destructive" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {listening ? "Listening" : "Speak"}
              </button>
              <Button size="sm" className="rounded-full" onClick={() => void ask(input)} disabled={pending || !input.trim()}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ProductDetailModal product={selected} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({
  intent, rag, isLatest, adminView, applyFilters, onClarify, onSelect,
}: {
  intent: Intent;
  rag: RagResult | null;
  isLatest: boolean;
  adminView: boolean;
  applyFilters: (list: ScoredProduct[]) => ScoredProduct[];
  onClarify: (answer: string) => void;
  onSelect: (p: Product) => void;
}) {
  // Out of domain
  if (!intent.inDomain) {
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <p className="font-display text-lg text-foreground">Sorry, we do not have what you are looking for.</p>
        <p className="mt-1 text-sm text-muted-foreground">ShopMind only covers home decor. Try asking about lamps, rugs, cushions, curtains, plants, and more.</p>
      </div>
    );
  }

  const topMatches = applyFilters(rag?.topProducts ?? []);
  const additional = applyFilters(rag?.additionalProducts ?? []);
  const hasAnything = topMatches.length + additional.length > 0;

  return (
    <div className="space-y-5">
      {/* AI response */}
      <div className="flex items-start gap-3">
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 space-y-3">
          {rag?.aiResponse ? (
            <p className="text-sm leading-relaxed text-foreground">{rag.aiResponse}</p>
          ) : (
            <p className="text-sm leading-relaxed text-foreground">{intent.summary}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {intent.primaryCategory && <Badge className="rounded-full" variant="default">{intent.primaryCategory}</Badge>}
            {intent.attributes.budgetMax && (
              <Badge variant="secondary" className="rounded-full">≤ ₹{intent.attributes.budgetMax.toLocaleString("en-IN")}</Badge>
            )}
            {[...intent.attributes.colors, ...intent.attributes.styles, ...intent.attributes.rooms, ...intent.attributes.constraints]
              .slice(0, 6).map(t => (
                <Badge key={t} variant="outline" className="rounded-full">{t}</Badge>
              ))}
          </div>
        </div>
      </div>

      {/* Clarifications */}
      {isLatest && intent.clarifications.length > 0 && (
        <div className="rounded-2xl border border-border bg-accent/30 p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">A couple of quick questions</p>
          <div className="mt-3 space-y-3">
            {intent.clarifications.map((c, idx) => (
              <ClarifyRow key={idx} clarification={c} onPick={onClarify} />
            ))}
          </div>
        </div>
      )}

      {/* Top Matches */}
      {topMatches.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-xl text-foreground">Top Matches</h2>
            <span className="text-xs text-muted-foreground">Top {topMatches.length} by semantic similarity</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topMatches.map(p => (
              <ResultCard key={p.id} product={p} intent={intent} onSelect={() => onSelect(p)} />
            ))}
          </div>
        </section>
      )}

      {/* Additional Results */}
      {additional.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-lg text-foreground">Additional Results</h2>
            <span className="text-xs text-muted-foreground">{additional.length} more</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {additional.map(p => (
              <ResultCard key={p.id} product={p} intent={intent} onSelect={() => onSelect(p)} />
            ))}
          </div>
        </section>
      )}

      {rag && !hasAnything && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No matches with these filters. Try loosening them or asking a different way.
        </p>
      )}

      {/* Admin: prompt structure */}
      {adminView && rag && <AdminPromptPanel rag={rag} />}
    </div>
  );
}

function AdminPromptPanel({ rag }: { rag: RagResult }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between text-left">
            <span className="font-semibold uppercase tracking-widest text-muted-foreground">Admin · Prompt structure & retrieval</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-5">
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">System Prompt</h3>
            <pre className="whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">{rag.prompt.system}</pre>
          </div>
          <div className="border-t border-border" />
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Retrieved Context (top {rag.topChunks.length})</h3>
            <div className="space-y-3">
              {rag.topChunks.map((c, i) => (
                <div key={c.id} className="rounded-md bg-background p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold text-foreground">Chunk {i + 1}</span>
                    <Badge variant="secondary" className="rounded-full font-mono text-[10px]">
                      similarity: {c.similarity.toFixed(4)}
                    </Badge>
                  </div>
                  <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{c.content}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">product_id: {c.productId}</p>
                </div>
              ))}
            </div>
          </div>
          {rag.chunks.length > rag.topChunks.length && (
            <details className="rounded-md bg-background p-3">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                All retrieved chunks ({rag.chunks.length}) — full ranking
              </summary>
              <div className="mt-2 space-y-1.5">
                {rag.chunks.map((c, i) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 border-t border-border/60 pt-1.5 first:border-t-0 first:pt-0">
                    <span className="font-mono text-[10px] text-muted-foreground">#{i + 1}</span>
                    <span className="flex-1 line-clamp-1 text-[11px] text-foreground">{c.content}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.similarity.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="border-t border-border" />
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">User Question</h3>
            <pre className="whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-[11px] text-foreground">{rag.prompt.userQuery}</pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}


function ClarifyRow({ clarification, onPick }: { clarification: Clarification; onPick: (answer: string) => void }) {
  return (
    <div>
      <p className="text-sm text-foreground">{clarification.question}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {clarification.suggestions.map(s => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// Determine which attributes are most relevant to surface in hover preview,
// based on what the user asked about in their query/intent.
function prioritizedFields(intent: Intent): Array<"material" | "size" | "style" | "price" | "colors" | "room"> {
  const a = intent.attributes;
  const out: Array<"material" | "size" | "style" | "price" | "colors" | "room"> = [];
  if (a.materials.length) out.push("material");
  if (a.size) out.push("size");
  if (a.styles.length) out.push("style");
  if (a.budgetMax) out.push("price");
  if (a.colors.length) out.push("colors");
  if (a.rooms.length) out.push("room");
  // Fill in remaining defaults
  for (const f of ["material", "size", "style", "price", "colors", "room"] as const) {
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, 6);
}

function ResultCard({
  product,
  intent,
  onSelect,
}: {
  product: ScoredProduct;
  intent: Intent;
  onSelect: () => void;
}) {
  const rating = product.rating ?? 4.2;
  const count = product.reviewCount ?? 0;
  const discount = product.discountPct ?? 0;
  const fields = prioritizedFields(intent);
  const { addItem, getItemQuantity, updateQuantity } = useCart();
  const quantity = getItemQuantity(product.id);

  const fieldValue = (f: typeof fields[number]) => {
    switch (f) {
      case "material": return product.material || "Mixed materials";
      case "size":     return (product.sizes ?? []).join(" / ") || "Standard";
      case "style":    return product.styleTags.slice(0, 3).join(", ") || "—";
      case "price":    return `₹${product.price.toLocaleString("en-IN")}`;
      case "colors":   return (product.colorsAvailable ?? product.colorTags).slice(0, 3).join(", ");
      case "room":     return product.roomTags.slice(0, 2).join(", ") || "Versatile";
    }
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(product);
    toast.success(`${product.name} added to cart`);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateQuantity(product.id, quantity - 1);
    if (quantity === 1) toast.info(`${product.name} removed from cart`);
  };

  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <ProductImage product={product} className="h-40 w-full" />
          
          {discount > 0 && (
            <span className="absolute left-3 top-3 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
              {discount}% off
            </span>
          )}
          
          <div className="flex flex-1 flex-col gap-2 p-4 pb-14">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{product.category}</div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-base leading-tight text-foreground">{product.name}</h3>
              <div className="font-display text-base text-foreground">₹{product.price.toLocaleString("en-IN")}</div>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{product.description}</p>
            <div className="mt-auto flex items-end justify-between gap-2 pt-2">
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="rounded-full font-mono text-[10px]">
                  {(product.similarity * 100).toFixed(1)}% match
                </Badge>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <Star className="h-3 w-3 fill-current" />
                {rating.toFixed(1)}
                <span className="text-muted-foreground">({count.toLocaleString("en-IN")})</span>
              </span>
            </div>
          </div>

          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            {quantity > 0 ? (
              <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full p-0.5 animate-in slide-in-from-left duration-300">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full hover:bg-primary/20 text-primary"
                  onClick={handleRemove}
                >
                  {quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                </Button>
                <span className="font-bold text-xs text-primary min-w-[1rem] text-center">{quantity}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full hover:bg-primary/20 text-primary"
                  onClick={handleAdd}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : <div />}
            
            <Button
              size="sm"
              variant="outline"
              className={`h-8 rounded-full border-primary/20 bg-background/80 backdrop-blur-sm text-primary hover:bg-primary hover:text-primary-foreground transition-all gap-1.5 shadow-sm px-3 ${quantity > 0 ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'}`}
              onClick={handleAdd}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-tight">Add</span>
            </Button>
          </div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72 p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Quick view</div>
          <div className="mt-0.5 font-display text-sm leading-tight text-foreground">{product.name}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Star className="h-3 w-3 fill-current" /> {rating.toFixed(1)}
            </span>
            · {count.toLocaleString("en-IN")} reviews · {product.brand || "ShopMind"}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-xs">
          {fields.map(f => (
            <div key={f} className="flex flex-col">
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{f}</dt>
              <dd className="line-clamp-2 text-foreground">{fieldValue(f)}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Click for full details
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function FilterSheet({
  colors, styles, filters, setFilters,
}: {
  colors: string[];
  styles: string[];
  filters: { maxPrice: number | null; colors: string[]; styles: string[] };
  setFilters: (f: { maxPrice: number | null; colors: string[]; styles: string[] }) => void;
}) {
  const toggle = (key: "colors" | "styles", v: string) => {
    const next = filters[key].includes(v) ? filters[key].filter(x => x !== v) : [...filters[key], v];
    setFilters({ ...filters, [key]: next });
  };
  return (
    <SheetContent className="w-full sm:max-w-sm">
      <SheetHeader>
        <SheetTitle>Refine results</SheetTitle>
      </SheetHeader>
      <div className="mt-6 space-y-6 px-1">
        <div>
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">Max price (₹)</Label>
          <Input
            type="number"
            value={filters.maxPrice ?? ""}
            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="No limit"
            className="mt-2"
          />
        </div>
        {colors.length > 0 && (
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Colors</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => toggle("colors", c)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    filters.colors.includes(c) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"
                  }`}
                >{c}</button>
              ))}
            </div>
          </div>
        )}
        {styles.length > 0 && (
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Styles</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {styles.map(c => (
                <button
                  key={c}
                  onClick={() => toggle("styles", c)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    filters.styles.includes(c) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent/40"
                  }`}
                >{c}</button>
              ))}
            </div>
          </div>
        )}
        <Button variant="ghost" className="w-full" onClick={() => setFilters({ maxPrice: null, colors: [], styles: [] })}>
          Clear filters
        </Button>
      </div>
    </SheetContent>
  );
}

const TEMP_DEFAULTS: { feature: string; range: string; reason: string }[] = [
  { feature: "Retrieval / Product Matching", range: "0.2 – 0.3", reason: "Deterministic, highly relevant ranking from embeddings + similarity scores." },
  { feature: "Query Understanding / Intent", range: "0.1 – 0.2", reason: "Prevents variation in structured extraction; consistent interpretation." },
  { feature: "Recommendation Explanations", range: "0.6 – 0.7", reason: "Natural, human-like rationale while staying grounded in retrieved context." },
  { feature: "General Conversational Responses", range: "0.4 – 0.5", reason: "Balanced readability and coherence without excessive randomness." },
  { feature: "Debug / System Outputs", range: "0.0 – 0.1", reason: "Fully deterministic output required for evaluation and reproducibility." },
];

function TemperaturePanel({
  value,
  onChange,
  onRerun,
  rerunning,
  canRerun,
}: {
  value: number;
  onChange: (v: number) => void;
  onRerun?: () => void;
  rerunning?: boolean;
  canRerun?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between text-left">
            <span className="font-semibold uppercase tracking-widest text-muted-foreground">
              Admin · LLM temperature
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Current temperature</h3>
            <div className="flex items-center gap-4">
              <Slider
                value={[value]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={(v) => onChange(v[0] ?? 0)}
                className="flex-1"
              />
              <Badge variant="secondary" className="rounded-full font-mono">
                {value.toFixed(2)}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Sent to the LLM on the next query. Click <strong>Re-run</strong> to apply this temperature to the current results without retyping.
            </p>
            {onRerun && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={onRerun}
                  disabled={!canRerun || rerunning}
                >
                  {rerunning ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Re-running…</> : "Re-run with this temperature"}
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-border" />

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Feature-wise defaults</h3>
            <div className="space-y-3">
              {TEMP_DEFAULTS.map((d) => (
                <div key={d.feature} className="rounded-md bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-foreground">{d.feature}</span>
                    <Badge variant="outline" className="rounded-full font-mono text-[10px]">{d.range}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{d.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
