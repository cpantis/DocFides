# CLAUDE.md — DocFides

> Concise guide for AI assistants working on this repository. Read this first before any task.
> For full specification details, see `CLAUDE_1.md`.

## Project Summary

DocFides is a web platform that automates project documentation completion. Users upload source documents (contracts, ID cards, financial records), an optional model document (for style reference), and a template. An AI pipeline extracts data, maps it to template fields, generates text, and produces export-ready DOCX/PDF files.

**Primary users:** Consultants, project managers, and engineers working with Romanian public administration documentation.

## Current State

The project is in the **specification phase**. `CLAUDE_1.md` contains the full architecture and design specification. No source code has been implemented yet. When implementation begins, this file should be updated to reflect actual project structure, scripts, and workflows.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), TypeScript strict mode |
| Styling | Tailwind CSS 4 + shadcn/ui |
| i18n | next-intl (English default + Romanian) |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | Clerk (OAuth + email/password) |
| Storage | Cloudflare R2 (signed URLs, 24h auto-delete) |
| AI | Claude API — Sonnet 4.5 (extraction/mapping) + Opus 4.6 (writing/verification) |
| Parsing | Apache Tika + Tesseract 5 + EasyOCR + img2table + Sharp |
| Doc Generation | docx-js (DOCX) + LibreOffice headless (PDF) |
| Job Queue | BullMQ + Redis |
| Monitoring | Sentry + Anthropic Console |

## Project Structure

```
docfides/
├── CLAUDE.md                    # This file — AI assistant guide
├── CLAUDE_1.md                  # Full specification document
├── messages/                    # i18n: en.json, ro.json
├── src/
│   ├── app/
│   │   ├── [locale]/            # All routes under locale prefix
│   │   │   ├── (auth)/          # Clerk sign-in/sign-up
│   │   │   ├── dashboard/       # User projects list + analytics
│   │   │   ├── project/[id]/    # Upload → preview → processing → editor → export
│   │   │   └── admin/           # User management + stats
│   │   └── api/                 # API routes (NOT inside [locale])
│   │       ├── projects/        # CRUD
│   │       ├── documents/       # Upload, parse, delete
│   │       ├── pipeline/        # AI trigger + status
│   │       ├── export/          # DOCX/PDF generation
│   │       └── webhooks/        # Clerk webhooks
│   ├── components/
│   │   ├── ui/                  # shadcn/ui base components
│   │   ├── landing/             # Hero, HowItWorks, Features, Pricing, FAQ, etc.
│   │   ├── layout/              # Navbar, Footer, LocaleSwitcher
│   │   ├── project/             # ProjectCard, UploadZone, ProcessingProgress
│   │   ├── editor/              # SplitScreen, SuggestionWizard, FieldCard
│   │   ├── dashboard/           # CreditsMeter, UsageChart, TimeSavedBadge
│   │   └── admin/
│   ├── lib/
│   │   ├── ai/                  # 6 pipeline agents + prompts/
│   │   ├── parsing/             # detector, tika, ocr, table-extractor, preprocessor
│   │   ├── db/                  # Mongoose connection + models/
│   │   ├── storage/             # R2 client, upload, download, cleanup
│   │   ├── docgen/              # docx-generator, pdf-converter, dynamic-tables
│   │   └── utils/               # hash, validation (Zod), rate-limit
│   ├── types/                   # Shared TypeScript types
│   └── middleware.ts            # next-intl + Clerk middleware chain
├── workers/                     # BullMQ workers (separate process)
└── scripts/                     # seed-db, test-ocr
```

## Development Commands

```bash
npm run dev              # Start Next.js dev server
npm run workers          # Start BullMQ workers
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript strict check
npm run test             # All tests
npm run test:ocr         # OCR pipeline tests
npm run db:seed          # Seed test data
npm run db:migrate       # Run migrations
```

## Coding Conventions

### TypeScript
- Strict mode, **no `any` types**
- All API inputs validated with Zod
- `async/await` everywhere, never raw Promises
- Error handling: try/catch with typed errors, never swallow errors

### File Naming
- `kebab-case.ts` for utilities and library files
- `PascalCase.tsx` for React components
- Max ~300 lines per file; split if larger

### React / Next.js
- **Server Components by default**, `'use client'` only when needed
- All user-facing strings via `useTranslations()` from next-intl — never hardcode
- shadcn/ui as component base, customized with Tailwind
- Forms: react-hook-form + Zod resolver
- No `useEffect` for data fetching — use Server Components or SWR
- Prefer named exports (except page components)

### API Route Pattern
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

const schema = z.object({ /* ... */ });

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = schema.parse(await req.json());
    // ... logic
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[API_NAME]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Mongoose Model Pattern
```typescript
import { Schema, model, models, Document } from 'mongoose';

interface IProject extends Document {
  userId: string;
  name: string;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'exported';
}

const ProjectSchema = new Schema<IProject>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['draft', 'uploading', 'processing', 'ready', 'exported'], default: 'draft' },
}, { timestamps: true });

export const Project = models.Project || model<IProject>('Project', ProjectSchema);
```

## Critical Rule: AI Agent Data Isolation

**This is the single most important architectural constraint in the entire system.**

- **Model documents** provide ONLY style, tone, and structure references
- **Source documents** provide ALL factual data (names, dates, amounts, CUI, IBAN)
- Agents must NEVER extract or use factual data from model documents
- The Verification Agent specifically checks for model data leakage

| Agent | Source Docs | Model Docs | Template |
|-------|------------|------------|----------|
| Extractor | Extracts all factual data | Never touches | Never touches |
| Model | Never touches | Extracts style/rhetorical patterns only | Never touches |
| Template | Never touches | Never touches | Identifies fields + hints |
| Mapping | Uses project_data.json | Uses model_map.json (style only) | Uses template_schema.json |
| Writing | Uses project_data.json | Uses model_map.json (patterns + vocab) | — |
| Verification | Cross-checks all data | Verifies no model data leaked | — |

Every prompt touching `model_map.json` must include the data isolation warning. See `CLAUDE_1.md` section "AI Agent Data Isolation" for the exact enforcement text and forbidden/allowed fields.

## AI Pipeline

Sequential chain of 6 agents:

1. **Extractor** (Sonnet 4.5) — Extract + validate factual data, organized by entity
2. **Model** (Sonnet 4.5) — Extract style, rhetorical patterns, domain vocabulary [OPTIONAL]
3. **Template** (Sonnet 4.5) — Identify fields, classify content type (copy/narrative/table_fill/computed/conditional)
4. **Mapping** (Sonnet 4.5) — Map data to fields, strategy per field type
5. **Writing** (Opus 4.6) — 3-pass generation: generate, coherence check, polish
6. **Verification** (Opus 4.6) — Quality report with scores on accuracy/style/completeness/coherence

All agents use structured tool use for output. Prompts live in `src/lib/ai/prompts/`.

## Document Parsing Pipeline

```
File → Detect type → Route:
  Image (PNG/JPG/TIFF) → Sharp preprocessing → Tesseract OCR → img2table → Merge
  PDF (native text)    → Tika text + Camelot tables → Merge
  PDF (scanned)        → Per-page Sharp → Tesseract + img2table → Merge
  DOCX                 → Tika text + XML table parsing → Merge
  XLSX/XLS             → SheetJS → structured tables → Merge
  Other                → Reject
→ Confidence scoring per block → Store in MongoDB (linked to SHA256 hash)
```

Confidence thresholds: >=90% auto-accept, 70-89% yellow badge, <70% red badge + manual review.

## i18n Rules

- Default language: English. Supported: English (en), Romanian (ro)
- All routes under `/[locale]/`; API routes are NOT under locale
- Never hardcode user-facing strings — always use `useTranslations()`
- Romanian diacritics must be correct: `ș ț ă â î` (never cedilla forms `ş ţ`)
- UI language and document language are independent

## Romanian Domain Formatting

When generating or handling Romanian documentation content:
- Dates: `DD.MM.YYYY` (e.g., 15.02.2026)
- Amounts: `1.250.000,50 lei` (dot=thousands, comma=decimals, "lei" in narrative)
- CUI: with `RO` prefix if VAT payer
- Legislative references: full form on first mention, abbreviated after
- Diacritics: mandatory correct forms (ș ț ă â î)

## Entity Handling

Projects often involve multiple entities (beneficiary, contractor, subcontractors). The system uses:
1. **Filename hints** at upload (e.g., `CI_beneficiar_Popescu.pdf`)
2. **Content analysis** by Extractor Agent to assign entity roles
3. **Multiple suggestions** from Writing Agent when entity is ambiguous — user picks

After a user picks an entity for one field, related fields in the same section auto-fill with the same entity.

## Export System

- **Template replacement** for simple fields (preserves original formatting)
- **Section generation** via docx-js for narratives, dynamic tables, conditional sections
- Dynamic table rows clone the model row's style for each data element
- Conditional sections omitted cleanly when conditions aren't met (heading + content + TOC removed)
- Header/footer placeholders replaced preserving font/size/alignment
- PDF via LibreOffice headless: `libreoffice --headless --convert-to pdf document.docx`

## Validation Limits

- Max file size: 25MB
- Max source files: 10
- Max model files: 2
- Accepted formats: PDF, DOCX, XLSX, XLS, PNG, JPG, TIFF
- R2 file TTL: 24 hours

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Auth
- `MONGODB_URI` — Database
- `CLOUDFLARE_R2_ACCOUNT_ID` / `ACCESS_KEY` / `SECRET_KEY` / `BUCKET` — Storage
- `ANTHROPIC_API_KEY` — AI pipeline
- `REDIS_URL` — Job queue
- `SENTRY_DSN` — Error monitoring
- `NEXT_PUBLIC_APP_URL` — App base URL

## Error Handling & Retries

- API timeout: retry 3x with exponential backoff (5s, 15s, 45s)
- Rate limit (429): queue with delay, retry after header
- Invalid AI output: re-prompt with error context
- OCR failure: fallback to EasyOCR; if both fail, mark for manual input
- Pipeline failure: save partial state, mark job "failed", show retry button

## Performance Targets

- AI pipeline: <2 min for 20-page source
- OCR per page: <5 seconds
- DOCX/PDF export: <10s simple, <30s with 50+ dynamic rows
- API latency (non-AI): <200ms p95
- First Contentful Paint: <1.5s
