
CREATE TABLE public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL,
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  color_tags TEXT[] NOT NULL DEFAULT '{}',
  room_tags TEXT[] NOT NULL DEFAULT '{}',
  constraints TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  embedding_text TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '',
  bg TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are publicly readable"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX products_category_idx ON public.products(category);
CREATE INDEX products_room_tags_idx ON public.products USING GIN(room_tags);
CREATE INDEX products_constraints_idx ON public.products USING GIN(constraints);
