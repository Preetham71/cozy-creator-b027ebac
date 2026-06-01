import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
  console.error("❌ Missing environment variables:");
  if (!SUPABASE_URL) console.error("   - SUPABASE_URL (or VITE_SUPABASE_URL) is missing");
  if (!SUPABASE_SERVICE_ROLE_KEY) console.error("   - SUPABASE_SERVICE_ROLE_KEY is missing");
  if (!OPENROUTER_API_KEY) console.error("   - OPENROUTER_API_KEY is missing");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const FILE_PATH = path.join(process.cwd(), 'src', 'products-catalog-enriched.md');

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

function parseMarkdown(content: string) {
  const products: any[] = [];
  const lines = content.split('\n');
  let currentCategory = '';
  let currentProduct: any = null;

  for (const line of lines) {
    if (line.startsWith('## ') && !line.includes('Categories') && !line.includes('Catalog')) {
      currentCategory = line.replace('## ', '').trim();
    } else if (line.startsWith('### ')) {
      if (currentProduct) products.push(currentProduct);
      currentProduct = {
        name: line.replace('### ', '').trim(),
        category: currentCategory,
      };
    } else if (currentProduct) {
      if (line.includes('**ID:**')) {
        currentProduct.id = line.split('`')[1];
      } else if (line.includes('**Price:**')) {
        currentProduct.price = parseInt(line.split('₹')[1].replace(/,/g, ''));
      } else if (line.includes('**Brand:**')) {
        currentProduct.brand = line.split('**Brand:**')[1].trim();
      } else if (line.includes('**Material:**')) {
        currentProduct.material = line.split('**Material:**')[1].trim();
      } else if (line.includes('**Rating:**')) {
        const match = line.match(/Rating:\*\* ([\d.]+)\s*\((\d+)\s*reviews\)/);
        if (match) {
          currentProduct.rating = parseFloat(match[1]);
          currentProduct.reviews_count = parseInt(match[2]);
        }
      } else if (line.includes('**Image:**')) {
        currentProduct.image_url = line.split('**Image:**')[1].trim();
      } else if (line.includes('**Description:**')) {
        currentProduct.description = line.split('**Description:**')[1].trim();
      }
    }
  }
  if (currentProduct) products.push(currentProduct);
  return products;
}

async function run() {
  console.log("Reading catalog file...");
  const content = fs.readFileSync(FILE_PATH, 'utf8');
  const rawProducts = parseMarkdown(content);
  console.log(`Parsed ${rawProducts.length} products.`);

  const BATCH_SIZE = 5; 
  for (let i = 0; i < rawProducts.length; i += BATCH_SIZE) {
    const batch = rawProducts.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rawProducts.length / BATCH_SIZE)}...`);

    await Promise.all(batch.map(async (p) => {
      try {
        const embeddingText = `${p.name} ${p.category} ${p.brand} ${p.material} ${p.description}`.toLowerCase();
        const embedding = await embedText(embeddingText);

        const { error: pError } = await supabase.from('products').upsert({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          brand: p.brand,
          material: p.material,
          rating: p.rating,
          reviews_count: p.reviews_count,
          image_url: p.image_url,
          description: p.description,
          embedding_text: embeddingText
        });

        if (pError) throw pError;

        const { error: cError } = await supabase.from('chunks').upsert({
          product_id: p.id,
          content: embeddingText,
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
