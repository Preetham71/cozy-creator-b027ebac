import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sparkles, Mic, MicOff, ArrowRight, ChevronDown, ShoppingBag, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAdmin } from "@/lib/admin";
import { useTemperature } from "@/lib/temperature";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShopMind — AI home decor stylist" },
      { name: "description", content: "An AI shopping assistant for home decor. Describe your vibe, find your pieces." },
    ],
  }),
  component: Index,
});

const EXAMPLES = [
  "Warm cozy reading corner under 1500",
  "Modern minimalist balcony with plants",
  "Renter-friendly lighting for a dark study",
  "Boho chic living room with earth tones",
];

function Index() {
  const navigate = useNavigate();
  const isAdmin = useAdmin();
  const [adminView, setAdminView] = useState(false);
  useEffect(() => { if (isAdmin) setAdminView(true); }, [isAdmin]);
  const [temperature, setTemperature] = useTemperature();
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const recogRef = useRef<any>(null);
  const { totalItems, items, clearCart, setIsCartOpen } = useCart();

  useEffect(() => {
    setIsLoaded(true);
    const W: any = window;
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-IN";
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setQuery(t);
    };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); toast.error("Couldn't hear you — try again"); };
    recogRef.current = r;
  }, []);

  const toggleMic = () => {
    if (!recogRef.current) { toast.error("Voice input isn't supported in this browser"); return; }
    if (listening) { recogRef.current.stop(); return; }
    try { recogRef.current.start(); setListening(true); } catch { /* already started */ }
  };

  const submit = (q?: string) => {
    const finalQ = (q ?? query).trim();
    if (!finalQ) return;
    navigate({ to: "/chat", search: { q: finalQ } });
  };

  const handleClearCart = () => {
    if (window.confirm("Are you sure you want to clear your cart?")) {
      clearCart();
      toast.success("Cart cleared");
    }
  };

  return (
    <div className={`relative min-h-screen overflow-hidden bg-background transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`}>
      {/* Dynamic Background */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[70vh] bg-[radial-gradient(ellipse_at_top,_color-mix(in_oklab,_var(--terracotta)_20%,_transparent),_transparent_70%)] transition-all duration-1000 animate-pulse" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6 translate-y-0 transition-transform duration-500">
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground group-hover:rotate-12 transition-transform">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-display text-xl tracking-tight">ShopMind</span>
        </div>
        <div className="flex items-center gap-4">
          {items.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs text-muted-foreground hover:text-destructive transition-colors gap-2 rounded-full"
              onClick={handleClearCart}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear Cart
            </Button>
          )}
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border border-border">
              <Switch checked={adminView} onCheckedChange={setAdminView} />
              <span className="font-medium">{adminView ? "Admin" : "User"}</span>
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl flex-col items-center px-6 pb-24 pt-16 sm:pt-24">
        <div className="animate-in slide-in-from-bottom duration-700">
          <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] uppercase tracking-widest text-primary font-medium backdrop-blur">
            Intent-Aware Shopping
          </span>
        </div>
        
        <h1 className="mt-6 text-center font-display text-5xl leading-[1.05] text-foreground sm:text-7xl animate-in slide-in-from-bottom duration-700 delay-100">
          Shop your <span className="italic text-primary">vibe,</span>
          <br />
          not just keywords.
        </h1>
        
        <p className="mt-6 max-w-md text-center text-base leading-relaxed text-muted-foreground animate-in slide-in-from-bottom duration-700 delay-200">
          Describe what you need in plain English. We'll handle the filters, constraints, and styling.
        </p>

        <div className="mt-12 w-full animate-in zoom-in duration-700 delay-300">
          <div className="group relative rounded-3xl border border-border bg-card/90 p-2 shadow-2xl shadow-primary/5 backdrop-blur transition-all focus-within:ring-2 focus-within:ring-primary/20">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="e.g. something warm but not bulky for my reading nook under ₹1500"
              className="min-h-[100px] resize-none border-0 bg-transparent text-lg leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
            />
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <button
                type="button"
                onClick={toggleMic}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all ${
                  listening ? "bg-destructive text-destructive-foreground scale-105 animate-pulse" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {listening ? "I'm listening..." : "Use Voice"}
              </button>
              <Button
                size="lg"
                className="rounded-full px-8 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-0.5 active:translate-y-0"
                onClick={() => submit()}
                disabled={!query.trim()}
              >
                Find Matches <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-2 animate-in slide-in-from-bottom duration-700 delay-500">
            <span className="w-full text-center text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Try these intents</span>
            {EXAMPLES.map((c) => (
              <button
                key={c}
                onClick={() => submit(c)}
                className="rounded-full border border-border bg-background/50 px-4 py-2 text-xs text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95"
              >
                "{c}"
              </button>
            ))}
          </div>

          {adminView && (
            <div className="mt-12 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-5 animate-in fade-in zoom-in duration-700">
              <Collapsible defaultOpen={true}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Info className="h-4 w-4" />
                    <span className="font-semibold uppercase tracking-widest text-[10px]">Admin Intelligence Dashboard</span>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <Label className="text-xs font-medium">LLM Temperature (Creativity vs. Precision)</Label>
                      <Badge variant="outline" className="font-mono text-primary bg-background">{temperature.toFixed(2)}</Badge>
                    </div>
                    <Slider
                      value={[temperature]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={(v) => setTemperature(v[0] ?? 0)}
                      className="py-2"
                    />
                    <div className="grid grid-cols-2 gap-4 text-[10px] text-muted-foreground pt-1">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-primary/70">LOW (0.1 - 0.3)</span>
                        <span>Best for Intent Parsing & Strict Filtering. Deterministic output.</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-primary/70">HIGH (0.7 - 0.9)</span>
                        <span>Best for Stylist Explanations & Discovery. Natural tone.</span>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </main>
      
      {/* Footer Info */}
      <footer className="absolute bottom-8 left-0 right-0 z-10 flex justify-center animate-in fade-in duration-1000 delay-700">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 font-medium">
          ShopMind — Driven by Real-Time Intent Analysis
        </p>
      </footer>
    </div>
  );
}
