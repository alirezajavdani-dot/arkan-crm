"use client";

import { useEffect, useRef, useState } from "react";
import { useArkanChat, type ChatMsg } from "@/lib/useArkanChat";
import { renderBold } from "./format";
import VoiceAgent from "./VoiceAgent";

const SITE_URL = "https://arkan-website-chatbot.vercel.app";

export default function WidgetChat({
  welcomeMessage,
  primaryColor,
}: {
  welcomeMessage: string;
  primaryColor: string;
}) {
  const { messages, loading, conversationId, send } = useArkanChat({
    channel: "widget",
    storageKey: "arkan_widget_conv",
  });
  const [input, setInput] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function submit() {
    if (!input.trim() || loading) return;
    send(input);
    setInput("");
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant" && !m.error)?.id;
  const empty = messages.length === 0;

  return (
    <div className="relative flex h-dvh flex-col bg-bone">
      {/* هدر فشرده */}
      <header className="flex items-center gap-2.5 px-4 py-3 text-bone" style={{ backgroundColor: primaryColor }}>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          <SparkIcon />
        </span>
        <div className="leading-tight">
          <p className="font-heading text-[0.95rem] font-bold">دستیار آرکان</p>
          <p className="text-[0.7rem] opacity-80">معمولاً سریع پاسخ می‌دهد</p>
        </div>
        <button
          type="button"
          onClick={() => setVoiceOpen(true)}
          className="mr-auto inline-flex items-center gap-1.5 rounded-btn bg-white/15 px-2.5 py-1.5 text-[0.75rem] font-medium text-bone transition-colors hover:bg-white/25"
          aria-label="گفتگوی صوتی"
        >
          <MicIcon />
          صوتی
        </button>
      </header>

      {voiceOpen && (
        <div className="absolute inset-0 z-20 flex flex-col bg-bone">
          <header className="flex items-center justify-between px-4 py-3 text-bone" style={{ backgroundColor: primaryColor }}>
            <p className="font-heading text-[0.95rem] font-bold">گفتگوی صوتی</p>
            <button
              type="button"
              onClick={() => setVoiceOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
              aria-label="بستن گفتگوی صوتی"
            >
              <CloseIcon />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <p className="mb-4 text-center text-[0.8rem] text-slate">
              مستقیم با دستیار آرکان صحبت کنید — سؤال‌تان را بپرسید و پاسخ را بشنوید.
            </p>
            <VoiceAgent primaryColor={primaryColor} />
          </div>
        </div>
      )}

      {/* پیام‌ها */}
      <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
        {/* پیام خوش‌آمد */}
        <Bubble role="assistant">{welcomeMessage}</Bubble>
        {empty && (
          <p className="px-1 pt-1 text-[0.75rem] text-slate">
            می‌توانید درباره‌ی خدمات، قیمت‌ها، متدولوژی چهار رکن یا فرایند همکاری بپرسید.
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <Bubble role={msg.role} error={msg.error} primaryColor={primaryColor}>
              {msg.content || "…"}
            </Bubble>
            {msg.role === "assistant" && !msg.error && msg.id === lastAssistantId && msg.content && (
              <Feedback conversationId={conversationId} />
            )}
          </div>
        ))}
        {loading && <TypingDots />}
      </div>

      {/* CTA + ورودی */}
      <div className="border-t border-sand bg-bone px-3 pb-3 pt-2">
        <a
          href={`${SITE_URL}/#consultation`}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 block rounded-btn py-2 text-center text-[0.8rem] font-medium text-bone"
          style={{ backgroundColor: primaryColor }}
        >
          ثبت درخواست مشاوره‌ی رایگان
        </a>
        <div className="flex items-end gap-2 rounded-card border border-slate/30 bg-white p-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="پیام‌تان را بنویسید…"
            className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9rem] leading-6 text-ink placeholder:text-slate/60 focus:outline-none"
            aria-label="پیام شما"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || !input.trim()}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-bone transition-opacity disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
            aria-label="ارسال"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[0.65rem] text-slate/70">پاسخ‌ها با هوش مصنوعی تولید می‌شوند.</p>
      </div>
    </div>
  );
}

function Bubble({
  role,
  error,
  primaryColor,
  children,
}: {
  role: ChatMsg["role"];
  error?: boolean;
  primaryColor?: string;
  children: string;
}) {
  const isUser = role === "user";
  if (isUser) {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[85%] rounded-card rounded-tr-sm px-3.5 py-2.5 text-[0.9rem] leading-7 text-bone"
          style={{ backgroundColor: primaryColor ?? "#143A32" }}
        >
          <p className="whitespace-pre-wrap">{children}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div
        className={
          error
            ? "max-w-[88%] rounded-card border border-red-200 bg-red-50 px-3.5 py-2.5 text-[0.9rem] leading-7 text-red-700"
            : "max-w-[88%] rounded-card rounded-tl-sm border border-sand bg-white px-3.5 py-2.5 text-[0.9rem] leading-7 text-ink shadow-soft"
        }
      >
        <p className="whitespace-pre-wrap">{renderBold(children)}</p>
      </div>
    </div>
  );
}

function Feedback({ conversationId }: { conversationId: string | null }) {
  const [sent, setSent] = useState<"up" | "down" | null>(null);
  async function rate(rating: "up" | "down") {
    if (sent || !conversationId) return;
    setSent(rating);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, rating }),
      });
    } catch {
      /* بی‌صدا */
    }
  }
  if (sent) {
    return <p className="mt-1 px-1 text-[0.7rem] text-slate">ممنون از بازخوردتان 🙏</p>;
  }
  return (
    <div className="mt-1 flex items-center gap-1.5 px-1">
      <span className="text-[0.7rem] text-slate">مفید بود؟</span>
      <button type="button" onClick={() => rate("up")} className="rounded p-1 text-slate hover:text-pine" aria-label="مفید بود">
        <ThumbIcon up />
      </button>
      <button type="button" onClick={() => rate("down")} className="rounded p-1 text-slate hover:text-pine" aria-label="مفید نبود">
        <ThumbIcon />
      </button>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-end">
      <div className="rounded-card rounded-tl-sm border border-sand bg-white px-3.5 py-3 shadow-soft">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate/50" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12H4M10 6l-6 6 6 6" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 4.9L18.7 9l-4.9 1.1L12 15l-1.8-4.9L5.3 9l4.9-1.1z" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function ThumbIcon({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: up ? "none" : "rotate(180deg)" }}>
      <path d="M7 10v11M7 10l4-7a2 2 0 012.7 1.8V8h4.5a2 2 0 011.9 2.5l-1.7 7A2 2 0 0117.5 19H7" />
    </svg>
  );
}
