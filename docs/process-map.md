# How this got its shape

Notes on what people actually do when they need an answer from a contract, why that process
fails, and why almost every design decision here is a constraint rather than a capability.

## The process being replaced

A crew member needs to know what the agreement says. Usually the question is small and specific:
how much rest am I owed, does this trip qualify, what is the pay rate for this, what is the
deadline to file. Usually it is being asked at an inconvenient moment, on a phone, shortly before
a decision has to be made.

Today they do one of four things.

**Search the PDF.** The agreement runs to hundreds of pages. Control-F finds the word they typed,
which is rarely the word the contract uses, because contracts use terms of art and people use
ordinary language. When it does hit, it returns a sentence with no indication of the section it
sits in or the conditions attached to it.

**Ask a colleague.** Fast, available, and confidently wrong more often than anyone would like.
Contract folklore is real, it propagates, and it drops the conditions: "you get X" is remembered
long after "unless Y" is forgotten.

**Ask the union.** Reliable and slow. By the time the answer arrives the decision has usually been
made.

**Guess.** Common, and the reason the other three matter.

## Where the value leaks

1. **Being confidently wrong about a number.** A rest period, a pay rate, a filing deadline. This
   is the whole problem. A wrong number acted on has consequences, and the person acting on it has
   no way to tell a wrong number from a right one.
2. **The search vocabulary does not match the contract vocabulary.** People cannot find clauses
   that are plainly there.
3. **A clause without its section is misleading.** The sentence is accurate and the meaning is not.
4. **Conditional entitlements collapse into unconditional ones.** Both in folklore and in naive
   retrieval, "unless" is the first thing lost.
5. **Timing.** The answer is needed now, and slow-and-correct loses to fast-and-wrong in practice.

## The design constraint that follows

Everything here exists to make a confidently wrong answer harder to produce than no answer.

That is a deliberate inversion of the usual objective. Most retrieval systems optimise for
answering. This one optimises for not being wrong, because in this domain a plausible fabricated
number is worse than a shrug: the reader has no way to detect it, and they will act on it.

## What that produced

**Only state values that appear in the cited clause.** Dates, hours, rates and thresholds are
quoted from retrieved text or not stated at all.

**Say plainly what the contract does not cover.** Early versions hedged, along the lines of "the
excerpts do not appear to specify". That is the system protecting itself at the reader's expense.
A direct statement that the agreement does not address something is a real answer and a useful
one.

**Citations are always visible**, not behind a disclosure. If an answer cannot be traced to a
clause, the reader should see that immediately rather than having to go looking.

**Clarify before answering when a clause has conditional variables.** A structural guard forces
the question rather than letting the model pick an interpretation and proceed. This is the direct
countermeasure to leak 4.

**Low confidence is a state, not a refusal.** The first version had a hard similarity gate that
simply declined below a threshold. Silence is not useful to someone standing in an airport, so it
was replaced with a flag that lets a partial answer be given and labelled as partial.

## Why retrieval is section-aware

Ingestion detects section headers and carries section metadata onto every chunk, so a match can be
expanded to its surrounding clause rather than returned as an isolated fragment.

This addresses leak 3 directly. A sentence lifted out of a contract, without the section it sits
in, is one of the more efficient ways to mislead someone while saying only true things.

## Why intent is classified before retrieval

A greeting, a follow-up and a substantive question need different handling, and deciding which is
which does not require a model call. Without this step, "thanks" triggers a vector search and the
system answers a question nobody asked.

It costs nothing and it removes a whole class of nonsense.

## Why there is a reasoning layer after retrieval

Retrieval finds candidate clauses. It does not establish that they answer the question that was
asked. The reasoning step classifies, evaluates and then explains, rather than summarising
whatever came back.

Summarising retrieved text is how a system produces a fluent answer to a question the retrieved
text does not address.

## What is deliberately not automated

- **Advice.** It answers what the agreement says. It does not say what the reader should do about
  it, and it is not a substitute for a representative.
- **Anything adversarial.** Grievances, disputes and interpretation under pressure belong with a
  human who carries the responsibility for them.
- **Filling gaps.** Where the contract is silent, the system says so rather than reasoning from
  analogy. Silence in a contract is often deliberate.

## Where the map was wrong

**Section detection failed on the table of contents.** The naive header detector treated contents
entries as section starts, producing chunks anchored to page numbers rather than clauses. Obvious
in hindsight, invisible until the output was read closely.

**Refusing was treated as safe.** It is not. A system that declines when uncertain teaches people
to stop asking it, and they go back to asking a colleague, which is the failure mode the whole
thing exists to replace. Uncertainty needed to be expressible rather than terminal.

**Hedging was mistaken for caution.** Soft language reads as careful and functions as evasion. The
reader cannot tell whether the system looked and found nothing, or looked badly. Stating the
absence directly is both more honest and more useful.

## A note on the record

Seventeen decisions are written up in [`architecture-log.md`](architecture-log.md) with the
alternatives considered and why they lost. That log exists because most of the decisions here look
arbitrary until you know which failure they were a response to, and six months later that includes
the person who made them.
