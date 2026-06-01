import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Product } from "./products";

type DbRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  style_tags: string[];
  color_tags: string[];
  room_tags: string[];
  constraints: string[];
  description: string;
  embedding_text: string;
  image_url: string;
  bg: string;
  brand?: string;
  material?: string;
  sizes?: string[];
  colors_available?: string[];
  delivery_days?: number;
  discount_pct?: number;
  rating?: number | string;
  review_count?: number;
  reviews?: { positive?: string[]; critical?: string[] } | null;
};

export const toProduct = (r: DbRow): Product => ({
  id: r.id,
  name: r.name,
  category: r.category,
  price: r.price,
  styleTags: r.style_tags ?? [],
  colorTags: r.color_tags ?? [],
  roomTags: r.room_tags ?? [],
  constraints: r.constraints ?? [],
  description: r.description ?? "",
  embeddingText: r.embedding_text ?? "",
  imageUrl: r.image_url ?? "https://placehold.co/600x600?text=Product",
  bg: r.bg ?? "#eee",
  brand: r.brand ?? "",
  material: r.material ?? "",
  sizes: r.sizes ?? [],
  colorsAvailable: r.colors_available ?? [],
  deliveryDays: r.delivery_days ?? 5,
  discountPct: r.discount_pct ?? 0,
  rating: typeof r.rating === "string" ? parseFloat(r.rating) : (r.rating ?? 4.2),
  reviewCount: r.review_count ?? 0,
  reviews: {
    positive: r.reviews?.positive ?? [],
    critical: r.reviews?.critical ?? [],
  },
});

export const getProducts = createServerFn({ method: "GET" }).handler(async (): Promise<Product[]> => {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .order("category", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbRow[]).map(toProduct);
});
