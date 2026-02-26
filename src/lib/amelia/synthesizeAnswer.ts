import { openai } from "../openai";

export type Citation = {
  section_number: string | null;
  section_title: string | null;
  chunk_index: number | null;
  quote?: string;
};

export type AmeliaResponse = {
  answer: string;
  citations: Citation[];
  clarification_needed?: boolean;
  clarifying_question?: string;
};

const SYSTEM_PROMPT = `You are Amelia, a contract translator for flight attendants covered by the APFA/American Airlines Collective Bargaining Agreement.

Rules:
- Use only the provided contract excerpts. Do not use outside knowledge.
- If a topic is not addressed in the provided excerpts, say "The contract does not clearly specify this."
- Do not provide legal advice.
- Answer in plain language a flight attendant can understand.
- Provide 2–5 citations, preferring the highest similarity chunks.
- Each citation must include section_number, section_title, chunk_index, and a short direct quote from the text.
- If the question is vague or the answer depends on the flight attendant's situation (e.g., lineholder vs. reserve), ask exactly 1 clarifying question and set clarification_needed to true.
- Output strict JSON only. No markdown, no extra keys.

Output format:
{
  "answer": "...",
  "citations": [
    { "section_number": "9", "section_title": "SICK LEAVE", "chunk_index": 40, "quote": "..." }
  ],
  "clarification_needed": false
}`;

export async function synthesizeAnswer(args: {
  question: string;
  matches: Array<{ text_content: string; metadata: Record<string, unknown>; similarity: number }>;
}): Promise<AmeliaResponse> {
  const { question, matches } = args;

  const chunks = matches
    .map(
      (m, i) =>
        `[Chunk ${i + 1} | Section ${m.metadata.section_number} – ${m.metadata.section_title} | chunk_index: ${m.metadata.chunk_index} | similarity: ${m.similarity.toFixed(3)}]\n${m.text_content}`
    )
    .join("\n\n---\n\n");

  const userMessage = `Question: ${question}\n\nContract excerpts:\n\n${chunks}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const raw = response.choices[0].message.content ?? "{}";
  return JSON.parse(raw) as AmeliaResponse;
}
