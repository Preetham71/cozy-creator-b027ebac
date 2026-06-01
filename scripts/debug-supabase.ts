import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function debug() {
  console.log("URL:", SUPABASE_URL);
  
  if (SERVICE_KEY) {
    console.log("\nTesting Service Role Key...");
    const supabase = createClient(SUPABASE_URL!, SERVICE_KEY);
    const { data, error } = await supabase.from('products').select('count');
    if (error) console.error("❌ Service Key Error:", error.message);
    else console.log("✅ Service Key Success!");
  }

  if (ANON_KEY) {
    console.log("\nTesting Anon Key...");
    const supabase = createClient(SUPABASE_URL!, ANON_KEY);
    const { data, error } = await supabase.from('products').select('count');
    if (error) console.error("❌ Anon Key Error:", error.message);
    else console.log("✅ Anon Key Success!");
  }
}

debug();
