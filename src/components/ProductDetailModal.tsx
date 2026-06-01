import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProductImage } from "./ProductImage";
import type { Product } from "@/lib/products";
import { Star, Truck, Tag, Package, Palette, Ruler, ThumbsUp, ThumbsDown, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

export function ProductDetailModal({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addItem } = useCart();
  if (!product) return null;
  const p = product;
  const rating = p.rating ?? 4.2;
  const count = p.reviewCount ?? 0;
  const discount = p.discountPct ?? 0;
  const mrp = discount > 0 ? Math.round(p.price / (1 - discount / 100)) : null;

  const handleAddToCart = () => {
    addItem(p);
    toast.success(`${p.name} added to cart`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 sm:rounded-2xl">
        <ScrollArea className="max-h-[85vh]">
          <div className="grid gap-0 md:grid-cols-[1fr_1.1fr]">
            <ProductImage product={p} className="h-64 w-full md:h-full md:min-h-[420px]" />
            <div className="flex flex-col gap-4 p-6">
              <DialogHeader className="space-y-1">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {p.category} · {p.brand || "ShopMind"}
                </div>
                <DialogTitle className="font-display text-2xl leading-tight">{p.name}</DialogTitle>
              </DialogHeader>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <Star className="h-3.5 w-3.5 fill-current" /> {rating.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">{count.toLocaleString("en-IN")} reviews</span>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl text-foreground">₹{p.price.toLocaleString("en-IN")}</span>
                {mrp && (
                  <>
                    <span className="text-sm text-muted-foreground line-through">₹{mrp.toLocaleString("en-IN")}</span>
                    <Badge className="rounded-full bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                      {discount}% off
                    </Badge>
                  </>
                )}
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/50 p-4 text-xs">
                <Spec icon={<Package className="h-3.5 w-3.5" />} label="Material" value={p.material || "—"} />
                <Spec icon={<Ruler className="h-3.5 w-3.5" />} label="Sizes" value={(p.sizes ?? []).join(", ") || "Standard"} />
                <Spec icon={<Palette className="h-3.5 w-3.5" />} label="Colors" value={(p.colorsAvailable ?? p.colorTags).slice(0, 4).join(", ") || "—"} />
                <Spec icon={<Truck className="h-3.5 w-3.5" />} label="Delivery" value={`${p.deliveryDays ?? 5} days`} />
                <Spec icon={<Tag className="h-3.5 w-3.5" />} label="Brand" value={p.brand || "ShopMind"} />
                <Spec icon={<Star className="h-3.5 w-3.5" />} label="Style" value={p.styleTags.slice(0, 3).join(", ")} />
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Tags</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...p.styleTags, ...p.constraints].slice(0, 8).map(t => (
                    <Badge key={t} variant="outline" className="rounded-full text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>

              <ReviewBlock title="What people love" tone="positive" items={p.reviews?.positive ?? []} />
              <ReviewBlock title="What to watch out for" tone="critical" items={p.reviews?.critical ?? []} />

              <div className="mt-2 flex gap-2">
                <Button className="flex-1 rounded-full" onClick={handleAddToCart}>
                  <ShoppingCart className="mr-2 h-4 w-4" /> Add to cart
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">{icon} {label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function ReviewBlock({ title, tone, items }: { title: string; tone: "positive" | "critical"; items: string[] }) {
  if (!items.length) return null;
  const Icon = tone === "positive" ? ThumbsUp : ThumbsDown;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3 w-3" /> {title}
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((r, i) => (
          <li key={i} className="rounded-lg bg-accent/30 px-3 py-2 text-xs leading-relaxed text-foreground">"{r}"</li>
        ))}
      </ul>
    </div>
  );
}
