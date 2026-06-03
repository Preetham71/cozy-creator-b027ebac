# ✨ Cozy Creator (ShopMind AI)

> **Transforming your living space with the power of RAG-driven AI Styling.**

Cozy Creator is a modern, design-savvy home decor shopping assistant that acts as a professional interior stylist. It doesn't just find products; it understands the "vibe" you're looking for and provides expert advice on how to curate your perfect sanctuary.

![Deployment Status](https://img.shields.io/badge/Status-Deployed-success?style=for-the-badge&logo=netlify)
![Framework](https://img.shields.io/badge/Built%20With-TanStack%20Start-blue?style=for-the-badge)
![AI](https://img.shields.io/badge/AI%20Powered-OpenRouter%20(Gemini)-orange?style=for-the-badge)

---

## 🎨 Core Features

- 🧠 **RAG-Powered Retrieval:** Uses Vector Search (Supabase + pgvector) to find products that match your style, material, and budget constraints.
- 🛋️ **AI Interior Stylist:** Powered by Gemini 1.5 via OpenRouter, the "ShopMind" AI provides punchy, design-focused advice without just listing items.
- ⚡ **SSR Performance:** Built on **TanStack Start** for lightning-fast server-side rendering and SEO optimization.
- 🛍️ **Interactive Shopping Experience:** Seamless product exploration with high-fidelity UI components, interactive modals, and a modern cart flow.
- 💅 **Tailwind v4 Styling:** A clean, minimalist interface using the latest CSS-first framework.

## 🛠️ Tech Stack

- **Framework:** [TanStack Start](https://tanstack.com/router/latest/docs/framework/react/start/overview) (React + Nitro)
- **Runtime:** [Bun](https://bun.sh/)
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL + pgvector)
- **AI/LLM:** [OpenRouter](https://openrouter.ai/) (Gemini 1.5 Flash)
- **Styling:** Tailwind CSS v4 & Lucide Icons
- **Deployment:** Netlify (SSR Functions)

## 🚀 Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/Preetham71/cozy-creator-b027ebac.git
cd cozy-creator
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Environment Variables
Create a `.env` file in the root:
```env
OPENROUTER_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### 4. Run Development
```bash
bun run dev
```

---

## 🏗️ Project Structure

- `src/lib/rag.functions.ts` - The heart of the AI retrieval logic.
- `src/lib/intent.functions.ts` - Handles query understanding and domain mapping.
- `src/components/ui/` - A rich library of accessible Shadcn-inspired components.
- `src/routes/` - TanStack Router definitions for a seamless SPA/SSR experience.

## 📝 License
Created with ❤️ by Preetham Reddy Soli.
