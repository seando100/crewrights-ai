import { NextRequest, NextResponse } from "next/server";
import { queryCBA, CBAChunk } from "../../../src/lib/queryCBA";
import { synthesizeAnswer, AmeliaResponse } from "../../../src/lib/amelia/synthesizeAnswer";
import { classifyIntent } from "../../../src/lib/amelia/classifyIntent";
import { classifyQuestion } from "../../../src/lib/amelia/classifyQuestion";
import { evaluateRule } from "../../../src/lib/amelia/evaluateRule";
import { explainClause } from "../../../src/lib/amelia/explainClause";

// For short follow-ups ("33", "reserve", "14 hours"), retrieval on the raw
// message returns irrelevant chunks. Use the last substantial user turn from
// history as the retrieval anchor so we stay on the right contract topic.
function buildRetrievalQuery(
  question: string,
  history: { role: string; content: string }[]
): string {
  const words = question.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3 && history.length > 0) {
    const lastSubstantial = [...history]
      .reverse()
      .find((h) => h.role === "user" && h.content.trim().split(/\s+/).length > 3);
    if (lastSubstantial) return lastSubstantial.content;
  }
  return question;
}

function validateGroundedResponse(result: AmeliaResponse, matches: CBAChunk[]): void {
  if (result.clarification_needed === true) {
    // Clarification path: answer and citations must be absent
    if (typeof result.clarifying_question !== "string" || result.clarifying_question.trim().length === 0) {
      throw new Error("Invalid clarification structure");
    }
    if (result.answer !== undefined) {
      throw new Error("Clarification answer contamination");
    }
    if (Array.isArray(result.citations) && result.citations.length > 0) {
      throw new Error("Clarification citations contamination");
    }
    return;
  }

  // Answer path: answer and citations must be present and grounded
  if (typeof result.answer !== "string" || result.answer.trim() === "") {
    throw new Error("Ungrounded synthesis response");
  }

  if (!Array.isArray(result.citations)) {
    throw new Error("Ungrounded synthesis response");
  }

  for (const citation of result.citations) {
    if (citation.chunk_index === null || citation.chunk_index === undefined) {
      throw new Error("Citation chunk_index not found");
    }

    const chunk = matches.find((m) => m.metadata.chunk_index === citation.chunk_index);

    if (!chunk) {
      throw new Error("Citation chunk_index not found");
    }

    if (citation.section_number !== chunk.metadata.section_number) {
      throw new Error("Citation section_number mismatch");
    }

    if (citation.section_title !== chunk.metadata.section_title) {
      throw new Error("Citation section_title mismatch");
    }
  }

  if (result.clarifying_question !== undefined) {
    throw new Error("Invalid clarification structure");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { question, history } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const safeHistory: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(history) ? history : [];
    const isFollowUp = safeHistory.length > 0;

    // ── Intent pre-classification ──────────────────────────────────────────
    // Runs before any LLM or retrieval. Catches greetings, thanks, and vague
    // inputs. Follow-ups (even if short) bypass the vague gate.
    const intent = classifyIntent(question);

    if (intent === "greeting") {
      return NextResponse.json({
        answer:
          "Hi, I'm Amelia — your American Airlines Union Contract Advisor. I help interpret the 2024 CBA in plain language and point you directly to the relevant sections. Ask me anything about scheduling, rest, pay, vacation, or other contract provisions.",
        citations: [],
        clarification_needed: false,
      });
    }

    if (intent === "thanks") {
      return NextResponse.json({
        answer: "You're welcome — let me know if you have any other questions about your contract.",
        citations: [],
        clarification_needed: false,
      });
    }

    if (intent === "vague" && !isFollowUp) {
      return NextResponse.json({
        answer: "Can you tell me a little more about what you're asking? I'm here to help with questions about your union contract.",
        citations: [],
        clarification_needed: false,
      });
    }

    // ── Question classification + retrieval (parallel) ────────────────────
    // classifyQuestion extracts the question type, structured variables, and
    // a clean topic_query (no numbers). Both calls start at the same time.
    // For short follow-ups, retrieval anchors on the last substantial user
    // turn so "33" finds rest-period chunks, not nothing.
    const retrievalQuery = buildRetrievalQuery(question, safeHistory);
    const [classification, rawMatches] = await Promise.all([
      classifyQuestion(question),
      queryCBA(retrievalQuery, "American Airlines", "2024-CBA_121724"),
    ]);

    const isStructuredType =
      classification.type === "THRESHOLD_RULE" ||
      classification.type === "ENTITLEMENT_BY_TIER";

    // Re-retrieve with topic_query for structured questions (removes numbers,
    // focuses on the contract concept for better chunk selection).
    const matches =
      isStructuredType && classification.topic_query !== question
        ? await queryCBA(classification.topic_query, "American Airlines", "2024-CBA_121724")
        : rawMatches;

    const lowConfidence =
      !matches || matches.length === 0 || matches[0].similarity < 0.55;

    // ── Structured evaluation pipeline ────────────────────────────────────
    // For THRESHOLD_RULE / ENTITLEMENT_BY_TIER with sufficient confidence:
    // evaluate which bracket applies, then explain only that clause.
    if (isStructuredType && !lowConfidence) {
      try {
        const evaluation = await evaluateRule(classification.variables, matches, question);

        if (!evaluation.resolved) {
          // A critical variable is missing — return the clarifying question
          const clarification: AmeliaResponse = {
            clarification_needed: true,
            clarifying_question: evaluation.clarifying_question,
          };
          validateGroundedResponse(clarification, matches);
          return NextResponse.json(clarification);
        }

        // Bracket resolved — find the applicable chunk and explain it
        const selectedChunk = matches.find(
          (m) => m.metadata.chunk_index === evaluation.chunk_index
        );

        if (selectedChunk) {
          const explanation = await explainClause(
            selectedChunk,
            classification.variables,
            question
          );
          validateGroundedResponse(explanation, matches);
          return NextResponse.json({ ...explanation, matches: undefined });
        }
        // chunk_index not found in matches — fall through to standard synthesis
      } catch {
        // Evaluation or explanation failed — fall through to standard synthesis
      }
    }

    // ── Standard synthesis pipeline ───────────────────────────────────────
    // Full synthesis: used for PROCEDURAL_POLICY, PURE_LOOKUP, AMBIGUOUS,
    // low-confidence retrievals, and as a fallback from structured evaluation.
    const result = await synthesizeAnswer({
      question,
      matches,
      lowConfidence,
      history: safeHistory,
    });
    validateGroundedResponse(result, matches);
    return NextResponse.json({ ...result, matches: undefined });
  } catch (err) {
    const msg = (err as Error).message;
    const knownGuards = [
      "Ungrounded synthesis response",
      "Citation chunk_index not found",
      "Citation section_number mismatch",
      "Citation section_title mismatch",
      "Citation quote mismatch",
      "Invalid clarification structure",
      "Clarification answer contamination",
      "Clarification citations contamination",
    ];
    if (knownGuards.includes(msg)) {
      return NextResponse.json(
        { error: "Unable to generate contract-grounded answer.", debug: msg },
        { status: 500 }
      );
    }
    console.error("Query error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
