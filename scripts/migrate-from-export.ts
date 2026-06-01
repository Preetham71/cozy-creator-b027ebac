import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Force load local .env
dotenv.config({ path: path.join(process.cwd(), '.env'), override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
  console.error("❌ Missing environment variables. Please check your .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const FILE_PATH = path.join(process.cwd(), 'src', 'database-export.md');

async function embedText(text: string): Promise<number[]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
}

function parseExport(content: string) {
  const products: any[] = [];
  const sections = content.split('### ').slice(1);

  for (const section of sections) {
    const lines = section.split('\n');
    const product: any = {};

    for (const line of lines) {
      if (line.trim().startsWith('- **')) {
        const parts = line.split('**: ');
        if (parts.length < 2) continue;
        
        const key = parts[0].replace('- **', '').trim();
        let value: any = parts[1].trim();

        if (!value || value === 'null') continue;

        // Parse types
        if (key === 'price' || key === 'delivery_days' || key === 'review_count') {
          value = parseInt(value);
        } else if (key === 'discount_pct' || key === 'rating') {
          value = parseFloat(value);
        } else if (['style_tags', 'color_tags', 'room_tags', 'constraints', 'sizes', 'colors_available'].includes(key)) {
          value = value.split(',').map((s: string) => s.trim());
        } else if (key === 'reviews') {
          try {
            value = JSON.parse(value.replace(/^`|`$/g, ''));
          } catch (e) {
            value = null;
          }
        }
        product[key] = value;
      }
    }
    if (product.id) products.push(product);
  }
  return products;
}

async function run() {
  console.log(`Using Supabase URL: ${SUPABASE_URL}`);
  console.log("Reading export file...");
  const content = fs.readFileSync(FILE_PATH, 'utf8');
  const rawProducts = parseExport(content);
  console.log(`Parsed ${rawProducts.length} products.`);

  const BATCH_SIZE = 5; 
  for (let i = 0; i < rawProducts.length; i += BATCH_SIZE) {
    const batch = rawProducts.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rawProducts.length / BATCH_SIZE)}...`);

    await Promise.all(batch.map(async (p) => {
      try {
        const embedding = await embedText(p.embedding_text || `${p.name} ${p.description}`);

        const { error: pError } = await supabase.from('products').upsert({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          brand: p.brand,
          material: p.material,
          style_tags: p.style_tags,
          color_tags: p.color_tags,
          room_tags: p.room_tags,
          constraints: p.constraints,
          sizes: p.sizes,
          colors_available: p.colors_available,
          delivery_days: p.delivery_days,
          discount_pct: p.discount_pct,
          rating: p.rating,
          review_count: p.review_count,
          description: p.description,
          embedding_text: p.embedding_text,
          image_url: p.image_url,
          bg: p.bg,
          reviews: p.reviews,
          created_at: p.created_at
        });

        if (pError) throw pError;

        const { error: cError } = await supabase.from('chunks').upsert({
          product_id: p.id,
          content: p.embedding_text,
          embedding: embedding
        }, { onConflict: 'product_id' });

        if (cError) throw cError;

      } catch (err) {
        console.error(`Error migrating product ${p.id}:`, err);
      }
    }));
  }

  console.log("Migration complete!");
}

run();
