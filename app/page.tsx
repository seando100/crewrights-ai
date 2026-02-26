"use client";

import { useEffect, useRef, useState } from "react";

type Citation = {
  section_number: string | null;
  section_title: string | null;
  chunk_index: number | null;
};

type AmeliaResponse = {
  answer?: string;
  citations?: Citation[];
  clarification_needed?: boolean;
  clarifying_question?: string;
  error?: string;
};

type QA = {
  question: string;
  response: AmeliaResponse;
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QA[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;

    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      const data = await res.json();
      setHistory((prev) => [...prev, { question: q, response: data }]);
      setQuestion("");
      setTimeout(() => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    } catch {
      setHistory((prev) => [
        ...prev,
        {
          question: q,
          response: { error: "Network error. Please try again." },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#050914] text-zinc-100">
      <div
        ref={containerRef}
        className="mx-auto w-full max-w-xl px-4 pb-28 pt-6"
      >
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black font-bold">
              A
            </div>

            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Amelia
              </h1>
              <p className="text-xs text-zinc-400">
                Contract Interpreter
              </p>
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            American Airlines · 2024 CBA
          </div>
        </header>

        {/* Chat History */}
        <div className="space-y-6">
          {history.map((item, idx) => (
            <div key={idx} className="space-y-3">
              {/* User Question */}
              <div className="rounded-xl bg-white/5 p-3 text-sm text-zinc-300">
                {item.question}
              </div>

              {/* Response */}
              {item.response.error ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  {item.response.error}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-[#0B1020] p-4 space-y-3">
                  {item.response.answer && (
                    <p className="text-[15px] leading-7 text-zinc-100">
                      {item.response.answer}
                    </p>
                  )}

                  {item.response.clarification_needed &&
                    item.response.clarifying_question && (
                      <p className="text-sm text-zinc-400 italic">
                        {item.response.clarifying_question}
                      </p>
                    )}

                  {item.response.citations && (
                    <div className="pt-2 border-t border-white/10 text-xs text-zinc-500">
                      {Array.from(
                        new Set(
                          item.response.citations.map(
                            (c) =>
                              `Section ${c.section_number} — ${c.section_title}`
                          )
                        )
                      ).map((s, i) => (
                        <div key={i}>{s}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Fixed Input Footer */}
      <form
        onSubmit={handleSubmit}
        className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[#050914] p-4"
      >
        <div className="mx-auto flex w-full max-w-xl gap-3">
          <input
            className="flex-1 rounded-xl border border-white/10 bg-[#0B1020] px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-white/20"
            placeholder="Ask about your contract…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-40"
          >
            {loading ? "…" : "Ask"}
          </button>
        </div>
      </form>
    </main>
  );
}
