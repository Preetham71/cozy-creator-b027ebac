
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  product_id text,
  content text,
  similarity float
)
language sql stable
set search_path = public
as $$
  select c.id, c.product_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
