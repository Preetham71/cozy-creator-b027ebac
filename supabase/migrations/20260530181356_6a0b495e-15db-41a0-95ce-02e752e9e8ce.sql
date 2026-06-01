ALTER TABLE public.products RENAME COLUMN emoji TO image_url;
ALTER TABLE public.products ALTER COLUMN image_url SET DEFAULT '';