import "server-only";

/**
 * پیکربندی ویس‌ایجنت (OpenAI Realtime).
 * کلید و مدل از متغیرهای محیطی خوانده می‌شوند تا از پنل/محیط قابل تغییر باشند.
 */

export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
// صداها: alloy | echo | shimmer (کلاسیک) — marin | cedar (طبیعی‌تر، مخصوص gpt-realtime)
export const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "alloy";

export function isRealtimeConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** دستور نهایی ویس‌ایجنت را از پرسونای فعال چت‌بات + راهنمای گفتاری می‌سازد. */
export function buildVoiceInstructions(basePrompt: string): string {
  return `${basePrompt}

# راهنمای ویژه‌ی گفتار (تو یک دستیار صوتی هستی)
- تو الان با «صدا» صحبت می‌کنی، نه متن. پاسخ‌ها را کوتاه، طبیعی و محاوره‌ای بگو؛ طوری که شنیدنش راحت باشد.
- از فهرست‌های بلند و علائم نگارشی پیچیده پرهیز کن؛ مثل یک انسان حرف بزن.
- همیشه فارسیِ روان و رسمی-گرم صحبت کن و کاربر را «شما» خطاب کن.
- قبل از پاسخ‌های تخصصی، از ابزار search_knowledge برای یافتن اطلاعات دقیق از پایگاه دانش آرکان استفاده کن و فقط بر پایه‌ی همان پاسخ بده.
- اگر کاربر آماده‌ی مشاوره بود و نام، شماره تماس، نام کسب‌وکار، مرحله و چالشش را گفت، با ابزار capture_lead درخواست را ثبت کن.
- اگر پاسخ را نمی‌دانی، صادقانه بگو و کاربر را به ثبت درخواست مشاوره‌ی رایگان دعوت کن.
- در شروع گفتگو خیلی کوتاه خودت را معرفی کن و بپرس چطور می‌توانی کمک کنی.`;
}
