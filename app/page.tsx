"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Citation = {
  section_number: string | null;
  section_title: string | null;
  chunk_index: number | null;
  quote?: string;
};

type AmeliaResponse = {
  answer?: string;
  citations?: Citation[];
  clarification_needed?: boolean;
  clarifying_question?: string;
  error?: string;
  debug?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    const key = `${c.section_number ?? ""}|${c.section_title ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

const LOADING_LINES = [
  "Scanning your contract language…",
  "Finding the relevant section…",
  "Cross checking provisions…",
  "Translating contract terms into plain English…",
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AmeliaResponse | null>(null);
  const [loadingLineIdx, setLoadingLineIdx] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => {
      setLoadingLineIdx((i) => (i + 1) % LOADING_LINES.length);
    }, 1200);
    return () => clearInterval(t);
  }, [loading]);

  const sources = useMemo(() => {
    if (!result?.citations || result.citations.length === 0) return [];
    return dedupeCitations(result.citations);
  }, [result?.citations]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;

    setLoading(true);
    setLoadingLineIdx(0);
    setResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as AmeliaResponse;
      setResult(data);
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleExample(example: string) {
    setQuestion(example);
    setResult(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <main className="min-h-dvh bg-[#070A12] text-zinc-100">
      <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Amelia</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Contract Interpreter, answers grounded strictly in your CBA.
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
              AA 2024 CBA
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm leading-6 text-zinc-200">
              Ask a question in plain language. Amelia will answer using only
              the contract text and cite the relevant section.
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Not legal advice. If the contract is ambiguous, Amelia will ask a
              clarifying question or suggest contacting your union rep.
            </p>
          </div>
        </header>

        {/* Input */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Your question
            </label>

            <div className="relative">
              <textarea
                ref={textareaRef}
                className={cn(
                  "w-full resize-none rounded-xl border border-white/10 bg-[#0B1020] p-4 text-sm leading-6 text-zinc-100",
                  "placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20",
                  "min-h-[120px]"
                )}
                placeholder="Example: How is sick leave accrued?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={loading}
              />

              <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center justify-between text-[11px] text-zinc-500">
                <span>{loading ? LOADING_LINES[loadingLineIdx] : " "}</span>
                <span>{question.trim().length}/300</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !question.trim()}
              className={cn(
                "mt-1 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium",
                "bg-white text-[#070A12] hover:bg-zinc-100",
                "disabled:opacity-40 disabled:hover:bg-white"
              )}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#070A12]" />
                  Reviewing your contract…
                </span>
              ) : (
                "Review My Contract"
              )}
            </button>

            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleExample("How is sick leave accrued?")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                disabled={loading}
              >
                Sick leave accrual
              </button>
              <button
                type="button"
                onClick={() => handleExample("What is reserve and how does it work?")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                disabled={loading}
              >
                Reserve rules
              </button>
              <button
                type="button"
                onClick={() => handleExample("What happens if I miss a trip?")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                disabled={loading}
              >
                Missed trip
              </button>
            </div>
          </form>
        </section>

        {/* Results */}
        {result && (
          <section className="mt-6 space-y-4">
            {result.error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-sm text-red-200">{result.error}</p>
                {result.debug && (
                  <p className="mt-2 text-xs text-red-200/70">Debug: {result.debug}</p>
                )}
              </div>
            )}

            {result.answer && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Plain English answer
                </h2>
                <p className="mt-3 text-[15px] leading-7 text-zinc-100">
                  {result.answer}
                </p>
              </div>
            )}

            {result.clarification_needed && result.clarifying_question && (
              <div className="rounded-2xl border border-white/10 bg-[#0B1020] p-5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Clarifying question
                </h3>
                <p className="mt-3 text-sm leading-6 text-zinc-200">
                  {result.clarifying_question}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Answer this in your own words, then ask again.
                </p>
              </div>
            )}

            {sources.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Contract sources
                </h3>

                <div className="mt-3 space-y-2">
                  {sources.map((c, i) => (
                    <div
                      key={`${c.section_number ?? "x"}-${c.section_title ?? "y"}-${i}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3"
                    >
                      <div>
                        <p className="text-sm text-zinc-100">
                          Section {c.section_number ?? "?"}
                          <span className="text-zinc-400">, </span>
                          <span className="text-zinc-200">{c.section_title ?? "UNKNOWN"}</span>
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Source is used to ground the answer to your contract.
                        </p>
                      </div>
                      <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                        CBA
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-zinc-600">
          CrewRights AI MVP, contract grounded answers only.
        </footer>
      </div>
    </main>
  );
}
