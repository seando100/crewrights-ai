import { openai } from "../openai";
import type { CBAChunk } from "../queryCBA";
import type { QuestionVariables } from "./classifyQuestion";

export type RuleEvaluation =
  | { resolved: true; chunk_index: number }
  | { resolved: false; clarifying_question: string };

const EVALUATE_PROMPT = `You evaluate which specific contract rule applies to a flight attendant's situation.

You receive:
- Variables that the flight attendant has ALREADY stated (only what is known — no nulls, no unknowns)
- Contract chunks retrieved for the relevant topic

Your task:
1. Read the chunks and identify the applicable threshold brackets or entitlement tiers.
2. Determine whether the STATED variables are sufficient to select one specific clause.
3. If YES — the chunks clearly resolve to one applicable clause given the stated variables: return that chunk_index.
4. If NO — a variable is EXPLICITLY required by the contract language in the chunks but was not stated: ask for ONLY that variable.

CRITICAL CONSTRAINTS:
- Only ask for a variable if it is EXPLICITLY mentioned in the retrieved contract text as a condition that changes the rule outcome.
- If the chunks describe rules based on duty hours and flight type only, do NOT ask about service years, reserve/lineholder status, or any other variable not mentioned in the text.
- Do not invent requirements. Read what the contract actually says.
- Only choose chunk_index values that appear in the provided chunks.
- If the stated variables are sufficient, resolve — do not ask unnecessary questions.

Output strict JSON only:
{ "resolved": true, "chunk_index": 6 }
OR
{ "resolved": false, "clarifying_question": "To give you the correct rule — was this a domestic or international flight?" }`;

export async function evaluateRule(
  variables: QuestionVariables,
  matches: CBAChunk[],
  question: string
): Promise<RuleEvaluation> {
  // Only pass variables that are actually known — nulls confuse the model
  // into treating them as "missing required inputs"
  const knownEntries = Object.entries(variables).filter(([, v]) => v !== null);
  const variableSummary =
    knownEntries.length > 0
      ? knownEntries.map(([k, v]) => `${k}: ${v}`).join("\n")
      : "(no specific variables extracted from the question)";

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
