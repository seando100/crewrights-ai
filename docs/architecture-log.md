# CrewRights AI — Architecture Log

A running record of all architectural decisions, infrastructure choices, and significant changes made to this project. Entries are ordered chronologically. Each entry describes what was decided, why, and any key constraints discovered.

---

## Session: 2026-02-26

### ADR-001 — Ingestion Pipeline Language Runtime

**Decision:** Use `tsx` to execute TypeScript ingestion scripts directly in Node.js.

**Context:** Scripts in `scripts/` are TypeScript but need to run in Node without a build step. `ts-node` was not already installed.

**Choice:** Installed `tsx` as a dev dependency. Added `"ingest": "tsx scripts/ingest-cba.ts"` to `package.json` scripts.

**Constraint discovered:** `@/` path aliases do not resolve in Node script context. All imports inside `scripts/` must use relative paths (e.g., `../src/lib/...`).

---

### ADR-002 — PDF Parsing Library

**Decision:** Use `pdf-parse` v2.4.5 with its class-based API.

**Context:** `pdf-parse` v2 changed its export from a default function to a named class. Multiple import styles failed before the correct one was found.

**Correct usage:**
```typescript
import { PDFParse } from "pdf-parse";
const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
const data = await parser.getText();
await parser.destroy();
```

**Failed approaches:**
- `import pdf from "pdf-parse"` — v2 has no default export
- `require("pdf-parse")` — CJS/ESM interop failure with tsx

---

### ADR-003 — Embedding Model

**Decision:** Use OpenAI `text-embedding-3-small` (1536 dimensions).

**Context:** Cost-effective, well-supported by Supabase pgvector. Sufficient for contract text retrieval.

**Chunk size:** 1400 characters max, split on paragraph boundaries (`\n\n`). This preserves semantic units while staying within embedding model input limits.

---

### ADR-004 — Vector Store

**Decision:** Use Supabase with the `pgvector` extension.

**Table:** `cba_chunks`

**Schema columns:**
- `airline` (text)
- `union_name` (text)
- `contract_version` (text)
- `text_content` (text)
- `embedding` (vector, 1536)
- `metadata` (jsonb) — contains `chunk_index`, `section_number`, `section_title`

**RPC function:** `match_cba_chunks(query_embedding, filter_airline, filter_contract_version, match_count)` — defined in Supabase SQL editor, returns rows ordered by cosine similarity.

**Client initialization:** Supabase client uses `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`. The secret key format is `sb_secret_*` (new API key format). Session persistence is disabled (`persistSession: false`) for server-side use.

---

### ADR-005 — Text Cleaning Strategy

**Decision:** Apply `cleanText()` before chunking, not after.

**What it removes:**
- Page markers matching `-- N of M --`
- Lines consisting only of digits (page number artifacts)
- Runs of 3+ blank lines collapsed to 2

**TOC handling:** Chunks whose `text_content` contains `"table of contents"` (case-insensitive) are skipped entirely at insert time — they contribute no retrievable knowledge.

---

### ADR-006 — Section Header Detection (Final)

**Decision:** Detect section headers via inline regex on full chunk text, not line-by-line.

**Background:** The CBA PDF uses section headers in the format:
```
SECTION 9 – SICK LEAVE
```
With en dash (`–`) or em dash (`—`), not always a plain hyphen.

**Root cause of earlier failure:** `chunkText()` collapses all intra-paragraph newlines via `.replace(/\s+/g, " ")`. A line-by-line scan of chunked text yields one long line per chunk, so `^SECTION` anchored regex never matched. Switched to unanchored inline match.

**Final regex (in chunk loop):**
```typescript
text_content.match(/SECTION\s+(\d+)\s*[-–—]\s*([A-Z][A-Z\s(),/&–—-]*?)(?=\s+[A-Z]\.)/)
```

**Capture group rationale:**
- `([A-Z][A-Z\s(),/&–—-]*?)` — non-greedy, uppercase-only characters (section titles are always ALL CAPS)
- `(?=\s+[A-Z]\.)` — lookahead stops capture before the first subsection letter (e.g., ` A.`)
- This prevents body text bleed (e.g., `"SCHEDULING A"` → fixed to `"SCHEDULING"`)

**Diagnostic loop:** A separate pre-chunk loop using `detectSectionHeader()` with `^` and `$` anchors runs on raw lines before chunking. This is console-only and correctly detected all 39 sections.

**Result:** 299 chunks ingested from 39 sections of the 2024 APFA/American Airlines CBA.

---

### ADR-007 — Next.js App Router Directory Structure

**Decision:** All API routes live in the root `app/` directory, not `src/app/`.

**Context:** The project scaffold placed `app/layout.tsx` and `app/page.tsx` at the project root. A route placed in `src/app/api/` was silently ignored (404). Moved to `app/api/query/route.ts`.

**Import path constraint:** Because `@/` maps to the project root (not `src/`), imports from `app/` into `src/lib/` must use explicit relative paths:
```typescript
import { queryCBA } from "../../../src/lib/queryCBA";
```

---

### ADR-008 — Query API Route

**File:** `app/api/query/route.ts`

**Method:** POST only.

**Request:** `{ "question": string }`

**Pipeline:**
1. Validate `question` is a non-empty string
2. Embed question with `text-embedding-3-small`
3. Run `match_cba_chunks` RPC (top 5 results)
4. **Relevance gate:** if `matches[0].similarity < 0.55`, return `400` with `{ error: "Question does not pertain to the contract." }`
5. Pass question + matches to `synthesizeAnswer()`
6. Return `AmeliaResponse` (no raw chunks in response)

**Threshold rationale:** Off-topic questions (e.g., "Who is the CEO?") produced a top similarity of ~0.49. On-topic questions (e.g., sick leave accrual) scored ~0.65. Threshold of `0.55` cleanly separates them with observed data.

---

### ADR-009 — Answer Synthesis (Amelia)

**File:** `src/lib/amelia/synthesizeAnswer.ts`

**Model:** `gpt-4o-mini` with `response_format: { type: "json_object" }`, `temperature: 0`.

**Persona:** Amelia — a contract translator for APFA flight attendants.

**System prompt rules enforced:**
- Use only provided contract excerpts
- Do not use outside knowledge
- If not stated in excerpts, say "The contract does not clearly specify this"
- Do not provide legal advice
- Answer in plain language for a flight attendant
- Provide 2–5 citations (prefer highest similarity chunks)
- If question is vague or situation-dependent, ask exactly 1 clarifying question and set `clarification_needed: true`
- Output strict JSON only — no markdown, no extra keys

**Response shape (`AmeliaResponse`):**
```typescript
{
  answer: string;
  citations: Array<{
    section_number: string | null;
    section_title: string | null;
    chunk_index: number | null;
    quote?: string;
  }>;
  clarification_needed?: boolean;
  clarifying_question?: string;
}
```

**Hard requirement:** If the model cannot find support for a claim in the provided chunks, it must not state it as fact.

---

## Key File Map

| File | Purpose |
|------|---------|
| `scripts/ingest-cba.ts` | PDF → chunks → embeddings → Supabase |
| `scripts/truncate-cba.ts` | Wipe `cba_chunks` table for fresh ingest |
| `scripts/verify-ingest.ts` | Row count + first 5 rows sanity check |
| `scripts/check-metadata.ts` | Inspect `metadata` JSON per row |
| `src/lib/queryCBA.ts` | Embed question → Supabase RPC → ranked chunks |
| `src/lib/amelia/synthesizeAnswer.ts` | LLM synthesis → structured `AmeliaResponse` |
| `src/lib/supabaseServer.ts` | Supabase client singleton |
| `src/lib/openai.ts` | OpenAI client singleton |
| `app/api/query/route.ts` | POST `/api/query` — full pipeline orchestration |
| `data/2024-CBA_121724.pdf` | Source document (APFA/American Airlines 2024 CBA) |
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` |

---

## Environment

- **Runtime:** Node.js 24 / Next.js 16.1.6 (App Router, Turbopack)
- **Language:** TypeScript, executed via `tsx` for scripts
- **Platform:** Windows 11, bash shell
- **Vector DB:** Supabase (pgvector, `match_cba_chunks` RPC)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims)
- **Synthesis LLM:** OpenAI `gpt-4o-mini`
- **Chunks in DB:** 299 (from 39 sections, 2 TOC chunks skipped)
