# DocFides — CLAUDE.md

> Implementation guide for Claude Code. Read this file FIRST before any task.

## Project Overview

DocFides is a web platform that automates project documentation completion using source documents, model documents, and templates. It extracts information from documents (including scans, images, and tables), proposes AI-assisted completions, and generates the final document.

**Tagline:** DocFides — AI-assisted project documentation. Transform source documents into complete, verifiable, ready-to-deliver documentation.

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | Deploy on Vercel, SSR + client components |
| Language | TypeScript (strict mode) | All files, no `any` types |
| Styling | Tailwind CSS 4 + shadcn/ui | Custom theme, dark/light mode |
| i18n | next-intl | English default + Romanian switcher |
| Database | MongoDB Atlas | Mongoose ODM, typed schemas |
| Auth | Clerk | OAuth (Google, GitHub) + email/password |
| Storage | Cloudflare R2 | Temp document storage, signed URLs, auto-delete |
| AI Engine | Claude API (Anthropic) | Sonnet 4.5 + Opus 4.6, tool use |
| Document Parsing | Apache Tika + Tesseract 5 + EasyOCR + img2table | Full stack: text, OCR, table extraction |
| Image Preprocessing | Sharp + OpenCV.js | Deskew, denoise, contrast, binarize |
| Table Extraction | img2table + Camelot + Tabula | Tables from images + native PDFs |
| DOCX Generation | docx-js (npm docx) | Programmatic generation preserving format |
| PDF Generation | LibreOffice headless | DOCX → PDF conversion |
| Job Queue | BullMQ + Redis | Async AI pipeline processing |
| Monitoring | Sentry + Anthropic Console | Errors, latency, cost tracking |

---

## Project Structure

```
docfides/
├── CLAUDE.md                          # This file
├── next.config.ts                     # Next.js config with next-intl
├── tailwind.config.ts                 # Tailwind theme
├── tsconfig.json                      # TypeScript strict
├── package.json
├── .env.local                         # Environment variables
│
├── messages/                          # i18n translation files
│   ├── en.json                        # English (DEFAULT)
│   └── ro.json                        # Romanian
│
├── src/
│   ├── i18n/                          # Internationalization config
│   │   ├── config.ts                  # Locales, default locale
│   │   ├── request.ts                 # next-intl request config
│   │   └── navigation.ts             # Localized Link, redirect, etc.
│   │
│   ├── app/
│   │   ├── [locale]/                  # All routes wrapped in locale
│   │   │   ├── layout.tsx             # Root layout with NextIntlClientProvider
│   │   │   ├── page.tsx               # Landing page
│   │   │   ├── (auth)/               # Clerk auth pages
│   │   │   │   ├── sign-in/
│   │   │   │   └── sign-up/
│   │   │   ├── dashboard/             # User dashboard
│   │   │   │   ├── page.tsx           # Projects list
│   │   │   │   └── new/               # Create new project
│   │   │   ├── project/[id]/          # Project detail
│   │   │   │   ├── page.tsx           # Project overview
│   │   │   │   ├── upload/            # Upload documents step
│   │   │   │   ├── preview/           # Template preview (blank)
│   │   │   │   ├── processing/        # AI pipeline progress
│   │   │   │   ├── editor/            # Split-screen assisted writing
│   │   │   │   └── export/            # Export DOCX/PDF
│   │   │   └── admin/                 # Admin panel
│   │   │       ├── page.tsx           # Dashboard
│   │   │       ├── users/             # User management
│   │   │       └── stats/             # Usage statistics
│   │   │
│   │   └── api/                       # API routes (NOT inside [locale])
│   │       ├── projects/              # CRUD projects
│   │       ├── documents/             # Upload, parse, delete
│   │       ├── pipeline/              # AI pipeline trigger + status
│   │       ├── export/                # DOCX/PDF generation
│   │       ├── admin/                 # Admin endpoints
│   │       └── webhooks/              # Clerk webhooks
│   │
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   ├── landing/                   # Landing page sections
│   │   │   ├── Hero.tsx
│   │   │   ├── HowItWorks.tsx
│   │   │   ├── Features.tsx
│   │   │   ├── Parsing.tsx            # Document parsing showcase
│   │   │   ├── BeforeAfter.tsx
│   │   │   ├── Pricing.tsx
│   │   │   ├── Testimonials.tsx
│   │   │   ├── FAQ.tsx
│   │   │   └── CTA.tsx
│   │   ├── layout/                    # Shared layout components
│   │   │   ├── Navbar.tsx             # With language switcher
│   │   │   ├── Footer.tsx
│   │   │   └── LocaleSwitcher.tsx     # EN/RO toggle
│   │   ├── project/                   # Project-related components
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── UploadZone.tsx         # Upload with filename hint
│   │   │   ├── TemplatePreview.tsx    # Blank template with hints
│   │   │   ├── ProcessingProgress.tsx
│   │   │   └── ModelDocBadge.tsx      # "Style reference only" badge
│   │   ├── editor/                    # Assisted writing editor
│   │   │   ├── SplitScreen.tsx
│   │   │   ├── DocumentPreview.tsx
│   │   │   ├── SuggestionWizard.tsx
│   │   │   ├── FieldCard.tsx
│   │   │   ├── ConfidenceBadge.tsx    # OCR confidence indicator
│   │   │   └── TableEditor.tsx        # Edit extracted tables
│   │   ├── dashboard/                 # User dashboard analytics
│   │   │   ├── CreditsMeter.tsx       # Circular progress bar
│   │   │   ├── UsageChart.tsx         # Monthly bar chart (recharts)
│   │   │   ├── TimeSavedBadge.tsx     # Hours saved estimate
│   │   │   ├── RecentActivity.tsx     # Last 5 actions list
│   │   │   └── AlertBanner.tsx        # Credit warnings, file expiry
│   │   └── admin/                     # Admin components
│   │
│   ├── lib/
│   │   ├── ai/                        # AI pipeline agents
│   │   │   ├── extractor-agent.ts     # Extract facts from source docs
│   │   │   ├── model-agent.ts         # Extract ONLY style from model docs
│   │   │   ├── template-agent.ts      # Identify fields + generate hints
│   │   │   ├── mapping-agent.ts       # Map data → fields
│   │   │   ├── writing-agent.ts       # Generate text per field
│   │   │   ├── verification-agent.ts  # Cross-check consistency
│   │   │   ├── pipeline.ts            # Orchestrator (sequential runner)
│   │   │   └── prompts/               # System prompts per agent
│   │   │       ├── extractor.ts
│   │   │       ├── model.ts           # Contains DATA ISOLATION rules
│   │   │       ├── template.ts
│   │   │       ├── mapping.ts
│   │   │       ├── writing.ts
│   │   │       └── verification.ts
│   │   │
│   │   ├── parsing/                   # Document parsing stack
│   │   │   ├── detector.ts            # Detect doc type (native vs scanned)
│   │   │   ├── tika.ts                # Apache Tika text extraction
│   │   │   ├── ocr.ts                 # Tesseract 5 + EasyOCR fallback
│   │   │   ├── table-extractor.ts     # img2table + Camelot + Tabula
│   │   │   ├── xlsx-parser.ts         # SheetJS: parse Excel → structured tables
│   │   │   ├── preprocessor.ts        # Sharp: deskew, denoise, binarize
│   │   │   ├── merger.ts              # Merge text + tables → structured JSON
│   │   │   └── confidence.ts          # Confidence scoring per block
│   │   │
│   │   ├── db/                        # MongoDB models (Mongoose)
│   │   │   ├── connection.ts
│   │   │   ├── models/
│   │   │   │   ├── user.ts
│   │   │   │   ├── project.ts
│   │   │   │   ├── document.ts
│   │   │   │   ├── extraction.ts      # Cached extraction results
│   │   │   │   ├── draft.ts           # Draft versions / snapshots
│   │   │   │   ├── generation.ts      # Export tracking / credits
│   │   │   │   └── audit.ts           # File audit log
│   │   │   └── indexes.ts
│   │   │
│   │   ├── storage/                   # Cloudflare R2
│   │   │   ├── client.ts              # R2 SDK client
│   │   │   ├── upload.ts              # Upload with signed URL
│   │   │   ├── download.ts            # Download with signed URL
│   │   │   └── cleanup.ts             # Auto-delete expired files
│   │   │
│   │   ├── docgen/                    # Document generation
│   │   │   ├── docx-generator.ts      # docx-js generation (main orchestrator)
│   │   │   ├── pdf-converter.ts       # LibreOffice headless
│   │   │   ├── template-filler.ts     # Fill template placeholders (simple fields)
│   │   │   ├── dynamic-tables.ts      # Generate variable-row tables from arrays
│   │   │   ├── conditional-sections.ts # Evaluate and omit/include sections
│   │   │   └── header-footer.ts       # Replace placeholders in header/footer
│   │   │
│   │   └── utils/
│   │       ├── hash.ts                # SHA256 file hashing
│   │       ├── validation.ts          # Zod schemas
│   │       └── rate-limit.ts          # Rate limiting helpers
│   │
│   ├── types/                         # Shared TypeScript types
│   │   ├── project.ts
│   │   ├── document.ts
│   │   ├── pipeline.ts
│   │   ├── extraction.ts
│   │   └── api.ts
│   │
│   └── middleware.ts                  # next-intl + Clerk middleware chain
│
├── workers/                           # BullMQ workers (separate process)
│   ├── pipeline-worker.ts             # AI pipeline job processor
│   ├── ocr-worker.ts                  # OCR processing worker
│   ├── cleanup-worker.ts             # R2 file cleanup worker
│   └── index.ts                       # Worker runner
│
└── scripts/                           # Utility scripts
    ├── seed-db.ts                     # Seed test data
    └── test-ocr.ts                    # OCR pipeline testing
```

---

## Internationalization (i18n)

### Configuration

**Default language: English (en)**
**Supported languages: English (en), Romanian (ro)**

We use `next-intl` with the App Router. All routes are under `/[locale]/`.

### src/i18n/config.ts
```typescript
export const locales = ['en', 'ro'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
```

### Routing
- `/en/dashboard` → English dashboard
- `/ro/dashboard` → Romanian dashboard
- `/dashboard` → Redirects to `/en/dashboard` (default)

### middleware.ts
```typescript
import createMiddleware from 'next-intl/middleware';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { locales, defaultLocale } from '@/i18n/config';

// Chain next-intl middleware with Clerk
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed' // Hide /en/ for default locale
});

export default clerkMiddleware((auth, req) => {
  return intlMiddleware(req);
});
```

### Language Switcher Component
Located in `components/layout/LocaleSwitcher.tsx`:
- Dropdown or toggle button in the navbar
- Shows flag icons: 🇬🇧 English / 🇷🇴 Română
- Preserves current path when switching
- Uses `useRouter` and `usePathname` from `next-intl/navigation`

### Translation Files Structure
```json
// messages/en.json
{
  "common": {
    "appName": "DocFides",
    "tagline": "AI-assisted project documentation",
    "getStarted": "Get Started",
    "signIn": "Sign In",
    "signUp": "Sign Up",
    "dashboard": "Dashboard",
    "settings": "Settings",
    "export": "Export",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "loading": "Loading...",
    "error": "Something went wrong"
  },
  "landing": {
    "hero": {
      "title": "Transform source documents into complete documentation",
      "subtitle": "Upload your sources, let AI extract, map, and write. Review, edit, export. Done.",
      "cta": "Start Free",
      "secondaryCta": "See How It Works"
    },
    "howItWorks": { ... },
    "features": { ... },
    "parsing": { ... },
    "pricing": { ... },
    "faq": { ... }
  },
  "project": {
    "new": "New Project",
    "upload": { ... },
    "processing": { ... },
    "editor": { ... },
    "export": { ... }
  },
  "admin": { ... }
}
```

### Rules for i18n
1. **NEVER hardcode user-facing strings** — always use `useTranslations()` hook
2. API responses and error messages are also translated
3. AI pipeline outputs are in the template's language (auto-detected), NOT the UI language
4. The UI language and the document language are independent
5. Keep translation keys organized by page/feature
6. Romanian uses diacritics: ă, â, î, ș, ț — always use correct forms

---

## Coding Conventions

### General Rules
- TypeScript strict mode, no `any`
- All API inputs validated with Zod
- Error handling: try/catch with typed errors, never swallow errors
- Use `async/await`, never raw Promises
- Prefer named exports over default exports (except pages)
- File naming: `kebab-case.ts` for utils, `PascalCase.tsx` for components
- Max file length: ~300 lines, split if larger

### React / Next.js
- Server Components by default, `'use client'` only when needed
- Use `useTranslations()` from `next-intl` for all user-facing text
- shadcn/ui as the component base, customized with Tailwind
- Form handling: react-hook-form + Zod resolver
- No `useEffect` for data fetching — use Server Components or SWR

### API Routes
```typescript
// Pattern for all API routes
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

### MongoDB / Mongoose
```typescript
// Pattern for all models
import { Schema, model, models, Document } from 'mongoose';

interface IProject extends Document {
  userId: string;
  name: string;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'exported';
  // ...
}

const ProjectSchema = new Schema<IProject>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['draft', 'uploading', 'processing', 'ready', 'exported'], default: 'draft' },
}, { timestamps: true });

export const Project = models.Project || model<IProject>('Project', ProjectSchema);
```

---

## ⚠️ CRITICAL: AI Agent Data Isolation

### THE GOLDEN RULE

**Agents NEVER extract or use factual data from model documents.**
**Model documents are ONLY used as style/structure/tone references.**
**ALL factual data comes EXCLUSIVELY from source documents.**

### What This Means Per Agent

| Agent | Source Docs | Model Docs | Template |
|-------|------------|------------|----------|
| Extractor Agent | ✅ Extract + validate all factual data by entity | ❌ Never touches | ❌ Never touches |
| Model Agent | ❌ Never touches | ✅ Extract style + rhetorical patterns + domain vocabulary | ❌ Never touches |
| Template Agent | ❌ Never touches | ❌ Never touches | ✅ Identify fields + hints + classify content type |
| Mapping Agent | ✅ Uses project_data.json (entity-aware) | ⚡ Uses model_map.json (style only) | ✅ Uses template_schema.json |
| Writing Agent | ✅ Uses project_data.json (3-pass with quality scoring) | ⚡ Uses model_map.json (rhetorical patterns + vocabulary) | ❌ |
| Verification Agent | ✅ Cross-checks data + text quality + cross-entity | ⚡ Verifies no model data leaked | ❌ |

### Model Agent — FORBIDDEN Fields in model_map.json
The output of Model Agent must NEVER contain:
- Company names, person names, locality names
- Amounts, budgets, prices
- Calendar dates, CUI codes, CAEN codes
- Project-specific technical descriptions
- Any quoted or copied text fragment from the model

### Model Agent — ALLOWED Fields in model_map.json
```typescript
interface ModelMap {
  sections: {
    title: string;           // Section header pattern (e.g., "1. Introduction")
    contentType: 'narrative' | 'table' | 'list' | 'enumeration' | 'mixed';
    tone: 'formal' | 'technical' | 'accessible' | 'mixed';
    avgWordCount: number;    // Approximate length
    avgParagraphs: number;
    conventions: string[];   // Formatting patterns observed
  }[];
  globalStyle: {
    formality: 1 | 2 | 3 | 4 | 5;      // 1=casual, 5=very formal
    technicality: 1 | 2 | 3 | 4 | 5;   // 1=layperson, 5=expert
    sentenceLength: 'short' | 'medium' | 'long';
    listStyle: 'bullets' | 'numbered' | 'inline';
    referenceStyle: string;  // How cross-references are formatted
  };
  // v4: Deep rhetorical analysis
  rhetoricalPatterns: {
    openingPattern: string;       // How sections begin
    transitionStyle: string;      // How sections connect
    tableIntroStyle: string;      // How tables are introduced
    conclusionStyle: string;      // How conclusions are written
    crossRefStyle: string;        // Internal reference format
    listOrdering: 'chronological' | 'importance' | 'thematic';
    detailMap: Record<string, 'high-level' | 'moderate' | 'granular'>;
  };
  domainVocabulary: {
    preferredTerms: Record<string, string>;  // e.g., {"project": "obiectiv de investiții"}
    standardPhrases: string[];               // Recurring domain expressions
    excludedTerms: string[];                 // Words/phrases to avoid
  };
}
```

### Enforcement in Prompts
Every agent prompt that touches model_map.json MUST include:
```
CRITICAL RULE: You must NEVER use any factual data from the model document.
The model_map.json contains ONLY style and structural information.
ALL facts (names, dates, amounts, descriptions) come from project_data.json.
If you find yourself writing a company name, CUI, amount, or date that
appears in model_map.json, STOP — that data is contaminated.
```

### Verification Agent Cross-Check
The Verification Agent runs specific checks:
1. Extract all factual entities from the draft (names, CUIs, dates, amounts)
2. Compare against model_map.json metadata (if any leaked through)
3. Compare against project_data.json (all facts should trace back here)
4. Flag any fact that cannot be traced to source documents
5. **Cross-entity check**: verify beneficiary data isn't mixed with contractor data
6. **Text quality**: coherence, repetitions, terminology consistency, diacritics, length compliance
7. **Quality report**: global score + per-field scores on 4 dimensions (accuracy, style, completeness, coherence)

---

## Document Parsing Stack

### Detection Pipeline
```
File uploaded
  → Detect MIME type
  → Is it an image? (PNG/JPG/TIFF)
  │   → YES: Sharp preprocessing → Tesseract OCR → img2table (if tables detected) → Merge
  │   → NO: Is it a PDF?
  │       → YES: Does it have selectable text?
  │       │   → YES (native PDF): Apache Tika text + Camelot tables → Merge
  │       │   → NO (scanned PDF): Per-page → Sharp → Tesseract + img2table → Merge
  │       → NO: Is it a DOCX?
  │           → YES: Apache Tika text + XML table parsing → Merge
  │           → NO: Is it an XLSX/XLS?
  │               → YES: SheetJS → parse all sheets → structured tables → Merge
  │               → NO: Reject with error
  → Confidence scoring per block
  → Store structured JSON in MongoDB (linked to file SHA256)
```

### Preprocessing Pipeline (Sharp)
```typescript
// lib/parsing/preprocessor.ts
async function preprocessForOCR(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .greyscale()                    // Convert to grayscale
    .normalize()                    // Auto contrast enhancement
    .sharpen({ sigma: 1.5 })       // Sharpen text edges
    .threshold(128)                 // Binarize (Otsu's method preferred)
    .toBuffer();
}
```

### Confidence Scoring
```typescript
interface ExtractionBlock {
  id: string;
  type: 'text' | 'table' | 'heading' | 'list';
  content: string | TableData;
  source: 'tika' | 'tesseract' | 'easyocr' | 'img2table';
  confidence: number;              // 0-100
  page: number;
  position: { x: number; y: number; w: number; h: number }; // Bounding box
  warnings?: string[];             // e.g., "Low DPI detected"
}

// Confidence thresholds:
// >= 90%: High confidence, auto-accept
// 70-89%: Medium confidence, show in UI with yellow badge
// < 70%:  Low confidence, show with red badge + manual validation required
```

### Table Extraction from Images
```typescript
interface TableData {
  headers: string[];
  rows: string[][];
  mergedCells?: { row: number; col: number; rowSpan: number; colSpan: number }[];
  confidence: number;
}
```

### Supported Input Formats
| Format | Engine | Notes |
|--------|--------|-------|
| DOCX (native) | Apache Tika | Best quality, preserves structure |
| XLSX / XLS | SheetJS | All sheets parsed, formulas evaluated, merged cells expanded |
| PDF (native) | Tika + Camelot | Text + table structure |
| PDF (scanned) | Sharp → Tesseract → img2table | OCR + table detection |
| PNG / JPG | Sharp → Tesseract → img2table | Image OCR + table detection |
| TIFF | Sharp → Tesseract → img2table | Multi-page TIFF supported |

### OCR Language Support
Tesseract supports 80+ languages. Auto-detect document language or use user hint.
Primary: Romanian (ron), English (eng), French (fra), German (deu), Italian (ita), Spanish (spa).

---

## Upload & Entity Detection

### The Problem
A project often involves multiple entities: beneficiary, contractor, subcontractors. Documents contain data about different entities (e.g., 2 ID cards, 2 companies with different CUIs). Without disambiguation, the AI might put the contractor's name in the beneficiary field.

### Solution: Filename-Based Detection + Multiple Suggestions

**Simple approach, two layers:**

**Layer 1 — Filename + Content Detection (Extractor Agent):**
Extractor Agent receives the original filename as metadata. `CI_beneficiar_Popescu.pdf` gives a strong hint. Combined with content analysis ("Beneficiarul: SC X SRL"), the agent assigns roles automatically.

**Layer 2 — Multiple Suggestions (Writing Agent):**
When the agent CAN'T determine which entity a field belongs to, it generates one suggestion per possible entity and lets the user pick. No complex UI, no dropdowns at upload — just present options at the point where it matters.

**UI hint at upload:** "For best results, name your files descriptively — e.g., CI_beneficiar_Popescu.pdf, Contract_furnizor.pdf"

### Entity-Based project_data.json Schema

```typescript
interface ProjectData {
  entities: {
    beneficiary?: EntityData;
    contractor?: EntityData;
    subcontractors?: EntityData[];
    unassigned?: EntityData[];  // Entities where role couldn't be determined
  };
  project: {
    title: string;
    description: string;
    location: string;
  };
  financial: {
    budget: { total: number; currency: string };
  };
  dates: Record<string, string>;
  tables: {
    name: string;
    headers: string[];
    rows: string[][];
  }[];
}

interface EntityData {
  company_name: string;
  cui: string;
  address: string;
  representative: {
    name: string;
    role: string;
    id_series?: string;
    id_number?: string;
  };
  contact?: { phone: string; email: string };
  source_file: string;     // Original filename for traceability
}
```

### How It Flows Through the Pipeline
1. **Extractor Agent**: organizes data into entities using filename + content hints. Unknown → `unassigned[]`
2. **Mapping Agent**: maps entity fields to template fields. Ambiguous → marks as `needs_multiple_suggestions`
3. **Writing Agent**: for ambiguous fields, generates one suggestion per possible entity. User sees 2-3 cards to pick from.
4. **Verification Agent**: checks that beneficiary data isn't mixed with contractor data
5. **UI propagation**: after user picks an entity for one field, related fields in the same section auto-fill with the same entity

---

## Template Preview (When No Model Is Uploaded)

When the user does NOT upload a model document, the system provides an interactive preview of the blank template:

### Flow
1. Template Agent analyzes the template DOCX
2. Identifies all fillable fields (blank cells, placeholder text, empty paragraphs after headings)
3. Generates hints for each field based on context (headers, table labels, adjacent text)
4. UI renders the template with annotated fields

### Field Hint Generation
```typescript
interface TemplateField {
  id: string;                        // Unique field ID (e.g., "field_001")
  location: {
    section: string;                 // Section name/number
    paragraph?: number;              // Paragraph index
    table?: { row: number; col: number }; // Table cell position
  };
  expectedType: 'text' | 'number' | 'date' | 'list' | 'narrative';
  hint: string;                      // Auto-generated hint
  // e.g., "Company full name", "Project start date (DD.MM.YYYY)",
  //       "Technical description — narrative text, 200-500 words"
  userHint?: string;                 // User can edit/override the hint
  estimatedLength?: string;          // "1-3 words", "2-3 sentences", "200-500 words"
}
```

### UI Behavior
- Template displayed read-only with field badges numbered #1, #2, ...#N
- Each badge shows the hint on hover/click
- User can edit hints to guide AI better
- "This is a preview. Upload source documents and run AI to fill these fields."
- Fields are color-coded by type: blue=text, green=number, orange=date, purple=narrative

---

## AI Pipeline — Agent Prompts

### Agent Chain (Sequential)
```
1. Extractor Agent (Sonnet 4.5)     → project_data.json (entity-based, validated)
2. Model Agent (Sonnet 4.5)         → model_map.json (deep rhetorical analysis)  [OPTIONAL]
3. Template Agent (Sonnet 4.5)      → template_schema.json (with field classification)
4. Mapping Agent (Sonnet 4.5)       → draft_plan.json (strategy per field type)
5. Writing Agent (Opus 4.6)         → field completions (3-pass: generate → coherence → polish)
6. Verification Agent (Opus 4.6)    → quality report (scores + errors + suggestions)
```

### Estimated Cost per Document
~$0.50–$1.20 (4 agents on Sonnet + 2 on Opus, Writing Agent 3-pass adds ~2x cost but dramatically better quality)

### Model Configuration
```typescript
const AGENT_MODELS = {
  extractor:    'claude-sonnet-4-5-20250929',
  model:        'claude-sonnet-4-5-20250929',
  template:     'claude-sonnet-4-5-20250929',
  mapping:      'claude-sonnet-4-5-20250929',
  writing:      'claude-opus-4-6',
  verification: 'claude-opus-4-6',
} as const;
```

### Extractor Agent — Data Validation (v4)
Beyond extracting data, the Extractor validates every field:

| Validation | What | Action on Error |
|-----------|------|-----------------|
| CUI format | RO + 2-10 digits, valid checksum | Flag `invalid_format` |
| Date format | Calendar coherence (no 31.02) | Flag `date_invalid` |
| IBAN format | RO + 2 check + 4 bank + 16 alphanum | Flag `iban_invalid` |
| CAEN code | 4 digits, exists in nomenclator | Flag `caen_invalid` |
| Intra-doc consistency | Same entity, different values in same doc | Flag `contradiction` |
| Cross-doc consistency | Same entity, different values across docs | Flag `cross_doc_mismatch` |
| Completeness | Critical fields missing (CUI, name, address) | Flag `missing_critical` |
| Numeric coherence | Totals vs sum of components in financial tables | Flag `sum_mismatch` |

Flagged fields show orange/red badges in UI. User can correct or accept with warning.

### Model Agent — Deep Rhetorical Analysis (v4)
Beyond tone and length, the Model Agent extracts what makes a document "sound" professional:

**Rhetorical patterns extracted:**
- **Section openings**: how each section type begins (contextualize → specific)
- **Transitions**: how sections connect to each other
- **Table introductions**: how tables are presented before display
- **Conclusions**: how sections/document are summarized
- **Cross-references**: internal reference style ("see Section X, Table Y")
- **Detail level map**: granularity per section type (intro=high-level, technical=granular)

**Domain vocabulary:**
- Recurring terminology (e.g., "obiectiv de investiții" not "proiect")
- Standard phrases ("în conformitate cu prevederile...", "asumat prin contractul de finanțare nr...")
- Excluded vocabulary (colloquial, jargon, anglicisms)

Output: `rhetorical_patterns` + `domain_vocabulary` fields in model_map.json. Zero factual data.

### Template Agent — Field Classification (v4)
Each field gets a content type classification:

| Type | Description | Strategy |
|------|------------|----------|
| `copy` | Direct copy from project_data.json | No AI generation |
| `narrative` | Generated text (descriptions, justifications) | Writing Agent multi-pass |
| `table_fill` | Table cells from structured data | Data mapping |
| `computed` | Calculated from other fields (totals, %) | Formula evaluation |
| `conditional` | Exists only if condition met | Evaluate at export |

### Writing Agent — Quality Engine (v4)

**3-Pass Generation:**

| Pass | What | Why |
|------|------|-----|
| Pass 1: Generate | Write each narrative field in order. Copy/computed fields pre-filled. | Complete coverage |
| Pass 2: Coherence | Re-read ENTIRE draft. Check: data consistency, cross-references, narrative flow, no repetitions | Document reads as a whole, not glued pieces |
| Pass 3: Polish | Grammar, terminology uniformity, length adjustment, tone consistency with model_map | Professional language quality |

3 separate Opus API calls. Pass 2 and 3 receive previous pass output as input.

**Context Awareness:**
- Avoids repeating same constructions across sections
- Creates internal references ("as detailed in Section 3, the total budget...")
- Same amount/name appears identically everywhere (format, currency, rounding)

**Content-Type Adaptation:**
- Narrative intro → broad context → specific detail, using opening_pattern from model
- Technical description → granular, precise, domain terminology
- Conclusion → factual summary, reference to objectives
- Table cell → short, factual, no full sentences
- Copied field → zero AI generation, exact data

**Romanian Domain Formatting:**
- Dates: DD.MM.YYYY (15.02.2026)
- Amounts: 1.250.000,50 lei (dot=thousands, comma=decimals, "lei" not "RON" in narrative)
- CUI: with RO prefix if VAT payer
- Legislative refs: full form first mention, abbreviated after
- Diacritics: MANDATORY correct ș ț ă â î (never ş ţ cedilla)
- Legal phrases: standard Romanian public administration language

**Quality Score per Field:**

| Dimension | What it measures | Score |
|-----------|-----------------|-------|
| Factual accuracy | All data correctly from project_data.json? | 0-100 |
| Style & tone | Matches model_map.json (or professional generic)? | 0-100 |
| Completeness | Covers everything expected (per template_schema)? | 0-100 |
| Coherence | Consistent with rest of document? | 0-100 |

Fields scoring <70 on any dimension flagged for manual review with specific reason.

### Verification Agent — Quality Report (v4)

**Data Integrity Checks:**
- Values appearing in multiple places must be identical
- Financial totals vs sum of components
- Valid cross-references (section X mentions Y, Y exists?)
- Correct formatting (dates, amounts, CUI, IBAN per Romanian conventions)
- No factual data from model document
- No cross-entity contamination (beneficiary ≠ contractor data)

**Text Quality Checks:**
- Narrative coherence: logical flow, no abrupt topic jumps
- Repetition detection: same constructions in different sections
- Terminology consistency: same concepts named identically throughout
- Diacritics: all Romanian diacritics correct (ș not ş, ț not ţ)
- Length compliance: narrative fields within ±20% of model_map target

**Output: Quality Report**
```typescript
interface QualityReport {
  global_score: number;          // 0-100, average of all fields
  errors: ValidationIssue[];     // Must fix before export
  warnings: ValidationIssue[];   // Should review
  suggestions: string[];         // Nice to improve
  field_scores: Record<string, {
    accuracy: number;
    style: number;
    completeness: number;
    coherence: number;
  }>;
}
```
Displayed in UI as a document "health check" with navigation to problematic fields.

### Tool Use Pattern
All agents use structured tool use for output:
```typescript
const extractorTool = {
  name: 'save_extracted_data',
  description: 'Save validated extracted data organized by entities',
  input_schema: {
    type: 'object',
    properties: {
      entities: {
        type: 'object',
        properties: {
          beneficiary: { $ref: '#/definitions/EntityData' },
          contractor: { $ref: '#/definitions/EntityData' },
          unassigned: { type: 'array', items: { $ref: '#/definitions/EntityData' } }
        }
      },
      project: { type: 'object' },
      financial: { type: 'object' },
      dates: { type: 'object' },
      tables: { type: 'array' },
      validation_issues: { type: 'array' }
    }
  }
};
```

---

## Incremental Processing (SHA256 Cache)

1. On upload, each file gets a SHA256 hash
2. Extraction result is saved in MongoDB linked to the file hash
3. On re-upload or new file addition, hashes are compared
4. Only files with changed hashes are re-processed through Extractor Agent
5. Results are merged into existing project_data.json
6. Downstream agents (Mapping, Writing) re-run with updated data

```typescript
// lib/utils/hash.ts
import { createHash } from 'crypto';

export async function hashFile(buffer: Buffer): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex');
}
```

---

## Assisted Writing UI

### Split-Screen Layout
- **Left pane (60%):** Document preview — template with completed fields highlighted in yellow, numbered #1...#N
- **Right pane (40%):** Suggestion wizard — for each field, shows AI suggestion and available actions

### Field Actions
| Action | Description | Effect |
|--------|-------------|--------|
| Accept | Accept AI suggestion | Field turns green, text saved |
| Edit | Open inline editor | User modifies text manually |
| Regenerate | Request new AI suggestion | API call with optional extra context |
| Skip | Skip field | Field stays empty, marked red |

### Multiple Suggestions for Ambiguous Fields
When Writing Agent can't determine which entity a field belongs to (e.g., "Company name" but 2 companies exist), instead of guessing it presents multiple suggestions as cards:
- Each card shows the value + source filename
- User clicks the correct one — single click, no complex dropdowns
- After picking an entity for one field, related fields in the same section auto-fill with the same entity
- If no suggestion fits, user can always Edit manually

### Draft Versioning
Every modification (accept, edit, regenerate, choose) creates a snapshot in MongoDB.
- Undo per field (last version)
- Undo All (revert to original AI suggestion)

---

## Export

### Generation Strategy
Two approaches combined:

| Approach | When | How |
|----------|------|-----|
| Template replacement | Simple fields (short text, numbers, dates) | Placeholder replaced directly, preserving formatting |
| Section generation | Narratives, dynamic tables, conditional sections | docx-js generates new content with style from model_map.json |

**Rule:** Always prefer template replacement. Generation only when document structure changes.

### Dynamic Table Rows
Many templates have tables where row count depends on the project (cost estimates, equipment lists, execution schedules).

```typescript
interface DynamicTable {
  templateTableIndex: number;     // Which table in the template
  modelRowIndex: number;          // Which row is the "model" row to clone style from
  dataSource: string;             // Path in project_data.json (e.g., "financial.budget_lines")
  autoTotals: boolean;            // Recalculate totals/subtotals
}
```

Flow:
1. Template Agent detects variable-row tables (empty rows, `...` placeholders, single example row)
2. Mapping Agent maps the table to an array in project_data.json
3. At export, docx-js clones the model row's style (borders, font, alignment, alternating colors) for each data element
4. If array is empty → single row with italic "No data available"

### Conditional Sections
Some template sections exist only if relevant (e.g., "Subcontractors", "Environmental Impact").

```typescript
interface ConditionalSection {
  sectionId: string;
  condition: string;              // e.g., "entities.subcontractors.length > 0"
  includeHeading: boolean;        // Remove heading too when section is omitted
}
```

- Template Agent marks optional sections in template_schema.json with `conditional: true`
- At export: condition evaluated → section omitted cleanly (heading + content + TOC entry removed)
- Section numbering auto-adjusts
- User can force include/exclude via toggle in the wizard

### Header/Footer Data Replacement
Template Agent scans DOCX header/footer for placeholders (`[Company Name]`, `[Contract No.]`, `[Date]`).
Mapping Agent maps them to project_data.json. At export, docx-js replaces them preserving original font/size/alignment.
`[Page]` / `[Total Pages]` → native DOCX field codes (PAGE / NUMPAGES).

### PDF Generation
- DOCX → PDF via LibreOffice headless
- Command: `libreoffice --headless --convert-to pdf document.docx`

### Credit System
- Each DOCX export = 1 credit
- Each PDF export = 1 credit
- Each AI regeneration = 0.5 credits

---

## User Dashboard & Analytics

Each user gets a personal dashboard with usage metrics. Purpose: transparency, cost control, and internal justification.

### Dashboard Widgets

| Widget | What it shows | Visual |
|--------|--------------|--------|
| Credits remaining | X / Y credits used this month | Circular progress bar |
| Projects this month | Count by status (draft/processing/ready/exported) | Number + status breakdown |
| Estimated cost/doc | Average AI cost per processed document | Text with trend arrow |
| Usage history | Documents processed per month (last 6 months) | Monthly bar chart |
| Time saved | Estimated hours saved vs manual completion | Number + motivational badge |
| Recent activity | Last 5 actions (upload, processing, export) | Chronological list |

### Metric Calculations
```typescript
// Credits: SUM(credits_used) from document_generations WHERE user_id AND current month
// Cost/doc: AVG(ai_cost_usd) from document_generations last 30 days
// Time saved: count of auto-accepted fields × 3 min/field (conservative estimate)
// Trend: current month vs previous month → green arrow (up) or red (down)
```

### Credit Alerts
- 80% credits used → yellow banner on dashboard suggesting upgrade
- 100% credits used → red banner, export blocked, CTA to upgrade

### Implementation
- Source: `document_generations` + `projects` collections, aggregated by user_id
- Cache: metrics calculated at login, cached 15 minutes (not real-time)
- Privacy: user sees ONLY own metrics, admin sees anonymized aggregates

---

## Auto-Delete Policy

| Stage | Status | Action | Timeout |
|-------|--------|--------|---------|
| Upload | uploaded | File stored in R2 | — |
| Processing | processing | AI extracts data + OCR if needed | — |
| Extracted | extracted | Data saved in MongoDB, file still available | 24h |
| Deleted | deleted | File deleted from R2, only metadata remains | Auto |

Every deletion logged in `file_audit_log` collection with timestamp, file_hash, project_id, reason.

---

## Error Handling

### Pipeline Retries
| Error | Strategy | UI Action |
|-------|----------|-----------|
| API timeout | Retry 3x exponential backoff (5s, 15s, 45s) | "Reprocessing..." |
| Rate limit (429) | Queue with delay, retry after header | Updated ETA |
| Invalid output | Re-prompt with error + corrective instructions | Transparent retry |
| OCR failure | Fallback to EasyOCR; if both fail, mark manual | Warning + re-upload option |
| Table not detected | Retry adjusted params; fallback to plain OCR | Manual zone marking |
| Total failure | Save partial state, mark job "failed" | Retry button + support |

### Validation Rules
- Max file size: 25MB
- Max source files: 10
- Max model files: 2
- Accepted formats: PDF, DOCX, XLSX, XLS, PNG, JPG, TIFF
- R2 TTL: 24 hours

---

## User Roles

### User (Standard)
- Create projects, upload documents, run AI, validate suggestions, export

### Admin
- User dashboard, usage statistics, enable/disable accounts, set limits, view audit logs

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

MONGODB_URI=mongodb+srv://...

CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY=...
CLOUDFLARE_R2_SECRET_KEY=...
CLOUDFLARE_R2_BUCKET=docfides-uploads

ANTHROPIC_API_KEY=sk-ant-...

REDIS_URL=redis://...

SENTRY_DSN=https://...

NEXT_PUBLIC_APP_URL=https://docfides.ro
```

---

## Performance Targets

- AI pipeline: < 2 min for 20-page source document
- OCR per page: < 5 seconds (with preprocessing)
- Table extraction from image: < 10 seconds per table
- DOCX/PDF export: < 10 seconds (simple), < 30 seconds (50+ dynamic table rows)
- Dashboard analytics: cached 15 min, recalculation < 2 seconds
- First Contentful Paint: < 1.5s
- API latency (non-AI): < 200ms p95

---

## Landing Page Architecture

The landing page is at `/[locale]/page.tsx` and is built as a series of full-width sections, each a separate component in `components/landing/`.

### Section Order
1. **Navbar** — Logo, nav links, LocaleSwitcher (EN/RO), Sign In / Get Started buttons
2. **Hero** — Big headline, sub-headline, primary CTA, animated document transformation visual
3. **HowItWorks** — 4-step flow: Upload → AI Processes → Review & Edit → Export
4. **Features** — Grid of key features with icons
5. **Parsing** — Showcase: "Best-in-class document parsing" — OCR, tables from images, scanned PDFs, with before/after visuals
6. **BeforeAfter** — Side-by-side: messy source docs → polished output
7. **Pricing** — 3-tier cards (Free / Professional / Enterprise)
8. **Testimonials** — Social proof (placeholder for MVP)
9. **FAQ** — Accordion with common questions
10. **CTA** — Final call-to-action banner
11. **Footer** — Links, legal, social, language switcher

### Design Direction
See the detailed notes in the Landing Page Design section below.

---

## Landing Page Design

### Aesthetic: "Precision Trust" — Clean, professional, trustworthy with subtle warmth

This is a B2B documentation tool. Users are consultants, project managers, engineers. The design must convey:
- **Competence** — This tool knows what it's doing
- **Trust** — Safe to upload sensitive documents
- **Efficiency** — Saves massive time
- **Sophistication** — Not a toy, not intimidating

### Color Palette
```css
:root {
  /* Primary */
  --color-primary-50: #EFF6FF;
  --color-primary-100: #DBEAFE;
  --color-primary-500: #3B82F6;
  --color-primary-600: #2563EB;
  --color-primary-700: #1D4ED8;
  --color-primary-900: #1E3A5F;

  /* Accent (warm) */
  --color-accent-400: #FB923C;
  --color-accent-500: #F97316;

  /* Neutrals */
  --color-gray-50: #F8FAFC;
  --color-gray-100: #F1F5F9;
  --color-gray-200: #E2E8F0;
  --color-gray-500: #64748B;
  --color-gray-700: #334155;
  --color-gray-900: #0F172A;

  /* Status */
  --color-success: #22C55E;
  --color-warning: #EAB308;
  --color-error: #EF4444;

  /* Confidence badges */
  --color-confidence-high: #22C55E;
  --color-confidence-medium: #EAB308;
  --color-confidence-low: #EF4444;
}
```

### Typography
- **Headlines:** "Plus Jakarta Sans" (Google Fonts) — geometric, modern, trustworthy
- **Body:** "Inter" fine for body text (not headlines)
- **Mono/Code:** "JetBrains Mono" for any technical display

### Hero Section
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] DocFides    How it Works  Features  Pricing  │ EN▾│ Sign In │ Get Started →  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Transform source documents                                │
│   into complete documentation               ┌─────────────┐│
│                                              │  Animated   ││
│   Upload your sources, let AI extract,       │  document   ││
│   map, and write. Review, edit, export.      │  transform  ││
│   Done.                                      │  visual     ││
│                                              └─────────────┘│
│   [Start Free →]  [See How It Works]                        │
│                                                             │
│   ✓ OCR & table extraction  ✓ 50+ languages  ✓ GDPR safe   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Animated visual:** A smooth animation showing:
1. Stack of messy documents (PDF, scan, photo of table) floating in
2. Documents being "processed" (scanning line, highlight effects)
3. Clean, polished document emerging on the other side

### How It Works Section
4 numbered steps in a horizontal flow with connecting lines:

```
   ①                    ②                    ③                    ④
┌──────┐           ┌──────┐           ┌──────┐           ┌──────┐
│Upload│ ────────→ │  AI  │ ────────→ │Review│ ────────→ │Export│
│ Docs │           │Parse │           │& Edit│           │DOCX/ │
│      │           │& Fill│           │      │           │ PDF  │
└──────┘           └──────┘           └──────┘           └──────┘
 Sources,           6 AI agents        Split-screen       One click,
 templates,         extract, map,      editor with        preserving
 model examples     and write          accept/edit/skip   all formatting
```

### Parsing Showcase Section
This is a KEY differentiator section. Show:
- **Left:** Photo of a crumpled, slightly rotated scanned document with a table
- **Right:** Clean extracted JSON/table output
- Badges: "Tesseract 5 OCR", "Table Detection", "Auto Deskew", "80+ Languages"
- Confidence meter visual showing 94% accuracy

### Pricing Section
3 cards, middle one highlighted:
```
┌─────────────┐  ┌──────────────────┐  ┌─────────────┐
│    Free      │  │  ★ Professional  │  │  Enterprise  │
│              │  │                  │  │              │
│  3 docs/mo   │  │   50 docs/mo     │  │  Unlimited   │
│  0 RON       │  │   99 RON/mo      │  │  Custom      │
│              │  │                  │  │              │
│  [Start →]   │  │  [Subscribe →]   │  │  [Contact →] │
└─────────────┘  └──────────────────┘  └─────────────┘
```

### Responsive Design
- Desktop: Full layout with side-by-side visuals
- Tablet: Stacked with reduced animations
- Mobile: Single column, essential content only, sticky CTA

### Key Animations
- Hero: Document transformation sequence (CSS + Framer Motion)
- How It Works: Steps appear on scroll with stagger
- Parsing section: Scan line effect on the "before" image
- Numbers: Count-up animation for stats (70% time saved, etc.)
- All animations respect `prefers-reduced-motion`

---

## MVP Scope

### Included
1. User/admin auth (Clerk)
2. Create project + upload documents (source + template + optional 1-2 models)
3. Full AI pipeline (6 Claude agents, with model data isolation)
4. Best-in-class parsing: OCR (Tesseract + EasyOCR), table extraction from images (img2table)
5. Automatic image preprocessing (deskew, denoise, binarize)
6. Blank template preview with per-field hints + field classification (copy/narrative/table_fill/computed/conditional)
7. Entity-based extraction with data validation (CUI, IBAN, dates, cross-doc consistency, numeric coherence)
8. Deep rhetorical analysis from model document (patterns, transitions, domain vocabulary)
9. Writing Agent 3-pass generation (generate → coherence → polish) with quality scoring per field
10. Romanian domain formatting (dates, amounts, diacritics, legal phrases, legislative references)
11. Multiple suggestions when ambiguous — Writing Agent offers options, user picks
12. Verification Agent with quality report (global score + per-field accuracy/style/completeness/coherence)
13. Incremental processing (SHA256 cache)
14. Assisted writing (split-screen, wizard, accept/edit/regenerate/skip)
15. Robust DOCX/PDF export: dynamic table rows, conditional sections, header/footer data replacement
16. User dashboard with analytics: credits, projects, cost/doc, usage history, time saved
17. Document generation counting (credits)
18. Auto language detection
19. Auto-delete files + audit log
20. Admin dashboard (users, stats, enable/disable)
21. Error handling with retry, OCR fallback, draft versioning
22. Confidence score per extracted field (flagging below 70%)
23. i18n: English (default) + Romanian

### Excluded from MVP (Post-Launch Roadmap)
- Multi-user collaboration on same project
- Public API for third-party integrations
- Enterprise SSO
- Payment system (Stripe)
- Mobile app
- Template marketplace
- Google Drive / OneDrive integration
- Custom OCR model training
- Complex layout detection (multi-column, checkbox forms)

---

## Commands Cheat Sheet

```bash
# Development
npm run dev                    # Start Next.js dev server
npm run workers               # Start BullMQ workers

# Database
npm run db:seed               # Seed test data
npm run db:migrate             # Run migrations

# Testing
npm run test                   # Run all tests
npm run test:ocr               # Test OCR pipeline specifically

# Build & Deploy
npm run build                  # Build for production
npm run lint                   # ESLint
npm run type-check             # TypeScript check
```
