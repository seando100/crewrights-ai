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

## Session: 2026-02-26 (continued) — Pipeline Overhaul

### ADR-010 — Remove Hard Similarity Gate; Add `lowConfidence` Flag

**Decision:** Removed the hard `0.55` similarity threshold that returned a 400 error. Replaced with a `lowConfidence: boolean` flag passed to `synthesizeAnswer`.

**Rationale:** The hard gate produced false negatives — legitimate contract questions with borderline embeddings were rejected outright. The LLM is better placed to determine whether the retrieved chunks are relevant. Under low confidence, `synthesizeAnswer` classifies the query as PROCEDURAL/OFF-TOPIC, AMBIGUOUS, or GROUNDED and responds accordingly.

**Constraint:** Empty `citations` array is now allowed (not a validation error) to support off-topic redirects.

---

### ADR-011 — Conditional Variable Clarification with Structural Guard

**Decision:** When the correct answer depends on a variable the user has not provided (e.g., domestic vs. international, lineholder vs. reserve), the model must set `clarification_needed: true`, provide exactly one `clarifying_question`, and omit `answer` and `citations` entirely.

**Enforcement:** `validateGroundedResponse()` in `route.ts` branches on `clarification_needed` first:
- Clarification path: throws `"Clarification answer contamination"` if `answer` is present; throws `"Clarification citations contamination"` if `citations` is non-empty.
- Answer path: requires non-empty `answer`, valid `citations` array, each citation grounded to a real chunk by `chunk_index` + `section_number` + `section_title`.

**`AmeliaResponse` shape change:** `answer` and `citations` made optional (`answer?: string`, `citations?: Citation[]`) to support the clarification path.

---

### ADR-012 — Conversation Memory (Chat History)

**Decision:** The UI maintains a full `messages: Message[]` state. Every submission sends the complete prior history to `POST /api/query` as a `history` array of `{ role, content }` pairs. `synthesizeAnswer` injects the last 12 turns as OpenAI message objects between the system prompt and the current user message.

**Follow-up retrieval anchor:** Short follow-ups (≤ 3 words) produce poor vector retrieval because the query carries no semantic content. `buildRetrievalQuery()` in `route.ts` detects this and substitutes the last substantial user message from history (> 3 words) as the retrieval query. This ensures "33" retrieves rest-period chunks, not nothing.

```typescript
function buildRetrievalQuery(question, history): string {
  const words = question.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3 && history.length > 0) {
    const lastSubstantial = [...history].reverse()
      .find(h => h.role === "user" && h.content.trim().split(/\s+/).length > 3);
    if (lastSubstantial) return lastSubstantial.content;
  }
  return question;
}
```

**`isFollowUp` bypass:** If `history.length > 0`, the vague intent gate is skipped so short follow-ups are not rejected as incomplete questions.

---

### ADR-013 — Advisor Persona and UI Polish

**Decision:** Complete `SYSTEM_PROMPT` rewrite establishing Amelia as a **Union Contract Advisor** (not a chatbot or search tool).

**Prompt rules added:**
- CONDITIONAL VARIABLE RULE (non-negotiable): ask exactly one clarifying question when a branching variable is missing
- NOT COVERED RULE: state clearly what the contract does not address; no defensive hedging
- DATE AND NUMBER PRECISION RULE: only state values explicitly written in the cited clause
- CONVERSATION RULES: interpret short follow-ups in the context of the most recent topic; do not re-ask for known variables

**UI changes:**
- `AmeliaAvatar` SVG component (indigo circle, person silhouette)
- Citations always visible (removed expandable toggle — extra friction, no benefit)
- Citation card: `SECTION N — TITLE` header + left-border quote block
- Clarification bubble: amber border + `"To give you the correct rule —"` prefix in small text
- Empty state: three-line intro matching Amelia's advisor voice
- "New chat" button resets message history

---

### ADR-014 — Intent Pre-Classification Layer (Zero LLM Cost)

**File:** `src/lib/amelia/classifyIntent.ts`

**Decision:** Add a rule-based intent classifier that runs before any LLM or retrieval call, catching inputs that should never reach the pipeline.

**Intent types:** `"greeting" | "thanks" | "vague" | "contract"`

**Classification logic:**
- Exact-match sets: `GREETINGS` and `THANKS` (~15 phrases each)
- Greeting prefix detection: `GREETING_STARTERS` set — if the first word is a greeting starter, the input is ≤ 5 words, and no contract keyword appears, classify as `"greeting"`
- Vague gate: empty input or fewer than 3 words with no contract keyword → `"vague"`
- `CONTRACT_KEYWORDS`: 50+ terms covering all major CBA topics (rest, pay, reserve, deadhead, pairing, seniority, etc.)
- Everything else → `"contract"`

**Bug fixed:** "Hello there" was classified as `"vague"` because the `GREETINGS` set used exact matching and `"hello there"` ≠ `"hello"`. Fixed by adding prefix-match via `GREETING_STARTERS`.

**Route early returns:**
- `"greeting"` → canned Amelia intro response, no retrieval
- `"thanks"` → canned acknowledgement response, no retrieval
- `"vague"` (and not a follow-up) → prompt for more detail, no retrieval

---

### ADR-015 — Contract Reasoning Layer: Classify → Evaluate → Explain

**Decision:** For questions with computable structure (threshold rules, tiered entitlements), replace full synthesis with a focused three-step pipeline that determines the applicable clause before generating any explanation.

**New files:**
- `src/lib/amelia/classifyQuestion.ts`
- `src/lib/amelia/evaluateRule.ts`
- `src/lib/amelia/explainClause.ts`

**`classifyQuestion.ts`**
- Lightweight `gpt-4o-mini` call (max 160 tokens, `response_format: json_object`)
- Returns: `QuestionType` (THRESHOLD_RULE | ENTITLEMENT_BY_TIER | PROCEDURAL_POLICY | PURE_LOOKUP | AMBIGUOUS), `topic_query` (question restated with no numbers — improves chunk retrieval), and extracted `variables`:
```typescript
type QuestionVariables = {
  duration_hours: number | null;
  service_years: number | null;
  flight_type: "domestic" | "international" | null;
  status: "lineholder" | "reserve" | null;
  days: number | null;
};
```

**`evaluateRule.ts`**
- Receives only known (non-null) variables — nulls were previously passed in full JSON, causing the model to hallucinate them as missing required inputs
- Prompt CRITICAL CONSTRAINTS: only ask for a variable if it is **explicitly** required by the contract language in the retrieved chunks; do not invent requirements
- Returns: `{ resolved: true; chunk_index: number }` OR `{ resolved: false; clarifying_question: string }`

**`explainClause.ts`**
- Receives only the pre-selected chunk; enforces exact `chunk_index`/`section_number`/`section_title` passthrough
- Exactly one citation, full clause text as quote — no truncation
- Max 600 tokens

**Route orchestration (`app/api/query/route.ts`):**
```
classifyIntent → early return (greeting/thanks/vague)
    ↓
Promise.all([classifyQuestion, queryCBA(retrievalQuery)])
    ↓ (for THRESHOLD_RULE / ENTITLEMENT_BY_TIER with confidence ≥ 0.55)
re-retrieve with topic_query (numbers stripped)
    ↓
evaluateRule → resolved? → explainClause → return
                         → unresolved? → return clarifying_question
    ↓ (fallback or other types)
synthesizeAnswer (full synthesis)
```

**`topic_query` re-retrieval rationale:** A question like "what is the rest after a 12-hour flight?" embeds well on the number `12`. Re-retrieving with `"rest period after long flight"` finds rule clusters across threshold brackets rather than the single chunk closest to that number.

---

### ADR-016 — Section Context Expansion

**File:** `src/lib/queryCBA.ts`

**Decision:** After the primary `match_cba_chunks` vector search returns 8 chunks, expand the result set with neighboring chunks from the same section so the model can see the full rule structure (adjacent thresholds, exception clauses, definitions).

**Implementation:**
1. Take the top 1–2 vector matches; record their `section_number` and `chunk_index` as anchors
2. For each unique section, query `cba_chunks` directly (no embedding — plain Supabase select filtered by `airline`, `contract_version`, and `metadata->>section_number`)
3. In JavaScript, filter to `chunk_index ∈ [anchor - 3, anchor + 6]`, sort ascending, cap at 20
4. Merge: primary matches first (similarity order preserved), then context chunks de-duped by `chunk_index`
5. Context chunks carry `similarity: 0` so primary vector results still dominate ordering

**Error handling:** If the section context fetch fails for any reason, fall back to primary matches unchanged.

**No DB changes required.** The existing `cba_chunks` table supports direct filtering by `metadata->>section_number`.

---

### ADR-017 — Tone: Remove Hedging Language from NOT COVERED RULE

**Decision:** Replace soft "the excerpts do not specify" language with a direct, confident statement.

**Before:**
> "The contract sections provided do not specify the number of family travel benefits. That is typically governed by company travel policy rather than the union agreement."

**After:**
> "This topic is not addressed in the 2024 CBA." + one sentence on company policy if applicable + offer of a related contract topic.

**Applied in two places:**
1. `SYSTEM_PROMPT` — NOT COVERED RULE block
2. `confidenceNote` — PROCEDURAL/OFF-TOPIC branch of the low-confidence instruction

**Rationale:** The previous phrasing hedged with "provided" and "typically," which read as uncertainty about the contract rather than authority. The direct form signals that Amelia has checked and the answer is definitively not in scope.

---

## Key File Map

| File | Purpose |
|------|---------|
| `scripts/ingest-cba.ts` | PDF → chunks → embeddings → Supabase |
| `scripts/truncate-cba.ts` | Wipe `cba_chunks` table for fresh ingest |
| `scripts/verify-ingest.ts` | Row count + first 5 rows sanity check |
| `scripts/check-metadata.ts` | Inspect `metadata` JSON per row |
| `src/lib/queryCBA.ts` | Embed question → Supabase RPC → ranked chunks + section context expansion |
| `src/lib/amelia/classifyIntent.ts` | Rule-based intent pre-classifier (zero LLM cost) |
| `src/lib/amelia/classifyQuestion.ts` | LLM question type + variable extraction + topic_query |
| `src/lib/amelia/evaluateRule.ts` | Determines applicable chunk or asks one clarifying question |
| `src/lib/amelia/explainClause.ts` | Narrow clause explanation for pre-selected chunk |
| `src/lib/amelia/synthesizeAnswer.ts` | Full LLM synthesis fallback → structured `AmeliaResponse` |
| `src/lib/supabaseServer.ts` | Supabase client singleton |
| `src/lib/openai.ts` | OpenAI client singleton |
| `app/api/query/route.ts` | POST `/api/query` — full pipeline orchestration |
| `app/page.tsx` | Chat UI — messages state, history, citation cards, clarification bubbles |
| `data/2024-CBA_121724.pdf` | Source document (APFA/American Airlines 2024 CBA) |
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` |

---

## Environment

- **Runtime:** Node.js 24 / Next.js 16.1.6 (App Router, Turbopack)
- **Language:** TypeScript, executed via `tsx` for scripts
- **Platform:** Windows 11, bash shell
- **Deployment:** Vercel (auto-deploys on push to `main`)
- **Vector DB:** Supabase (pgvector, `match_cba_chunks` RPC)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims)
- **LLM:** OpenAI `gpt-4o-mini` — all synthesis, classification, evaluation, and explanation calls
- **Chunks in DB:** 299 (from 39 sections, 2 TOC chunks skipped)
