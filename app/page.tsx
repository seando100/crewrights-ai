"use client";

import { useState } from "react";

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
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AmeliaResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold">Amelia</h1>
      <p className="mb-6 text-sm text-zinc-500">Ask a question about your contract.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          className="w-full rounded border border-zinc-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          rows={4}
          placeholder="e.g. How is sick leave accrued?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="self-end rounded bg-zinc-900 px-5 py-2 text-sm text-white disabled:opacity-40"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {result && (
        <div className="mt-8 flex flex-col gap-4">
          {result.error && (
            <p className="text-sm text-red-600">{result.error}</p>
          )}

          {result.answer && (
            <p className="text-sm leading-6 text-zinc-800">{result.answer}</p>
          )}

          {result.clarification_needed && result.clarifying_question && (
            <p className="text-sm text-zinc-500 italic">{result.clarifying_question}</p>
          )}

          {result.citations && result.citations.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-zinc-100 pt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Sources</p>
              {result.citations.map((c, i) => (
                <p key={i} className="text-xs text-zinc-500">
                  Section {c.section_number} — {c.section_title}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
