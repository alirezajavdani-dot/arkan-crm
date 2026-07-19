import { getActivePrompt } from "@/lib/rag/config";
import {
  REALTIME_MODEL,
  REALTIME_VOICE,
  isRealtimeConfigured,
  buildVoiceInstructions,
} from "@/lib/realtime/config";

export const runtime = "nodejs";

/**
 * توکن موقت (ephemeral) برای اتصال WebRTC مرورگر به OpenAI Realtime (API نسخه GA).
 * کلید اصلی OpenAI هرگز به مرورگر نمی‌رود؛ فقط این توکن کوتاه‌عمر (ek_…) ارسال می‌شود.
 */
export async function POST() {
  if (!isRealtimeConfigured()) {
    return Response.json(
      { error: "ویس‌ایجنت هنوز پیکربندی نشده است (OPENAI_API_KEY تنظیم نشده)." },
      { status: 503 }
    );
  }

  const basePrompt = await getActivePrompt();
  const instructions = buildVoiceInstructions(basePrompt);

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions,
          output_modalities: ["audio"],
          audio: {
            input: {
              transcription: { model: "whisper-1" },
              turn_detection: { type: "server_vad", silence_duration_ms: 700 },
            },
            output: { voice: REALTIME_VOICE },
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[realtime/session] خطای OpenAI:", res.status, detail);
      return Response.json({ error: "ساخت نشست صوتی ناموفق بود." }, { status: 502 });
    }

    const data = await res.json();
    return Response.json({
      token: data.value ?? null,
      expires_at: data.expires_at ?? null,
      model: REALTIME_MODEL,
    });
  } catch (e) {
    console.error("[realtime/session] خطا:", (e as Error).message);
    return Response.json({ error: "خطای داخلی در ساخت نشست صوتی." }, { status: 500 });
  }
}
