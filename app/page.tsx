"use client";

import { useRef, useState } from "react";

function AmeliaAvatar() {
  return (
    <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full bg-indigo-600">
      <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5" aria-hidden="true">
        <path d="M12 12c2.7 0 4.8-2.15 4.8-4.8S14.7 2.4 12 2.4 7.2 4.55 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.62-9.6 4.8v1.2c0 .66.54 1.2 1.2 1.2h16.8c.66 0 1.2-.54 1.2-1.2v-1.2c0-3.18-6.4-4.8-9.6-4.8z" />
      </svg>
    </div>
  );
}

type Citation = {
  section_number: string | null;
  section_title: string | null;
  chunk_index: number | null;
  quote?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  clarification_needed?: boolean;
  error?: boolean;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function handleNewChat() {
    setMessages([]);
    setQuestion("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    setLoading(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json();

      let msg: Message;
      if (data.error) {
        msg = {
          role: "assistant",
          content:
            "I wasn't able to generate a grounded answer. Please try rephrasing.",
          error: true,
        };
      } else if (data.clarification_needed && data.clarifying_question) {
        msg = {
          role: "assistant",
          content: data.clarifying_question,
          clarification_needed: true,
        };
      } else {
        msg = {
          role: "assistant",
          content: data.answer ?? "",
          citations: data.citations,
        };
      }

      setMessages((prev) => [...prev, msg]);
      scrollToBottom();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Network error. Please try again.",
          error: true,
        },
      ]);
      scrollToBottom();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col h-dvh bg-[#050914] text-zinc-100">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <AmeliaAvatar />
          <div>
            <h1 className="text-base font-semibold tracking-tight">Amelia</h1>
            <p className="text-xs text-zinc-400">Flight Attendant Union Contract Advisor</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            American Airlines · 2024 CBA
          </span>
          <button
            onClick={handleNewChat}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors"
          >
            New chat
          </button>
        </div>
      </header>

      {/* Scrollable chat area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 min-h-full flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-1.5">
                <p className="text-zinc-500 text-sm">
                  I&rsquo;m here to help interpret your union contract.
                </p>
                <p className="text-zinc-600 text-xs">
                  Ask about rest, vacation, pay rules, or other provisions.
                </p>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[78%] rounded-2xl bg-white/10 px-4 py-2.5 text-sm text-zinc-100">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[85%] space-y-2">
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.error
                            ? "bg-red-500/10 border border-red-500/20 text-red-200"
                            : msg.clarification_needed
                            ? "bg-[#0B1020] border border-amber-500/25 text-zinc-200"
                            : "bg-[#0B1020] border border-white/10 text-zinc-100"
                        }`}
                      >
                        {msg.clarification_needed && (
                          <span className="block text-amber-400/60 text-xs mb-1.5">
                            To give you the correct rule —
                          </span>
                        )}
                        {msg.content}
                      </div>

                      {/* Contract citations — always visible */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="space-y-2">
                          {msg.citations.map((c, ci) => (
                            <div
                              key={ci}
                              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                            >
                              <p className="text-xs font-semibold text-zinc-300 mb-2 uppercase tracking-wide">
                                Section {c.section_number} — {c.section_title}
                              </p>
                              {c.quote && (
                                <p className="text-xs text-zinc-400 leading-5 border-l-2 border-white/20 pl-3">
                                  {c.quote}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-[#0B1020] border border-white/10 px-4 py-3 text-sm text-zinc-600">
                    Thinking…
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Sticky composer */}
      <div className="flex-none border-t border-white/10 bg-[#050914] px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-xl gap-2"
        >
          <input
            className="flex-1 rounded-xl border border-white/10 bg-[#0B1020] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="Ask about your contract…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-40 transition-opacity"
          >
            Ask
          </button>
        </form>
      </div>
    </main>
  );
}
