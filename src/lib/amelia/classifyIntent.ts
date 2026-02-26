export type IntentType = "greeting" | "thanks" | "vague" | "contract";

const GREETINGS = new Set([
  "hello",
  "hi",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
  "good night",
  "howdy",
  "greetings",
  "hiya",
  "yo",
  "sup",
  "what's up",
  "whats up",
  "hi amelia",
  "hello amelia",
  "hey amelia",
]);

const THANKS = new Set([
  "thanks",
  "thank you",
  "ty",
  "thx",
  "thank u",
  "cheers",
  "ok thanks",
  "okay thanks",
  "got it thanks",
  "perfect thanks",
  "great thanks",
  "awesome thanks",
  "sounds good",
  "thanks amelia",
  "thank you amelia",
]);

const CONTRACT_KEYWORDS = [
  "rest",
  "vacation",
  "sick",
  "leave",
  "pay",
  "bid",
  "reserve",
  "lineholder",
  "overtime",
  "schedule",
  "flight",
  "duty",
  "hotel",
  "per diem",
  "international",
  "domestic",
  "layover",
  "pairing",
  "trade",
  "swap",
  "seniority",
  "grievance",
  "union",
  "contract",
  "cba",
  "section",
  "apfa",
  "furlough",
  "recall",
  "probation",
  "training",
  "uniform",
  "expense",
  "standby",
  "deadhead",
  "junior",
  "senior",
  "penalty",
  "delay",
  "cancel",
  "award",
  "crew",
  "compensation",
  "benefit",
  "hours",
  "days",
  "line",
  "trip",
  "report",
  "minimum",
];

function hasContractKeyword(q: string): boolean {
  return CONTRACT_KEYWORDS.some((kw) => q.includes(kw));
}

export function classifyIntent(question: string): IntentType {
  // Normalize: lowercase, strip trailing punctuation
  const q = question.trim().toLowerCase().replace(/[!?.,]+$/, "").trim();

  if (GREETINGS.has(q)) return "greeting";
  if (THANKS.has(q)) return "thanks";

  const words = q.split(/\s+/).filter(Boolean);

  // Empty or pure punctuation
  if (words.length === 0 || /^[\s?!.,;:]+$/.test(question.trim())) {
    return "vague";
  }

  // Too short to retrieve anything useful and no recognizable contract concept
  if (words.length < 3 && !hasContractKeyword(q)) {
    return "vague";
  }

  return "contract";
}
