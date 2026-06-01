import dotenv from 'dotenv';
dotenv.config();

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL);
console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10) + "...");
console.log("SUPABASE_PUBLISHABLE_KEY:", process.env.SUPABASE_PUBLISHABLE_KEY?.substring(0, 10) + "...");
console.log("OPENROUTER_API_KEY:", process.env.OPENROUTER_API_KEY?.substring(0, 10) + "...");
