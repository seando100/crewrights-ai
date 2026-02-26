import { openai } from "../openai";
import type { CBAChunk } from "../queryCBA";
import type { QuestionVariables } from "./classifyQuestion";
import type { AmeliaResponse } from "./synthesizeAnswer";

const EXPLAIN_PROMPT = `You are explaining a specific contract clause to a flight attendant.

The applicable clause has already been identified. Your job is narrowly scoped:
1. Explain what this clause means in plain language.
2. State the exact rule or entitlement that applies given the flight attendant's stated situation.
3. Only state what the clause explicitly says. Do not infer, calculate, or add information not in the text.
4. Use the chunk_index, section_number, and section_title exactly as provided — do not modify or add prefixes.
5. Include exactly one citation: the clause provided. Do not add others.
6. The quote must be the full relevant clause text exactly as written — no truncation, no paraphrasing.

Output strict JSON only:
{
  "answer": "Plain language explanation tailored to their situation.",
  "citations": [
    { "section_number": "14", "section_title": "REST PERIOD", "chunk_index": 40, "quote": "Full clause text exactly as written." }
  ],
  "clarification_needed": false
}`;

export async function explainClause(
  chunk: CBAChunk,
  variables: QuestionVariables,
  question: string
): Promise<AmeliaResponse> {
  const situationParts = Object.entries(variables)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}: ${v}`);

  const situation =
    situationParts.length > 0 ? situationParts.join(", ") : "not specified";

  const userMessage = `Question: ${question}

Flight attendant's situation: ${situation}

Applicable clause:
[Section ${chunk.metadata.section_number} – ${chunk.metadata.section_title} | chunk_index: ${chunk.metadata.chunk_index}]
${chunk.text_content}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: EXPLAIN_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 600,
  });

  const raw = response.choices[0].message.content ?? "{}";
  return JSON.parse(raw) as AmeliaResponse;
}
