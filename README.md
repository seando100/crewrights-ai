# CrewRights AI

A retrieval system that answers questions about a collective bargaining agreement, with an
assistant called Amelia, built so that a wrong answer is harder to produce than no answer.

Union contracts are long, cross-referenced, and full of clauses that only apply under
conditions stated somewhere else. The people who need them most are reading them on a phone,
in an airport, about to make a decision. Search is not the problem. **Being confidently wrong
about a number is the problem.**

## The constraints that shaped it

Most of the engineering here exists to stop the model doing things a language model does
naturally and a contract cannot tolerate.

**Only state values that appear in the cited clause.** Dates, hours, pay rates and thresholds
are quoted from the retrieved text or not stated at all. A plausible-sounding number is worse
than no number, because the reader has no way to tell the difference.

**Say plainly what the contract does not cover.** Early versions hedged: *"the excerpts do not
appear to specify..."*. That is the model protecting itself at the reader's expense. It now
states directly that the contract does not address something, which is a real and useful answer.

**Citations are always visible**, not tucked behind a disclosure. If the answer cannot be traced
to a clause, the reader should see that immediately.

**Clarify before answering when a clause has conditional variables.** A structural guard forces
the question rather than letting the model pick an interpretation and run with it.

**Low confidence is a state, not a failure.** An early version had a hard similarity gate that
simply refused. It was replaced with a `lowConfidence` flag, so a partial answer can be given
and labelled as partial.

## How it works

```
  question ──▶ intent classifier ──▶ retrieval ──▶ section expansion ──▶ reasoning ──▶ answer + citations
```

**Intent pre-classification runs first, and costs nothing.** A greeting, a follow-up and a
substantive contract question need different handling, and deciding which is which does not
require a model call. Without this, "thanks" triggers a vector search.

**Retrieval is section-aware.** Ingestion detects section headers and carries section metadata
onto every chunk, so a match can be expanded to its surrounding clause rather than returned as
an isolated fragment. A sentence from a contract, without the section it sits in, is a good way
to mislead someone.

**The reasoning layer classifies, evaluates, then explains** rather than summarising what was
retrieved. Retrieval finds candidate clauses; the reasoning step decides whether they actually
answer the question asked.

**Conversation memory is scoped to the topic.** Short follow-ups are interpreted against the
most recent subject, and the system does not re-ask for something it has already been told.

## Design decisions

Seventeen decisions are recorded in [`docs/architecture-log.md`](docs/architecture-log.md),
each with the alternatives considered and why they lost. A sample:

| | |
|---|---|
| ADR-006 | Section header detection, and why the naive version failed on a table of contents |
| ADR-010 | Removing the hard similarity gate in favour of a low-confidence flag |
| ADR-011 | Structural guard forcing clarification on conditional variables |
| ADR-014 | Intent pre-classification, at zero model cost |
| ADR-015 | The contract reasoning layer: classify, evaluate, explain |
| ADR-017 | Removing hedging language, and why confident refusal reads better than a soft one |

## Stack

Next.js 15 with the App Router, TypeScript, Supabase with pgvector for retrieval, and an
Anthropic model for classification and synthesis.

## What is not in this repository

**No contract text.** The agreement is third-party material; only the ingestion pipeline is
here. `data/` is ignored and the corpus lives in the database, not in git.

```bash
npm install
cp .env.example .env.local     # Supabase and Anthropic credentials
npm run ingest                 # point at your own source document
npm run dev
```

---

Built by [Sean Doherty](https://github.com/seando100).
