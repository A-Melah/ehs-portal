# EHS Compliance Portal

An AI-powered Environmental, Health & Safety compliance management system built with Next.js 16, Supabase, and Google Gemini. Enables organisations to manage legal compliance audits, asset inspections, hazard reports and incident tracking in one platform.

---

## Features

- **AI Compliance Audits** — Select your industry and Gemini extracts applicable legal requirements from uploaded regulatory documents via RAG, builds an audit checklist, and auto-assigns compliance status
- **Legal Document Management** — Upload regulatory PDFs; Gemini chunks and embeds them (1024-dim MRL with HNSW index), auto-detects document area and applicable industries
- **Asset Inspections** — Inspect assets against dynamic checklists; AI generates checklists for unknown asset types; photo evidence upload supported
- **Incident Reporting** — Submit Hazard, Near Miss, Incident, and Accident reports with photo evidence; accessible to all roles including directly from the Reports & Incidents page
- **PDF Report Generation** — Download detailed compliance audit reports as formatted PDFs
- **Role-based Access** — Admin, EHS Manager, Inspector, and Shopfloor Worker with appropriate access controls
- **Staff Management** — Add team members via Supabase Auth and assign roles

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Vector Search | pgvector with HNSW index (1024 dims) |
| AI | Google Gemini 2.5 Flash + gemini-embedding-001 |
| PDF Generation | jsPDF |
| QR Scanning | jsQR / html5-qrcode |

---

## Prerequisites

- Node.js 18.17 or later
- A [Supabase](https://supabase.com) account (free tier works)
- A [Google AI Studio](https://aistudio.google.com) account for a Gemini API key

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/ehs-compliance-portal.git
cd ehs-compliance-portal
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon key** from Project Settings → API
3. Note your **service role key** from the same page — keep this secret

### 4. Enable pgvector

In your Supabase SQL Editor run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 5. Run database migrations

Run these files **in order** from the `supabase/migrations/` folder using the Supabase SQL Editor:

| Order | File | Description |
|---|---|---|
| 1 | `001_initial_schema.sql` | Core tables — profiles, assets, checklist_templates, inspections |
| 2 | `002_hazard_reports.sql` | Hazard and incident reports |
| 3 | `003_add_worker_role.sql` | Shopfloor worker role |
| 4 | `004_realtime_and_storage.sql` | Realtime subscriptions + storage buckets |
| 5 | `005_compliance_audit_system.sql` | Compliance audits and line items |
| 6 | `006_legal_documents.sql` | Legal document storage and chunks |
| 7 | `017_add_report_type.sql` | Report type column (hazard / near_miss / incident / accident) |
| 8 | `018_industries_system.sql` | Industries, sub-sectors, requirements cache |
| 9 | `019_fingerprint_function.sql` | Doc fingerprint function for cache invalidation |
| 10 | `020_audit_line_items_inline.sql` | Inline requirement fields on audit line items |
| 11 | `027_delete_wrong_dim_fn.sql` | Helper RPC for vector dimension cleanup |
| 12 | `028c_vector_1024_hnsw.sql` | **Run last** — sets vector columns to 1024 dims + HNSW index |
| 13 | `030_inspector_read_access.sql` | Grants inspectors read access to all dashboard data |

> Migrations 021–026 and 028–028b are maintenance/superseded migrations — skip them on a fresh install.

### 6. Create Storage buckets

In Supabase Dashboard → Storage, create two buckets:

| Bucket name | Public |
|---|---|
| `legal-documents` | No (private) |
| `hazard-evidence` | Yes (public) |

### 7. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# App URL (change to your production URL when deploying)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Getting a Gemini API key:**
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API key** → Create API key
3. Copy the key into `GEMINI_API_KEY`

### 8. Create the first admin user

1. Go to Supabase Dashboard → Authentication → Users → **Add user**
2. Enter an email and a password
3. In the SQL Editor run:

```sql
UPDATE public.profiles
SET role = 'admin', full_name = 'Your Name'
WHERE email = 'your@email.com';
```

### 9. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your admin credentials.

---

## First-Time Setup After Login

### 1. Upload Legal Documents

1. Go to **Legal Docs** in the sidebar
2. Click **Upload PDFs** and upload your regulatory documents (Factories Act, Labour Law, NESREA regulations, etc.)
3. Click **Process** on each document — Gemini reads the PDF, chunks and embeds it, and auto-detects its area (Safety / Health / Environment) and applicable industries
4. Wait for all documents to show **Ready** status

> You can also click **Reprocess All Docs** to process everything at once. With many large documents this can take 5–15 minutes — watch the terminal for `[reprocess-all]` progress logs.

### 2. Add Assets

1. Go to **Assets** in the sidebar
2. Add your facility assets (generators, forklifts, fire pumps, fire extinguishers, etc.)
3. Each asset requires a name, type, tag number, and location

### 3. Add Team Members

> Email invites are not yet configured. Add users directly through Supabase Auth.

1. Go to Supabase Dashboard → Authentication → Users → **Add user**
2. Enter the user's email and a temporary password, and share it with them securely
3. In the SQL Editor set their role:

```sql
UPDATE public.profiles
SET role = 'inspector', full_name = 'John Doe'
WHERE email = 'john@company.com';
```

Available roles: `admin`, `ehs_manager`, `inspector`, `shopfloor_worker`

---

## Roles & Access

| Role | Login destination | Access |
|---|---|---|
| **Admin** | Dashboard | Full access — all modules, staff management, legal docs |
| **EHS Manager** | Dashboard | Full dashboard access; **Submit Report** button on Reports page |
| **Inspector** | Landing page | Choose *Submit a Report* or *Go to Dashboard*; full read access to audits, inspections and reports; **Submit Report** button on Reports page |
| **Shopfloor Worker** | Report form | Report submission only — no dashboard access |

---

## User Flows

**Admin / EHS Manager** → Login → Dashboard overview → all modules available

**Inspector** → Login → Landing page → pick **Submit a Report** or **Go to Dashboard**
- In the dashboard: full read access to audits, inspections, reports, assets
- On the Reports & Incidents page: **Submit Report** button opens a modal form

**Shopfloor Worker** → Login → Report form directly → submit → sign out or submit another

---

## Running a Compliance Audit

1. Go to **Compliance** → **New Audit**
2. Select your industry (e.g. Manufacturing) and sub-sector (e.g. Food & Beverage)
3. Set a title and audit period (e.g. Q1 2026)
4. Click **Start Audit** — AI searches regulatory documents and prepares a checklist (15–60 seconds)
5. For each requirement select **Yes**, **Partial**, or **No**
6. Expand any item to add inspector notes and adjust owner / frequency / due date
7. Click **Complete & Generate Report**
8. Download the PDF from the report page

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── compliance/           # Audit prep, status polling, PDF report
│   │   ├── admin/legal-docs/     # Process, re-embed, reprocess-all, import-drive
│   │   └── inspections/          # AI checklist generation
│   ├── auth/login/               # Login page
│   ├── dashboard/                # All dashboard pages
│   │   ├── compliance/           # Audit list and detail
│   │   ├── hazards/              # Reports & Incidents
│   │   ├── inspections/          # Asset inspections
│   │   ├── requirements/         # Legal requirements browser
│   │   └── admin/                # Staff + Legal Docs management
│   ├── inspector/                # Inspector landing page
│   └── report/                   # Incident report form (shopfloor + inspectors)
├── components/
│   ├── compliance/               # Audit form, report, prep loader, uploader
│   ├── dashboard/                # Sidebar, reports list, report modal
│   └── inspection/               # Inspection form and list
├── lib/
│   ├── gemini.ts                 # Embedding with retry + 1024-dim MRL
│   └── supabase/
│       ├── client.ts             # Browser Supabase client
│       ├── server.ts             # Server Supabase client
│       ├── admin.ts              # Service role client (server-side only)
│       └── proxy.ts              # Route protection + role-based redirects
└── types/
    └── index.ts                  # Shared TypeScript types
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only — never expose to client) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `NEXT_PUBLIC_APP_URL` | Yes | Full URL of the app e.g. `https://your-app.vercel.app` |

---

## Deployment (Vercel)

1. Push your code to GitHub
2. Import the repository at [vercel.com/new](https://vercel.com/new)
3. Add all five environment variables in the Vercel project settings
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL
5. Deploy

> **Note:** Document processing and audit preparation routes use `maxDuration` values of 300–600 seconds, which requires a **Vercel Pro** plan or higher. On the free/hobby plan these requests time out after 10 seconds. For free-tier deployments, process documents one at a time using the individual **Process** button rather than **Reprocess All Docs**.

---

## Troubleshooting

**"Chunk search failed: different vector dimensions"**
Run in Supabase SQL Editor:
```sql
SELECT public.delete_wrong_dim_chunks();
```
Then click **Re-embed Chunks** or **Reprocess All Docs** in Legal Docs.

**Audit preparation stuck loading forever**
Check the terminal for `[prepare] START` logs. If there are no further logs after START, verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly. Delete the stuck audit and create a new one.

**Documents stuck at "Uploaded" after clicking Process**
The Gemini API may have returned a transient 500/503 error. Click the retry icon (↺) on the document row. The embedding function retries automatically up to 3 times with backoff.

**Inspector can't see audits or inspections**
Run migration `030_inspector_read_access.sql` in Supabase SQL Editor — it grants inspectors read access to all dashboard data via RLS policies.

**"Missing required fields" error on a document row**
A stale error from a previous failed operation. Reset with:
```sql
UPDATE public.legal_documents
SET status = 'uploaded', error_message = null
WHERE document_title = 'Your Document Title';
```

---

## License

Private — all rights reserved.