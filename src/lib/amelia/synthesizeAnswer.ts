import { openai } from "../openai";
import type { CBAChunk } from "../queryCBA";

export type Citation = {
  section_number: string | null;
  section_title: string | null;
  chunk_index: number | null;
  quote?: string;
};

export type AmeliaResponse = {
  answer?: string;
  citations?: Citation[];
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
- Output strict JSON only. No markdown, no extra keys.

CONVERSATION RULES:
- The conversation history may include prior turns. Use them for context when interpreting the current question.
- Treat short follow-ups ("what about 18?", "how about 10?", "international?", "reserve?", "what if I'm part-time?") as continuing the most recent topic. Answer in context without asking the user to clarify what they mean.
- Do not re-ask for information the user has already provided in the conversation history.
- Ask at most one clarifying question per turn.

CONDITIONAL VARIABLE RULE (non-negotiable):
If the correct answer depends on a variable the flight attendant has not specified — such as flight length, years of service, days of sick leave available, lineholder vs. reserve status, domestic vs. international pairing, or any other factor that changes the contract outcome — you MUST NOT answer. Instead:
- Set clarification_needed to true
- Provide exactly one concise clarifying_question targeting the missing variable
- Omit answer and citations entirely
Do not hedge or provide a partial answer. Do not include answer or citations when clarification_needed is true.

Output format when answering:
{
  "answer": "...",
  "citations": [
    { "section_number": "9", "section_title": "SICK LEAVE", "chunk_index": 40, "quote": "..." }
  ],
  "clarification_needed": false
}

Output format when clarification is needed:
{
  "clarification_needed": true,
  "clarifying_question": "..."
}`;

export async function synthesizeAnswer(args: {
  question: string;
  matches: CBAChunk[];
  lowConfidence: boolean;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<AmeliaResponse> {
  const { question, matches, lowConfidence, history } = args;

  const chunks = matches
    .map(
      (m, i) =>
        `[Chunk ${i + 1} | Section ${m.metadata.section_number} – ${m.metadata.section_title} | chunk_index: ${m.metadata.chunk_index} | similarity: ${m.similarity.toFixed(3)}]\n${m.text_content}`
    )
    .join("\n\n---\n\n");

  const confidenceNote = lowConfidence
    ? `\n\nIMPORTANT: The retrieved contract excerpts below have low relevance scores for this question. Before answering, determine which applies:
1. PROCEDURAL / OFF-TOPIC: The question is about company procedures, airline operations, scheduling systems, or personal matters not covered by the CBA. Respond helpfully: briefly acknowledge what kind of question it is, note that the contract does not address it, and invite the user to tell you more about what they are trying to accomplish so you can confirm what the contract does cover (e.g., bid windows, eligibility, trading, leave, pay). Set citations to [] and set clarification_needed to false.
2. AMBIGUOUS: The question could relate to the contract but is unclear. If so, set clarification_needed to true and ask exactly 1 clarifying question. Do not fabricate citations.
3. GROUNDED: The excerpts clearly address the question despite the low score. Answer normally with citations drawn only from the provided chunks.

Never fabricate a section_number, section_title, or chunk_index not present in the excerpts.`
    : "";

  const userMessage = `Question: ${question}\n\nContract excerpts:\n\n${chunks}${confidenceNote}`;

  const historyMessages = (history ?? [])
    .slice(-12)
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...historyMessages,
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const raw = response.choices[0].message.content ?? "{}";
  return JSON.parse(raw) as AmeliaResponse;
}
