import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductImage } from "./ProductImage";
import type { ScoredProduct } from "@/lib/rag";
import { Shuffle, ShoppingCart, Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

export function ProductCard({
  item,
  onSwap,
}: {
  item: ScoredProduct;
  onSwap?: () => void;
}) {
  const p = item.product;
  const matchTags = p.constraints.slice(0, 3);
  const { addItem, getItemQuantity } = useCart();
  const quantity = getItemQuantity(p.id);

  const handleAddToCart = () => {
    addItem(p);
    toast.success(`${p.name} added to cart`);
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:shadow-lg hover:shadow-primary/5 relative">
      <ProductImage product={p} className="h-44 w-full" />
      
      {quantity > 0 && (
        <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground font-bold rounded-full h-6 w-6 flex items-center justify-center p-0 animate-in zoom-in">
          {quantity}
        </Badge>
      )}

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{p.category}</div>
            <h3 className="mt-1 font-display text-lg leading-tight text-foreground">{p.name}</h3>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className="font-display text-lg text-foreground">₹{p.price.toLocaleString("en-IN")}</div>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-full border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-all"
              onClick={handleAddToCart}
              aria-label="Add to cart"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{item.reason}</p>

        <div className="flex flex-wrap gap-1.5">
          {matchTags.map(t => (
            <Badge key={t} variant="secondary" className="rounded-full bg-accent/60 text-[10px] font-medium tracking-wide text-accent-foreground">
              {t}
            </Badge>
          ))}
        </div>

        <div className="mt-auto flex gap-2 pt-2">
          <Button
            size="sm"
            className="flex-1 rounded-full"
            onClick={handleAddToCart}
          >
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Add to cart
          </Button>
          {onSwap && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={onSwap} aria-label="Swap item">
              <Shuffle className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
