import { NextRequest, NextResponse } from "next/server";
import { queryCBA, CBAChunk } from "../../../src/lib/queryCBA";
import { synthesizeAnswer, AmeliaResponse } from "../../../src/lib/amelia/synthesizeAnswer";

function validateGroundedResponse(result: AmeliaResponse, matches: CBAChunk[]): void {
  if (typeof result.answer !== "string" || result.answer.trim() === "") {
    throw new Error("Ungrounded synthesis response");
  }

  if (!Array.isArray(result.citations) || result.citations.length < 1) {
    throw new Error("Ungrounded synthesis response");
  }

  for (const citation of result.citations) {
    if (citation.chunk_index === null || citation.chunk_index === undefined) {
      throw new Error("Ungrounded synthesis response");
    }

    const chunk = matches.find((m) => m.metadata.chunk_index === citation.chunk_index);

    if (!chunk) {
      throw new Error("Ungrounded synthesis response");
    }

    if (citation.section_number !== chunk.metadata.section_number) {
      throw new Error("Ungrounded synthesis response");
    }

    if (citation.section_title !== chunk.metadata.section_title) {
      throw new Error("Ungrounded synthesis response");
    }

    if (citation.quote !== undefined && !chunk.text_content.includes(citation.quote)) {
      throw new Error("Ungrounded synthesis response");
    }
  }

  if (result.clarification_needed === true) {
    if (
      typeof result.clarifying_question !== "string" ||
      result.clarifying_question.trim().length === 0
    ) {
      throw new Error("Invalid clarification structure");
    }
  } else {
    if (result.clarifying_question !== undefined) {
      throw new Error("Invalid clarification structure");
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const matches = await queryCBA(
      question,
      "American Airlines",
      "2024-CBA_121724"
    );

    if (!matches || matches.length === 0 || matches[0].similarity < 0.55) {
      return NextResponse.json(
        { error: "Question does not pertain to the contract." },
        { status: 400 }
      );
    }

    const result = await synthesizeAnswer({ question, matches });
    validateGroundedResponse(result, matches);
    return NextResponse.json({ ...result, matches: undefined });
  } catch (err) {
    if ((err as Error).message === "Ungrounded synthesis response") {
      return NextResponse.json(
        { error: "Unable to generate contract-grounded answer." },
        { status: 500 }
      );
    }
    console.error("Query error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
