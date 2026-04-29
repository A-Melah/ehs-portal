```markdown
# Digital EHS Compliance Portal

An **AI-Powered Environment, Health & Safety (EHS) Compliance Management System** built with Next.js, Supabase, and Google Gemini 2.5 Flash.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| **Backend** | Next.js Server Actions & API Routes |
| **Database** | Supabase (PostgreSQL + `pgvector`) |
| **AI Engine** | Google Gemini 2.5 Flash + `text-embedding-004` |
| **Auth** | Supabase Auth with Row-Level Security (RLS) |

---

## 🚀 Setup Instructions

### 1. Clone and install dependencies
```bash
git clone <your-repo-url>
cd ehs-portal
npm install
```

### 2. Create Supabase project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the **SQL Editor**, run the full migration file: `/supabase/migrations/001_initial_schema.sql`.
3. This script initializes all tables, RLS policies, seed data, and the vector search functions.

### 3. Get your Gemini API key
1. Go to [aistudio.google.com](https://aistudio.google.com).
2. Create an API key for the Gemini API.

### 4. Configure environment variables
Create a `.env.local` file in the root directory:
```bash
cp .env.local.example .env.local
```

Fill in your credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=[https://yourproject.supabase.co](https://yourproject.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

### 5. Create your first user
In **Supabase → Authentication → Users → Invite user**, or use the Supabase client:
```typescript
await supabase.auth.signUp({
  email: 'manager@yourcompany.com',
  password: 'securepassword',
  options: { 
    data: { 
      full_name: 'EHS Manager', 
      role: 'ehs_manager' 
    } 
  }
})
```

### 6. Run development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the result.

---

## 📂 Project Structure

```text
src/
├── app/
│   ├── auth/login/          # Login page
│   ├── dashboard/           # Protected dashboard
│   │   ├── page.tsx         # Overview with heatmap
│   │   ├── assets/          # Asset registry
│   │   ├── inspections/     # Inspection list + new inspection
│   │   └── reports/         # Analytics by asset type
│   └── api/
│       └── ai-audit/        # RAG pipeline API endpoint
├── components/
│   ├── dashboard/           # Sidebar, heatmap, recent inspections
│   └── inspection/          # Interactive checklist form
├── lib/
│   ├── supabase/            # Client, server, middleware helpers
│   └── gemini.ts            # Gemini AI + embedding functions
└── types/index.ts           # All TypeScript types
```

---

## 🤖 How the AI RAG Pipeline Works

1. **Failure Detection:** Inspector marks a checklist item as **Fail**.
2. **Vectorization:** The system generates a vector embedding of the failure description.
3. **Semantic Search:** `pgvector` searches the regulations table for semantically similar legal clauses.
4. **AI Reasoning:** The matching law text + failure description are sent to **Gemini 2.5 Flash**.
5. **Structured Output:** Gemini returns a JSON verdict including breach level, legal references, and recommended actions.
6. **Automation:** The verdict is saved to the `responses` table and displayed inline. If a critical breach is detected, the manager is alerted immediately.

---
```