
create extension if not exists vector;

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

grant select on public.chunks to anon, authenticated;
grant all on public.chunks to service_role;

alter table public.chunks enable row level security;
create policy "Chunks are publicly readable" on public.chunks for select using (true);

create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_product_id_idx on public.chunks(product_id);

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
as $$
  select c.id, c.product_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_chunks(vector, int) to anon, authenticated, service_role;
