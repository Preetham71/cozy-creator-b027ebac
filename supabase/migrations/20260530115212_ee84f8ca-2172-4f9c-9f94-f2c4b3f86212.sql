
-- 1. Add columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS material text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sizes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS colors_available text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS delivery_days int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS discount_pct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating numeric(3,2) NOT NULL DEFAULT 4.20,
  ADD COLUMN IF NOT EXISTS review_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviews jsonb NOT NULL DEFAULT '{"positive":[],"critical":[]}'::jsonb;

-- 2. Deterministic population using hash of id
WITH brand_pool AS (
  SELECT ARRAY['Nestasia','Ellementry','Fabindia','Chumbak','The Decor Kart','Pure Home','Address Home','House This','Ivory & Iron','Studio Pepperfry'] AS brands
),
positives AS (
  SELECT ARRAY[
    'Excellent build quality and finishing.',
    'Color matches the photos exactly.',
    'Looks far more premium than the price.',
    'Arrived well packaged and on time.',
    'Soft, durable and easy to clean.',
    'Adds instant warmth to the room.',
    'Sturdy construction, no wobble at all.',
    'Beautiful texture in natural light.',
    'Exact dimensions as listed.',
    'Lovely subtle finish — not loud at all.'
  ] AS p
),
criticals AS (
  SELECT ARRAY[
    'Slightly smaller than expected.',
    'Color is a touch lighter than the photo.',
    'Material feels thinner than advertised.',
    'Assembly instructions could be clearer.',
    'Packaging was minimal for a fragile item.',
    'Slight color variation between batches.',
    'Shade looks bolder in person.',
    'Edges could be finished better.',
    'Took longer to deliver than promised.',
    'Care label info is missing.'
  ] AS c
)
UPDATE public.products p
SET
  brand = (SELECT brands[1 + (abs(hashtext(p.id)) % 10)] FROM brand_pool),
  material = COALESCE(NULLIF(
    CASE
      WHEN p.category = 'Lighting'      THEN 'Metal, fabric shade'
      WHEN p.category = 'Rugs'          THEN COALESCE(NULLIF(p.color_tags[1],''),'Natural') || ' jute / cotton blend'
      WHEN p.category = 'Cushions'      THEN 'Linen cover, polyfill insert'
      WHEN p.category = 'Throws'        THEN 'Cotton / wool blend'
      WHEN p.category = 'Curtains'      THEN 'Linen-look polyester'
      WHEN p.category = 'Wall decor'    THEN 'Wood frame, archival print'
      WHEN p.category = 'Mirrors'       THEN 'MDF frame, glass'
      WHEN p.category = 'Storage'       THEN 'Seagrass / fabric'
      WHEN p.category = 'Shelves'       THEN 'Solid mango wood'
      WHEN p.category = 'Side tables'   THEN 'Mango wood, iron base'
      WHEN p.category = 'Plants'        THEN 'Live plant, ceramic pot'
      WHEN p.category = 'Decor accents' THEN 'Mixed natural materials'
      ELSE 'Mixed materials'
    END, ''), 'Mixed materials'),
  sizes = CASE
    WHEN p.category IN ('Rugs','Curtains','Throws') THEN ARRAY['S','M','L']
    WHEN p.category IN ('Cushions') THEN ARRAY['16x16','18x18','20x20']
    WHEN p.category IN ('Mirrors','Wall decor','Shelves','Side tables') THEN ARRAY['Standard']
    ELSE ARRAY['One size']
  END,
  colors_available = (
    SELECT ARRAY(SELECT DISTINCT unnest(p.color_tags || ARRAY['beige','charcoal']))
  ),
  delivery_days = 3 + (abs(hashtext(p.id || 'd')) % 8),
  discount_pct  = CASE WHEN abs(hashtext(p.id || 'x')) % 3 = 0 THEN 10 + (abs(hashtext(p.id || 'y')) % 21) ELSE 0 END,
  review_count  = 40 + (abs(hashtext(p.id || 'r')) % 4800),
  rating        = ROUND((3.6 + ((abs(hashtext(p.id || 's')) % 140) / 100.0))::numeric, 2),
  reviews       = jsonb_build_object(
    'positive', to_jsonb(ARRAY[
      (SELECT p2 FROM positives, LATERAL (SELECT p[1 + (abs(hashtext(p.id || 'p1')) % 10)] AS p2) s),
      (SELECT p2 FROM positives, LATERAL (SELECT p[1 + (abs(hashtext(p.id || 'p2')) % 10)] AS p2) s),
      (SELECT p2 FROM positives, LATERAL (SELECT p[1 + (abs(hashtext(p.id || 'p3')) % 10)] AS p2) s)
    ]),
    'critical', to_jsonb(ARRAY[
      (SELECT c2 FROM criticals, LATERAL (SELECT c[1 + (abs(hashtext(p.id || 'c1')) % 10)] AS c2) s),
      (SELECT c2 FROM criticals, LATERAL (SELECT c[1 + (abs(hashtext(p.id || 'c2')) % 10)] AS c2) s)
    ])
  );
