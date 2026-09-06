-- ============================================================
-- NEUROBAND INTELLIGENCE HUB — DATABASE SETUP
-- Run this once in Supabase: Project → SQL Editor → New query
-- → paste this whole file → Run.
-- ============================================================

-- Table: entries (Phase 2/3 — repository, one row per source)
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  kin text not null,
  kiq text not null,
  source text not null,
  author text not null,
  source_type text not null,
  date_published date,
  date_collected date,
  relevance text not null,
  file_path text,
  file_name text,
  created_at timestamptz default now()
);

-- Table: documents (Collection Plan + Manual text, editable in the UI)
create table if not exists documents (
  slug text primary key,
  content text not null,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- This project uses the public "anon" key for a small group
-- project, so we open read/write to anyone with the link/key.
-- This is fine for a class assignment kept on a private URL —
-- it is NOT how you'd configure this for a real company system.
-- ------------------------------------------------------------
alter table entries enable row level security;
alter table documents enable row level security;

create policy "Allow all read on entries" on entries for select using (true);
create policy "Allow all insert on entries" on entries for insert with check (true);
create policy "Allow all update on entries" on entries for update using (true);

create policy "Allow all read on documents" on documents for select using (true);
create policy "Allow all insert on documents" on documents for insert with check (true);
create policy "Allow all update on documents" on documents for update using (true);

-- ------------------------------------------------------------
-- STORAGE BUCKET for extract files (PDFs / images)
-- Run this section too — it creates a public bucket called
-- "sources" and opens it the same way as the tables above.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sources', 'sources', true)
on conflict (id) do nothing;

create policy "Allow all read on sources bucket" on storage.objects
  for select using (bucket_id = 'sources');

create policy "Allow all upload on sources bucket" on storage.objects
  for insert with check (bucket_id = 'sources');