"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ویس‌ایجنت آرکان — گفتگوی صوتی زنده با OpenAI Realtime از طریق WebRTC.
 * کلید اصلی هرگز در مرورگر نیست؛ اتصال با توکن موقتِ /api/realtime/session برقرار می‌شود.
 * ابزارها (جست‌وجوی دانش و ثبت لید) روی سرور از طریق /api/realtime/tool اجرا می‌شوند.
 */

type Status = "idle" | "connecting" | "live" | "error";
type Line = { role: "user" | "assistant"; text: string };

// تعریف ابزارها برای مدل (function calling)
const TOOLS = [
  {
    type: "function",
    name: "search_knowledge",
    description:
      "جست‌وجوی پایگاه دانش آرکان برای یافتن اطلاعات دقیق درباره‌ی خدمات، متدولوژی چهار رکن، قیمت‌ها و فرایند همکاری. قبل از پاسخ‌های تخصصی حتماً استفاده کن.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "پرسش کاربر به فارسی" } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "capture_lead",
    description:
      "ثبت «درخواست مشاوره» وقتی کاربر آماده است و اطلاعات لازم را داده. فقط وقتی صدا بزن که نام، شماره تماس، نام کسب‌وکار، مرحله و چالش مشخص باشد.",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "نام و نام خانوادگی" },
        phone: { type: "string", description: "شماره تماس" },
        business_name: { type: "string", description: "نام کسب‌وکار" },
        stage: { type: "string", enum: ["ایده", "نوپا", "در حال رشد", "تثبیت‌شده"], description: "مرحله‌ی کسب‌وکار" },
        challenge: { type: "string", description: "بزرگ‌ترین چالش فعلی" },
        email: { type: "string", description: "ایمیل (اختیاری)" },
        industry: { type: "string", description: "حوزه‌ی فعالیت (اختیاری)" },
        preferred_time: { type: "string", enum: ["صبح", "بعدازظهر", "عصر"], description: "زمان مناسب تماس (اختیاری)" },
      },
      required: ["full_name", "phone", "business_name", "stage", "challenge"],
    },
  },
];

export default function VoiceAgent({ primaryColor = "#143A32" }: { primaryColor?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    setSpeaking(false);
    setStatus("idle");
  }, []);

  useEffect(() => () => stop(), [stop]);

  // اجرای ابزار روی سرور و برگرداندن نتیجه به مدل
  const runTool = useCallback(async (name: string, callId: string, argsJson: string) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsJson || "{}");
    } catch {
      /* ignore */
    }
    let result = "خطا در اجرای ابزار.";
    try {
      const res = await fetch("/api/realtime/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, args }),
      });
      const data = await res.json();
      result = data.result ?? data.error ?? result;
    } catch {
      /* نگه‌داشتن پیام پیش‌فرض */
    }
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: result },
      })
    );
    dc.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const handleEvent = useCallback(
    (evt: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      const type = msg.type as string;

      // فراخوانی ابزار توسط مدل
      if (type === "response.function_call_arguments.done") {
        runTool(msg.name as string, msg.call_id as string, msg.arguments as string);
        return;
      }

      // متن گفتار کاربر (رونویسی)
      if (type === "conversation.item.input_audio_transcription.completed") {
        const t = (msg.transcript as string)?.trim();
        if (t) setLines((l) => [...l, { role: "user", text: t }]);
        return;
      }

      // متن پاسخ دستیار (کامل‌شده)
      if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
        const t = (msg.transcript as string)?.trim();
        if (t) setLines((l) => [...l, { role: "assistant", text: t }]);
        return;
      }

      // وضعیت صحبت‌کردن دستیار
      if (type === "output_audio_buffer.started" || type === "response.output_audio.delta") setSpeaking(true);
      if (type === "output_audio_buffer.stopped" || type === "response.done") setSpeaking(false);
    },
    [runTool]
  );

  const start = useCallback(async () => {
    setErrorMsg("");
    setStatus("connecting");
    try {
      // ۱) توکن موقت
      const sessionRes = await fetch("/api/realtime/session", { method: "POST" });
      const session = await sessionRes.json();
      if (!sessionRes.ok || !session.token) {
        throw new Error(session.error || "دریافت نشست صوتی ناموفق بود.");
      }

      // ۲) اتصال WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // پخش صدای دستیار
      const audioEl = audioRef.current ?? new Audio();
      audioEl.autoplay = true;
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // میکروفون
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // کانال داده برای رویدادها و ابزارها
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", handleEvent);
      dc.addEventListener("open", () => {
        // ثبت ابزارها روی نشست
        dc.send(JSON.stringify({ type: "session.update", session: { tools: TOOLS, tool_choice: "auto" } }));
        setStatus("live");
      });

      // ۳) تبادل SDP
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(session.model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error("برقراری اتصال صوتی ناموفق بود.");
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
    } catch (e) {
      const err = e as Error;
      setErrorMsg(
        err.name === "NotAllowedError"
          ? "دسترسی به میکروفون رد شد. برای گفتگوی صوتی باید اجازه دهید."
          : err.message || "خطا در راه‌اندازی گفتگوی صوتی."
      );
      setStatus("error");
      stop();
    }
  }, [handleEvent, stop]);

  const live = status === "live";

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* دکمه‌ی اصلی میکروفون */}
      <button
        type="button"
        onClick={live || status === "connecting" ? stop : start}
        disabled={status === "connecting"}
        className="relative inline-flex h-20 w-20 items-center justify-center rounded-full text-bone shadow-soft transition-transform active:scale-95 disabled:opacity-70"
        style={{ backgroundColor: live ? "#b91c1c" : primaryColor }}
        aria-label={live ? "پایان گفتگوی صوتی" : "شروع گفتگوی صوتی"}
      >
        {live && speaking && (
          <span className="absolute inset-0 animate-ping rounded-full opacity-40" style={{ backgroundColor: primaryColor }} />
        )}
        {status === "connecting" ? <Spinner /> : live ? <StopIcon /> : <MicIcon />}
      </button>

      <p className="text-[0.85rem] text-slate">
        {status === "idle" && "برای شروع گفتگوی صوتی، دکمه را بزنید"}
        {status === "connecting" && "در حال اتصال…"}
        {live && (speaking ? "دستیار در حال صحبت است…" : "بفرمایید، گوش می‌دهم…")}
        {status === "error" && <span className="text-red-600">{errorMsg}</span>}
      </p>

      {/* رونوشت گفتگو */}
      {lines.length > 0 && (
        <div className="mt-2 max-h-56 w-full space-y-2 overflow-y-auto rounded-card border border-sand bg-white p-3">
          {lines.map((l, i) => (
            <div key={i} className={l.role === "user" ? "text-right" : "text-right"}>
              <span className="text-[0.7rem] text-slate">{l.role === "user" ? "شما: " : "دستیار: "}</span>
              <span className="text-[0.9rem] leading-7 text-ink">{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={2} className="animate-spin" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" />
    </svg>
  );
}
