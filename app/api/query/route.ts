import { NextRequest, NextResponse } from "next/server";
import { queryCBA, CBAChunk } from "../../../src/lib/queryCBA";
import { synthesizeAnswer, AmeliaResponse } from "../../../src/lib/amelia/synthesizeAnswer";
import { classifyIntent } from "../../../src/lib/amelia/classifyIntent";

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

    // Intent pre-classification — runs before retrieval, no LLM cost
    const intent = classifyIntent(question);

    if (intent === "greeting") {
      return NextResponse.json({
        answer: "Hi — I'm here to help with questions about your union contract. What would you like to know?",
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

    if (intent === "vague") {
      return NextResponse.json({
        answer: "Can you tell me a little more about what you're asking? I'm here to help with questions about your union contract.",
        citations: [],
        clarification_needed: false,
      });
    }

    const safeHistory: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(history) ? history : [];

    const matches = await queryCBA(
      question,
      "American Airlines",
      "2024-CBA_121724"
    );

    const lowConfidence =
      !matches || matches.length === 0 || matches[0].similarity < 0.55;

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
