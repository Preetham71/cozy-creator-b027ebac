import type { Product } from "@/lib/products";

export function ProductImage({ product, className = "" }: { product: Product; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${product.bg} 0%, color-mix(in oklab, ${product.bg} 70%, #fff) 100%)` }}
    >
      <img
        src={product.imageUrl}
        alt={product.name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
