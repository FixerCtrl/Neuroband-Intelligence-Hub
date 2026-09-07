-- ============================================================
-- NEUROBAND INTELLIGENCE HUB — DATABASE SETUP
-- Safe to run this whole file again at any point — every
-- statement below is written so it won't error if the table,
-- policy, function, or bucket already exists. Run it in:
-- Supabase → SQL Editor → New query → paste this whole file →
-- Run.
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
-- ADMIN CHECK
-- Edit the email list below to match ADMIN_EMAILS in config.js.
-- Anyone signed in with one of these emails can delete things;
-- everyone else who's signed in can still add/edit, just not
-- delete.
-- ------------------------------------------------------------
create or replace function is_admin() returns boolean as $$
  select (auth.jwt() ->> 'email') in ('you@example.com');
$$ language sql stable;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Anyone can read (the system stays publicly viewable, per the
-- assignment brief). Only signed-in users can add/edit. Only
-- admins (see is_admin() above) can delete.
-- ------------------------------------------------------------
alter table entries enable row level security;
alter table documents enable row level security;
alter table members enable row level security;
alter table tasks enable row level security;

drop policy if exists "Allow all read on entries" on entries;
drop policy if exists "Allow all insert on entries" on entries;
drop policy if exists "Allow all update on entries" on entries;
drop policy if exists "Public read on entries" on entries;
drop policy if exists "Authenticated insert on entries" on entries;
drop policy if exists "Authenticated update on entries" on entries;
drop policy if exists "Admin delete on entries" on entries;
create policy "Public read on entries" on entries for select using (true);
create policy "Authenticated insert on entries" on entries for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update on entries" on entries for update using (auth.role() = 'authenticated');
create policy "Admin delete on entries" on entries for delete using (is_admin());

drop policy if exists "Allow all read on documents" on documents;
drop policy if exists "Allow all insert on documents" on documents;
drop policy if exists "Allow all update on documents" on documents;
drop policy if exists "Public read on documents" on documents;
drop policy if exists "Authenticated insert on documents" on documents;
drop policy if exists "Authenticated update on documents" on documents;
create policy "Public read on documents" on documents for select using (true);
create policy "Authenticated insert on documents" on documents for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update on documents" on documents for update using (auth.role() = 'authenticated');

drop policy if exists "Allow all read on members" on members;
drop policy if exists "Allow all insert on members" on members;
drop policy if exists "Allow all update on members" on members;
drop policy if exists "Allow all delete on members" on members;
drop policy if exists "Public read on members" on members;
drop policy if exists "Authenticated insert on members" on members;
drop policy if exists "Authenticated update on members" on members;
drop policy if exists "Admin delete on members" on members;
create policy "Public read on members" on members for select using (true);
create policy "Authenticated insert on members" on members for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update on members" on members for update using (auth.role() = 'authenticated');
create policy "Admin delete on members" on members for delete using (is_admin());

drop policy if exists "Allow all read on tasks" on tasks;
drop policy if exists "Allow all insert on tasks" on tasks;
drop policy if exists "Allow all update on tasks" on tasks;
drop policy if exists "Allow all delete on tasks" on tasks;
drop policy if exists "Public read on tasks" on tasks;
drop policy if exists "Authenticated insert on tasks" on tasks;
drop policy if exists "Authenticated update on tasks" on tasks;
drop policy if exists "Admin delete on tasks" on tasks;
create policy "Public read on tasks" on tasks for select using (true);
create policy "Authenticated insert on tasks" on tasks for insert with check (auth.role() = 'authenticated');
create policy "Authenticated update on tasks" on tasks for update using (auth.role() = 'authenticated');
create policy "Admin delete on tasks" on tasks for delete using (is_admin());

-- ------------------------------------------------------------
-- STORAGE BUCKETS
-- Same model: public read, authenticated upload/update.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sources', 'sources', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Allow all read on sources bucket" on storage.objects;
drop policy if exists "Allow all upload on sources bucket" on storage.objects;
drop policy if exists "Public read on sources bucket" on storage.objects;
drop policy if exists "Authenticated upload on sources bucket" on storage.objects;
create policy "Public read on sources bucket" on storage.objects
  for select using (bucket_id = 'sources');
create policy "Authenticated upload on sources bucket" on storage.objects
  for insert with check (bucket_id = 'sources' and auth.role() = 'authenticated');

drop policy if exists "Allow all read on avatars bucket" on storage.objects;
drop policy if exists "Allow all upload on avatars bucket" on storage.objects;
drop policy if exists "Allow all update on avatars bucket" on storage.objects;
drop policy if exists "Public read on avatars bucket" on storage.objects;
drop policy if exists "Authenticated upload on avatars bucket" on storage.objects;
drop policy if exists "Authenticated update on avatars bucket" on storage.objects;
create policy "Public read on avatars bucket" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "Authenticated upload on avatars bucket" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "Authenticated update on avatars bucket" on storage.objects
  for update using (bucket_id = 'avatars' and auth.role() = 'authenticated');