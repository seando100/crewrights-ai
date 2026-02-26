import { openai } from "../openai";

export type QuestionType =
  | "THRESHOLD_RULE"     // answer depends on a numeric bracket (hours, duty time, rest requirements)
  | "ENTITLEMENT_BY_TIER" // varies by service years or seniority tier
  | "PROCEDURAL_POLICY"  // how to do something (submit, bid, trade, file)
  | "PURE_LOOKUP"        // single fixed fact with no conditional logic
  | "AMBIGUOUS";         // unclear contract topic

export type QuestionVariables = {
  duration_hours: number | null;
  service_years: number | null;
  flight_type: "domestic" | "international" | null;
  status: "lineholder" | "reserve" | null;
  days: number | null;
};

export type QuestionClassification = {
  type: QuestionType;
  topic_query: string;
  variables: QuestionVariables;
};

const CLASSIFY_PROMPT = `You classify a flight attendant's CBA contract question.

Question types:
- THRESHOLD_RULE: answer depends on a numeric threshold or bracket (flight hours, duty period length, rest minimums with time-based tiers)
- ENTITLEMENT_BY_TIER: entitlement varies by years of service or seniority (sick leave accrual rates, vacation day tiers)
- PROCEDURAL_POLICY: how to do something (how to submit, request, bid, trade, or file a grievance)
- PURE_LOOKUP: single fixed fact, no conditional logic (per diem rate, uniform allowance amount)
- AMBIGUOUS: unclear what contract topic is being asked about

Extract any variables present in the question:
- duration_hours: flight or duty duration in hours (number or null)
- service_years: years of service (number or null)
- flight_type: "domestic" or "international" or null
- status: "lineholder" or "reserve" or null
- days: number of days (number or null)

Also produce a clean topic_query for vector search — a short phrase describing the contract concept WITHOUT specific numbers or personal details.

Output strict JSON only:
{
  "type": "THRESHOLD_RULE",
  "topic_query": "minimum rest requirements after flight duty period",
  "variables": {
    "duration_hours": 14,
    "service_years": null,
    "flight_type": null,
    "status": null,
    "days": null
  }
}`;

export async function classifyQuestion(
  question: string
): Promise<QuestionClassification> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: CLASSIFY_PROMPT },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 160,
  });

  const raw = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw);

  return {
    type: (parsed.type as QuestionType) ?? "AMBIGUOUS",
    topic_query:
      typeof parsed.topic_query === "string" && parsed.topic_query.trim()
        ? parsed.topic_query
        : question,
    variables: {
      duration_hours: parsed.variables?.duration_hours ?? null,
      service_years: parsed.variables?.service_years ?? null,
      flight_type: parsed.variables?.flight_type ?? null,
      status: parsed.variables?.status ?? null,
      days: parsed.variables?.days ?? null,
    },
  };
}
