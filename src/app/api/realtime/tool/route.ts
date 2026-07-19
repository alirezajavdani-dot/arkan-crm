import { retrieve, buildContext } from "@/lib/rag/retrieve";
import { getSupabaseAdmin } from "@/lib/supabase";
import { leadSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * اجرای سمت‌سرورِ ابزارهایی که ویس‌ایجنت (Realtime) موقع مکالمه صدا می‌زند.
 * مرورگر خروجی این ابزار را از طریق data channel به مدل برمی‌گرداند.
 */
export async function POST(req: Request) {
  let body: { name?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "بدنه‌ی نامعتبر." }, { status: 400 });
  }

  const name = body.name;
  const args = body.args ?? {};

  try {
    if (name === "search_knowledge") {
      const query = String(args.query ?? "").trim();
      if (!query) return Response.json({ result: "پرسش خالی است." });
      const chunks = await retrieve(query);
      const context = buildContext(chunks);
      return Response.json({
        result: context || "منبع مرتبطی در پایگاه دانش یافت نشد.",
      });
    }

    if (name === "capture_lead") {
      const supabase = getSupabaseAdmin();
      if (!supabase) return Response.json({ result: "ثبت درخواست موقتاً ممکن نیست." });
      const parsed = leadSchema.safeParse(args);
      if (!parsed.success) {
        return Response.json({
          result: "اطلاعات کامل یا معتبر نیست؛ لطفاً نام، شماره تماس، نام کسب‌وکار، مرحله و چالش را بپرس.",
        });
      }
      const d = parsed.data;
      const { error } = await supabase.from("leads").insert({
        full_name: d.full_name,
        phone: d.phone,
        email: d.email || null,
        business_name: d.business_name,
        industry: d.industry || null,
        stage: d.stage,
        challenge: d.challenge,
        preferred_time: d.preferred_time || null,
        status: "new",
        source: "voice",
      });
      if (error) {
        console.error("[realtime/tool capture_lead] خطا:", error.message);
        return Response.json({ result: "در ثبت خطایی رخ داد." });
      }
      return Response.json({
        result: "درخواست مشاوره با موفقیت ثبت شد. تیم آرکان ظرف ۲۴ ساعت کاری تماس می‌گیرد.",
      });
    }

    return Response.json({ error: "ابزار ناشناخته." }, { status: 400 });
  } catch (e) {
    console.error("[realtime/tool] خطا:", (e as Error).message);
    return Response.json({ result: "اجرای ابزار با خطا مواجه شد." });
  }
}
