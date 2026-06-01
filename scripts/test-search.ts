import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

console.log("DEBUG: Using URL from .env.local:", SUPABASE_URL);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase URL or Service Role Key");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.log("Checking database counts...");
  
  const { count: pCount, error: pError } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: cCount, error: cError } = await supabase.from('chunks').select('*', { count: 'exact', head: true });

  if (pError) console.error("   - Product count error:", pError.message);
  else console.log(`   - Products in DB: ${pCount}`);

  if (cError) console.error("   - Chunk count error:", cError.message);
  else console.log(`   - Chunks in DB: ${cCount}`);

  if (!pCount || !cCount) {
    console.error("❌ Database is empty or inaccessible!");
    return;
  }

  console.log("\nTesting embedding generation...");
  const query = "cozy lamp";
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: query
    }),
  });

  if (!res.ok) {
    console.error("❌ Embedding generation failed:", await res.text());
    return;
  }

  const { data } = await res.json();
  const embedding = data[0].embedding;
  console.log(`✅ Generated embedding (${embedding.length} dimensions)`);

  console.log("\nTesting match_chunks RPC...");
  const { data: matches, error } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    match_count: 5
  });

  if (error) {
    console.error("❌ RPC Error:", error);
  } else {
    console.log(`✅ Found ${matches?.length || 0} matches:`);
    matches?.forEach((m: any, i: number) => {
      console.log(`${i+1}. Product ID: ${m.product_id}, Similarity: ${m.similarity}`);
    });
  }
}

test();
