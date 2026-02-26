import { openai } from "../openai";
import type { CBAChunk } from "../queryCBA";
import type { QuestionVariables } from "./classifyQuestion";

export type RuleEvaluation =
  | { resolved: true; chunk_index: number }
  | { resolved: false; clarifying_question: string };

const EVALUATE_PROMPT = `You evaluate which specific contract rule applies to a flight attendant's situation.

You receive:
- Known variables already extracted from the question (numbers, categories)
- Contract chunks retrieved for the relevant topic

Your task:
1. Read the chunks and identify the applicable threshold brackets or entitlement tiers.
2. Determine if the known variables are sufficient to identify exactly which bracket applies.
3. If YES: return the chunk_index of the most applicable clause.
4. If NO (a critical variable is missing to resolve the bracket): return the single most important missing variable as a clarifying question using this format: "To give you the correct rule — [one specific question]?"

Rules:
- Do not guess or fill in missing variables.
- Do not return a chunk_index if you cannot determine which bracket applies with confidence.
- Only choose from the chunk_index values present in the provided chunks.

Output strict JSON only:
{ "resolved": true, "chunk_index": 6 }
OR
{ "resolved": false, "clarifying_question": "To give you the correct rule — was this a domestic or international flight?" }`;

export async function evaluateRule(
  variables: QuestionVariables,
  matches: CBAChunk[],
  question: string
): Promise<RuleEvaluation> {
  const variableSummary = JSON.stringify(variables, null, 2);

  const chunks = matches
    .map(
      (m) =>
        `[chunk_index: ${m.metadata.chunk_index} | Section ${m.metadata.section_number} – ${m.metadata.section_title}]\n${m.text_content}`
    )
    .join("\n\n---\n\n");

  const userMessage = `Original question: ${question}\n\nKnown variables:\n${variableSummary}\n\nContract chunks:\n\n${chunks}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: EVALUATE_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 120,
  });

  const raw = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw);

  if (parsed.resolved === true && typeof parsed.chunk_index === "number") {
    return { resolved: true, chunk_index: parsed.chunk_index };
  }

  return {
    resolved: false,
    clarifying_question:
      typeof parsed.clarifying_question === "string" &&
      parsed.clarifying_question.trim()
        ? parsed.clarifying_question
        : "To give you the correct rule — could you provide more details about your situation?",
  };
}
