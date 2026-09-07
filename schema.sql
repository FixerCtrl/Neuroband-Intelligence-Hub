-- ============================================================
-- NEUROBAND INTELLIGENCE HUB — DATABASE SETUP
-- Safe to run this whole file again at any point — every
-- statement below is written so it won't error if the table,
-- policy, or bucket already exists. Run it in: Supabase →
-- SQL Editor → New query → paste this whole file → Run.
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

-- Table: members (Team tab — profiles + optional avatar)
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_path text,
  created_at timestamptz default now()
);

-- Table: tasks (Team tab — work assignment)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kin text,
  kiq text,
  assigned_to uuid references members(id) on delete set null,
  assigned_by uuid references members(id) on delete set null,
  status text not null default 'To do',
  due_date date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Open read/write for anyone with the anon key — fine for a
-- small class project on a private URL, not how you'd configure
-- a system holding real confidential company data.
-- ------------------------------------------------------------
alter table entries enable row level security;
alter table documents enable row level security;
alter table members enable row level security;
alter table tasks enable row level security;

drop policy if exists "Allow all read on entries" on entries;
drop policy if exists "Allow all insert on entries" on entries;
drop policy if exists "Allow all update on entries" on entries;
create policy "Allow all read on entries" on entries for select using (true);
create policy "Allow all insert on entries" on entries for insert with check (true);
create policy "Allow all update on entries" on entries for update using (true);

drop policy if exists "Allow all read on documents" on documents;
drop policy if exists "Allow all insert on documents" on documents;
drop policy if exists "Allow all update on documents" on documents;
create policy "Allow all read on documents" on documents for select using (true);
create policy "Allow all insert on documents" on documents for insert with check (true);
create policy "Allow all update on documents" on documents for update using (true);

drop policy if exists "Allow all read on members" on members;
drop policy if exists "Allow all insert on members" on members;
drop policy if exists "Allow all update on members" on members;
drop policy if exists "Allow all delete on members" on members;
create policy "Allow all read on members" on members for select using (true);
create policy "Allow all insert on members" on members for insert with check (true);
create policy "Allow all update on members" on members for update using (true);
create policy "Allow all delete on members" on members for delete using (true);

drop policy if exists "Allow all read on tasks" on tasks;
drop policy if exists "Allow all insert on tasks" on tasks;
drop policy if exists "Allow all update on tasks" on tasks;
drop policy if exists "Allow all delete on tasks" on tasks;
create policy "Allow all read on tasks" on tasks for select using (true);
create policy "Allow all insert on tasks" on tasks for insert with check (true);
create policy "Allow all update on tasks" on tasks for update using (true);
create policy "Allow all delete on tasks" on tasks for delete using (true);

-- ------------------------------------------------------------
-- STORAGE BUCKETS
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sources', 'sources', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Allow all read on sources bucket" on storage.objects;
drop policy if exists "Allow all upload on sources bucket" on storage.objects;
create policy "Allow all read on sources bucket" on storage.objects
  for select using (bucket_id = 'sources');
create policy "Allow all upload on sources bucket" on storage.objects
  for insert with check (bucket_id = 'sources');

drop policy if exists "Allow all read on avatars bucket" on storage.objects;
drop policy if exists "Allow all upload on avatars bucket" on storage.objects;
drop policy if exists "Allow all update on avatars bucket" on storage.objects;
create policy "Allow all read on avatars bucket" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "Allow all upload on avatars bucket" on storage.objects
  for insert with check (bucket_id = 'avatars');
create policy "Allow all update on avatars bucket" on storage.objects
  for update using (bucket_id = 'avatars');