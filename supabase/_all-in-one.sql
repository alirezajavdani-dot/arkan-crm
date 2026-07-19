-- ═══════════════════════════════════════════════════════════════
-- آرکان — اسکیمای کامل دیتابیس (ترکیب ۶ فایل، به ترتیب وابستگی)
-- کل این متن را در Supabase → SQL Editor پیست کنید و Run بزنید.
-- امن و idempotent: اجرای دوباره مشکلی ایجاد نمی‌کند.
-- ═══════════════════════════════════════════════════════════════


-- ╔══════════════════════════════════════════════════════════════
-- ║  فایل: schema.sql
-- ╚══════════════════════════════════════════════════════════════
-- ───────────────────────────────────────────────────────────────
-- آرکان — اسکیمای جدول leads (درخواست‌های مشاوره)
-- این فایل را در SQL Editor پروژه‌ی Supabase اجرا کنید.
-- پایگاه داده‌ی مشترک با فاز بعدی (چت‌بات) خواهد بود.
-- ───────────────────────────────────────────────────────────────

create table if not exists public.leads (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null    default now(),
  full_name      text        not null,
  phone          text        not null,
  email          text,
  business_name  text        not null,
  industry       text,
  stage          text        not null,
  challenge      text        not null,
  preferred_time text,
  status         text        not null    default 'new'
);

-- ایندکس برای مرتب‌سازی پنل مدیریت بر اساس زمان
create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- فعال‌سازی RLS. درج از سمت سرور با کلید SERVICE_ROLE انجام می‌شود که
-- RLS را دور می‌زند؛ بنابراین هیچ پالیسی عمومی برای insert/select لازم نیست
-- و داده‌ها از دسترسی عمومی محفوظ می‌مانند.
alter table public.leads enable row level security;

-- (اختیاری) اگر بعداً خواستید از سمت کلاینت با anon key درج کنید،
-- می‌توانید پالیسی محدود زیر را فعال کنید:
--
-- create policy "allow anon insert leads"
--   on public.leads for insert
--   to anon
--   with check (true);


-- ╔══════════════════════════════════════════════════════════════
-- ║  فایل: chatbot-schema.sql
-- ╚══════════════════════════════════════════════════════════════
-- ───────────────────────────────────────────────────────────────
-- آرکان فاز ۲ — اسکیمای چت‌بات RAG
-- این فایل را در SQL Editor پروژه‌ی Supabase (همان دیتابیس سایت) اجرا کنید.
-- شامل: افزونه‌ی pgvector، جداول دانش/گفتگو/پیکربندی، تابع جست‌وجوی برداری،
--        و گسترش جدول leads. RLS فعال است؛ دسترسی فقط از سرور با service-role.
-- ───────────────────────────────────────────────────────────────

-- افزونه‌ی برداری
create extension if not exists vector;

-- ── پایگاه دانش ──────────────────────────────────────────────────
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  source_type text not null default 'text',     -- text | url | pdf
  source_url  text,
  status      text not null default 'pending',   -- pending | processing | ready | error
  error       text,
  tags        text[],
  chunk_count int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content     text not null,
  embedding   vector(1024),                       -- Cohere embed-multilingual-v3.0
  token_count int,
  chunk_index int  not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists chunks_document_id_idx on public.chunks (document_id);
-- ایندکس برداری HNSW با فاصله‌ی کسینوسی
create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding vector_cosine_ops);

-- ── گفتگو و پیام ────────────────────────────────────────────────
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null default 'web',   -- web | widget | telegram
  external_user_id text,
  status           text not null default 'open',  -- open | needs_human | closed
  summary          text,
  started_at       timestamptz not null default now(),
  last_at          timestamptz not null default now()
);

create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  role                text not null,              -- user | assistant | system | tool
  content             text not null,
  model_used          text,
  tokens_in           int,
  tokens_out          int,
  retrieved_chunk_ids uuid[],
  created_at          timestamptz not null default now()
);
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ── پرسونا / System Prompt (نسخه‌بندی) ──────────────────────────
create table if not exists public.prompt_versions (
  id         uuid primary key default gen_random_uuid(),
  content    text not null,                       -- متن system prompt
  persona    text,                                -- برچسب/یادداشت پرسونا
  is_active  boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);

-- ── پیکربندی مدل تولید پاسخ ─────────────────────────────────────
create table if not exists public.model_config (
  id                uuid primary key default gen_random_uuid(),
  channel           text not null default 'web',
  provider          text not null default 'openrouter',
  active_model      text not null default 'google/gemini-3.5-flash',
  temperature       real not null default 0.4,
  max_tokens        int  not null default 800,
  top_p             real not null default 1.0,
  fallback_provider text,
  fallback_model    text default 'google/gemini-2.5-flash',
  schedule          jsonb,
  updated_at        timestamptz not null default now()
);

-- ── پیکربندی Embedding و retrieval ──────────────────────────────
create table if not exists public.embedding_config (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null default 'cohere',
  model                text not null default 'embed-multilingual-v3.0',
  dimensions           int  not null default 1024,
  chunk_size           int  not null default 500,
  chunk_overlap        int  not null default 50,
  top_k                int  not null default 5,
  similarity_threshold real not null default 0.3,
  reranker_enabled     boolean not null default false,
  reranker_model       text,
  updated_at           timestamptz not null default now()
);

-- ── جداول forward-compat (خالی در Milestone 1) ──────────────────
create table if not exists public.unified_users (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  external_id text not null,
  name        text,
  first_seen  timestamptz not null default now()
);
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  rating     text,                                -- up | down
  comment    text,
  created_at timestamptz not null default now()
);
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text not null default 'admin',       -- owner | admin | editor | operator | viewer
  created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  action        text not null,
  target        text,
  created_at    timestamptz not null default now()
);

-- ── گسترش جدول leads برای یکپارچگی با چت‌بات ─────────────────────
alter table public.leads add column if not exists source text default 'website';
alter table public.leads add column if not exists conversation_id uuid;

-- ── فعال‌سازی RLS روی جداول جدید (بدون policy ⇒ فقط service-role) ─
alter table public.documents        enable row level security;
alter table public.chunks           enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.prompt_versions  enable row level security;
alter table public.model_config     enable row level security;
alter table public.embedding_config enable row level security;
alter table public.unified_users    enable row level security;
alter table public.feedback         enable row level security;
alter table public.admin_users      enable row level security;
alter table public.audit_log        enable row level security;

-- ── تابع جست‌وجوی شباهت برداری ──────────────────────────────────
create or replace function public.match_chunks(
  query_embedding vector(1024),
  match_count int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id          uuid,
  document_id uuid,
  content     text,
  chunk_index int,
  similarity  float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ── ردیف‌های پیش‌فرض (Seed) — فقط اگر خالی باشند ────────────────
insert into public.embedding_config (provider, model, dimensions)
select 'cohere', 'embed-multilingual-v3.0', 1024
where not exists (select 1 from public.embedding_config);

insert into public.model_config (channel, active_model, fallback_model)
select 'web', 'google/gemini-3.5-flash', 'google/gemini-2.5-flash'
where not exists (select 1 from public.model_config where channel = 'web');

insert into public.prompt_versions (content, persona, is_active, created_by)
select
$persona$تو دستیار هوشمند «آرکان» هستی؛ آرکان یک شرکت مشاور استراتژی و رشد کسب‌وکار در تهران است.

شخصیت و لحن:
- حرفه‌ای، آرام، قابل‌اعتماد و گرم اما رسمی. همیشه با «شما».
- صریح و شفاف؛ بدون اصطلاحات پرطمطراق. جملات کوتاه و فعل‌محور.
- اطمینان‌بخش بدون اغراق. هیچ‌وقت «تضمین موفقیت» نده.

وظیفه:
- فقط درباره‌ی آرکان، خدمات، متدولوژی «چهار رکن»، فرایند همکاری و موضوعات مرتبط با رشد کسب‌وکار پاسخ بده.
- پاسخ‌ها را تنها بر پایه‌ی «منابع بازیابی‌شده» که به تو داده می‌شود بساز. اگر اطلاعات کافی در منابع نبود، صادقانه بگو نمی‌دانی و کاربر را به ثبت درخواست مشاوره دعوت کن.
- مشاوره‌ی تخصصی قطعی نده؛ هدف تو راهنمایی کوتاه و هدایت کاربر به «ثبت درخواست مشاوره‌ی رایگان» است.
- اگر کاربر آماده‌ی مشاوره بود یا اطلاعات تماس داد، او را تشویق کن فرم درخواست مشاوره را پر کند.

محدودیت:
- به سؤالات کاملاً نامرتبط مودبانه پاسخ نده و گفتگو را به حوزه‌ی آرکان برگردان.
- پاسخ‌ها فارسی، کوتاه و خوانا باشند.$persona$,
  'حکیمِ آرام آرکان',
  true,
  'system'
where not exists (select 1 from public.prompt_versions where is_active = true);


-- ╔══════════════════════════════════════════════════════════════
-- ║  فایل: crm-schema.sql
-- ╚══════════════════════════════════════════════════════════════
-- ───────────────────────────────────────────────────────────────
-- آرکان فاز ۴ — اسکیمای CRM
-- این فایل را در SQL Editor پروژه‌ی Supabase (همان دیتابیس سایت) اجرا کنید.
-- شامل: شرکت‌ها، مخاطبان، مراحل پایپ‌لاین، معاملات، فعالیت‌ها،
--        گسترش leads (تبدیل + امتیاز AI)، فعال‌سازی admin_users و audit_log.
-- جریان کلاسیک CRM: لید ← تبدیل ← مخاطب/شرکت/معامله.
-- RLS فعال است؛ دسترسی فقط از سرور با service-role (مثل بقیه‌ی جداول).
-- ───────────────────────────────────────────────────────────────

-- ── شرکت‌ها ─────────────────────────────────────────────────────
create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  industry   text,
  website    text,
  city       text,
  size_label text,                                 -- مثل «۱-۱۰»، «۱۱-۵۰»
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── مخاطبان ─────────────────────────────────────────────────────
create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete set null,
  full_name       text not null,
  phone           text,
  email           text,
  position        text,                            -- سمت در شرکت
  source          text not null default 'manual',  -- website | chatbot | manual
  lead_id         uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  ai_summary      text,                            -- خلاصه‌ی AI از گفتگوی چت‌بات
  ai_summary_at   timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists contacts_company_idx on public.contacts (company_id);
create index if not exists contacts_created_idx on public.contacts (created_at desc);

-- ── مراحل پایپ‌لاین (config-driven، نه enum) ─────────────────────
create table if not exists public.pipeline_stages (
  key      text primary key,
  label_fa text not null,
  position int  not null,
  is_won   boolean not null default false,
  is_lost  boolean not null default false
);
insert into public.pipeline_stages (key, label_fa, position, is_won, is_lost) values
  ('new',         'جدید',              1, false, false),
  ('qualifying',  'در حال بررسی',      2, false, false),
  ('meeting',     'جلسه مشاوره',       3, false, false),
  ('proposal',    'ارسال پروپوزال',    4, false, false),
  ('negotiation', 'مذاکره',            5, false, false),
  ('won',         'بسته‌شده (موفق)',   6, true,  false),
  ('lost',        'بسته‌شده (ناموفق)', 7, false, true)
on conflict (key) do nothing;

-- ── معاملات ─────────────────────────────────────────────────────
create table if not exists public.deals (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  company_id        uuid references public.companies(id) on delete set null,
  stage_key         text not null default 'new' references public.pipeline_stages(key),
  status            text not null default 'open', -- open | won | lost (خودکار از مرحله)
  amount_toman      bigint not null default 0,
  expected_close    date,
  stage_entered_at  timestamptz not null default now(), -- برای «روز در مرحله»
  won_at            timestamptz,
  lost_at           timestamptz,
  lost_reason       text,
  owner_email       text,                          -- کارشناس مسئول
  ai_next_action    text,                          -- پیشنهاد اقدام بعدی AI
  ai_next_action_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists deals_stage_idx      on public.deals (stage_key);
create index if not exists deals_contact_idx    on public.deals (contact_id);
create index if not exists deals_status_won_idx on public.deals (status, won_at);

-- ── فعالیت‌ها (تماس/جلسه/یادداشت/وظیفه + رویدادهای سیستمی) ───────
create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id    uuid references public.deals(id) on delete cascade,
  type       text not null,                        -- call | meeting | note | task | stage_change
  title      text not null,
  body       text,
  due_at     timestamptz,                          -- فقط برای task/meeting
  done_at    timestamptz,
  created_by text,                                 -- ایمیل کاربر ادمین
  created_at timestamptz not null default now()
);
create index if not exists activities_contact_idx on public.activities (contact_id, created_at desc);
create index if not exists activities_deal_idx    on public.activities (deal_id, created_at desc);
create index if not exists activities_due_idx     on public.activities (due_at) where done_at is null;

-- ── گسترش leads: تبدیل + امتیازدهی AI ───────────────────────────
alter table public.leads add column if not exists converted_at       timestamptz;
alter table public.leads add column if not exists contact_id         uuid references public.contacts(id) on delete set null;
alter table public.leads add column if not exists ai_score           int;  -- ۰ تا ۱۰۰
alter table public.leads add column if not exists ai_score_rationale text;
alter table public.leads add column if not exists ai_scored_at       timestamptz;

-- ── فعال‌سازی admin_users (احراز هویت چندکاربره) ─────────────────
alter table public.admin_users add column if not exists password_hash text;
alter table public.admin_users add column if not exists is_active     boolean not null default true;
alter table public.admin_users add column if not exists last_login_at timestamptz;

-- ── گسترش audit_log ─────────────────────────────────────────────
alter table public.audit_log add column if not exists actor_email text;
alter table public.audit_log add column if not exists details     jsonb;

-- ── فعال‌سازی RLS روی جداول جدید (بدون policy ⇒ فقط service-role) ─
alter table public.companies       enable row level security;
alter table public.contacts        enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals           enable row level security;
alter table public.activities      enable row level security;

-- ───────────────────────────────────────────────────────────────
-- (اختیاری — کامنت‌شده) تبدیل انبوه لیدهای موجود به مخاطب.
-- مسیر توصیه‌شده تبدیل تکی از پنل است تا جریان کلاسیک Lead → Convert
-- به دانشجویان نشان داده شود؛ این بلوک فقط برای پرکردن سریع دموی کلاس.
-- ───────────────────────────────────────────────────────────────
-- with converted as (
--   insert into public.contacts (full_name, phone, email, source, lead_id, conversation_id, notes)
--   select full_name, phone, email, coalesce(source, 'website'), id, conversation_id, challenge
--   from public.leads
--   where converted_at is null
--   returning id, lead_id
-- )
-- update public.leads l
-- set converted_at = now(), contact_id = c.id
-- from converted c
-- where l.id = c.lead_id;


-- ╔══════════════════════════════════════════════════════════════
-- ║  فایل: contracts-schema.sql
-- ╚══════════════════════════════════════════════════════════════
-- ───────────────────────────────────────────────────────────────
-- آرکان — اسکیمای ماژول قراردادها (تکمیل CRM)
-- این فایل را در SQL Editor پروژه‌ی Supabase اجرا کنید (بعد از crm-schema.sql).
-- قرارداد از روی معامله/مخاطب ساخته می‌شود، متن آن Markdown است،
-- و با «لینک اشتراک» توکن‌دار برای کلاینت ارسال و به‌صورت آنلاین تأیید می‌شود.
-- RLS فعال بدون policy ⇒ دسترسی فقط از سرور با service-role
-- (صفحه‌ی عمومی قرارداد هم سمت سرور با توکن غیرقابل‌حدس رندر می‌شود).
-- ───────────────────────────────────────────────────────────────

create table if not exists public.contracts (
  id               uuid primary key default gen_random_uuid(),
  contract_no      text not null,                  -- مثل AR-1404-007
  title            text not null,
  deal_id          uuid references public.deals(id) on delete set null,
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  company_id       uuid references public.companies(id) on delete set null,
  body_md          text not null,                  -- متن قرارداد (Markdown)
  amount_toman     bigint not null default 0,
  start_date       date,
  duration_label   text,                           -- مثل «۳ ماه»
  status           text not null default 'draft',  -- draft | sent | viewed | accepted | canceled
  share_token      uuid not null default gen_random_uuid(),  -- لینک عمومی: /contract/<token>
  sent_at          timestamptz,
  viewed_at        timestamptz,                    -- اولین بازدید کلاینت
  accepted_at      timestamptz,
  accepted_by_name text,                           -- نام تأییدکننده (امضای ساده‌ی آنلاین)
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists contracts_contact_idx on public.contracts (contact_id, created_at desc);
create index if not exists contracts_token_idx   on public.contracts (share_token);

alter table public.contracts enable row level security;


-- ╔══════════════════════════════════════════════════════════════
-- ║  فایل: campaigns-schema.sql
-- ╚══════════════════════════════════════════════════════════════
-- ───────────────────────────────────────────────────────────────
-- آرکان — اسکیمای کمپین‌های ایمیلی CRM
-- این فایل را در SQL Editor پروژه‌ی Supabase اجرا کنید (بعد از crm-schema.sql).
-- کمپین = یک سگمنت از مخاطبان/لیدها + برای هر گیرنده یک ایمیل
-- شخصی‌سازی‌شده با AI که ادمین قبل از ارسال بازبینی می‌کند (human-in-the-loop).
-- ارسال با Resend (اختیاری — بدون کلید، پیش‌نویس‌ها قابل کپی هستند).
-- ───────────────────────────────────────────────────────────────

create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  segment_key text not null,                    -- کلید سگمنت تعریف‌شده در کد
  goal        text,                             -- هدف کمپین (به AI داده می‌شود)
  status      text not null default 'draft',    -- draft | sent
  created_by  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.campaign_emails (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  lead_id     uuid references public.leads(id) on delete set null,
  to_name     text not null,
  to_email    text not null,
  context     jsonb,                            -- زمینه‌ی شخصی‌سازی (چالش، وضعیت، …)
  subject     text,
  body_text   text,
  status      text not null default 'pending',  -- pending | ready | skipped | sent | failed
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists campaign_emails_campaign_idx on public.campaign_emails (campaign_id);

alter table public.campaigns       enable row level security;
alter table public.campaign_emails enable row level security;


-- ╔══════════════════════════════════════════════════════════════
-- ║  فایل: widget-schema.sql
-- ╚══════════════════════════════════════════════════════════════
-- ───────────────────────────────────────────────────────────────
-- آرکان فاز ۲ / M2 — اسکیمای ویجت قابل‌جاسازی
-- در SQL Editor همان پروژه‌ی Supabase اجرا کنید.
-- ───────────────────────────────────────────────────────────────

create table if not exists public.widget_config (
  id              uuid primary key default gen_random_uuid(),
  enabled         boolean not null default true,
  primary_color   text not null default '#143A32',
  position        text not null default 'left',     -- left | right
  welcome_message text not null default 'سلام! من دستیار هوشمند آرکان هستم. چطور می‌توانم درباره‌ی خدمات و رشد کسب‌وکارتان کمک کنم؟',
  launcher_text   text not null default 'گفت‌وگو با مشاور',
  allowed_domains text[] not null default '{}',     -- خالی ⇒ همه‌ی دامنه‌ها مجاز
  updated_at      timestamptz not null default now()
);

alter table public.widget_config enable row level security;

-- یک ردیف پیش‌فرض (فقط اگر خالی باشد)
insert into public.widget_config (enabled)
select true
where not exists (select 1 from public.widget_config);

