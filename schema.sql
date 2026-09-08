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
  bio text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Add columns to members created before these updates (safe to re-run)
alter table members add column if not exists bio text;

-- Add user_id to members created before this update (safe to re-run)
alter table members add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One profile per signed-in user — enforced at the database level
-- so it can't be bypassed even outside the app's UI.
create unique index if not exists members_user_id_unique on members(user_id) where user_id is not null;

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

-- Table: activity_log (append-only audit trail — nothing can
-- update or delete rows here, not even admins, by design)
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  action text not null,
  details text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- ADMIN CHECK
-- Edit the email list below to match the admin emails in
-- config.js. Everyone else remains a standard user.
-- ------------------------------------------------------------
create or replace function is_admin() returns boolean as $$
  select (auth.jwt() ->> 'email') in ('fixerctrl@gmail.com', 'mlungisimash27@gmail.com');
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
drop policy if exists "Leader or admin update on documents" on documents;
drop policy if exists "Everyone can edit documents" on documents;
create policy "Public read on documents" on documents for select using (true);
create policy "Authenticated insert on documents" on documents for insert with check (auth.role() = 'authenticated');
create policy "Everyone can edit documents" on documents for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Allow all read on members" on members;
drop policy if exists "Allow all insert on members" on members;
drop policy if exists "Allow all update on members" on members;
drop policy if exists "Allow all delete on members" on members;
drop policy if exists "Public read on members" on members;
drop policy if exists "Authenticated insert on members" on members;
drop policy if exists "Authenticated update on members" on members;
drop policy if exists "Admin delete on members" on members;
drop policy if exists "Users insert own member profile" on members;
drop policy if exists "Users or admin update member profile" on members;
create policy "Public read on members" on members for select using (true);
-- Each signed-in user may only create a member row for themselves.
create policy "Users insert own member profile" on members for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());
-- Members can edit their own profile, and admins can edit everyone.
create policy "Users or admin update member profile" on members for update
  using (user_id = auth.uid() or is_admin());
create policy "Admin delete on members" on members for delete using (is_admin());

drop policy if exists "Allow all read on tasks" on tasks;
drop policy if exists "Allow all insert on tasks" on tasks;
drop policy if exists "Allow all update on tasks" on tasks;
drop policy if exists "Allow all delete on tasks" on tasks;
drop policy if exists "Public read on tasks" on tasks;
drop policy if exists "Authenticated insert on tasks" on tasks;
drop policy if exists "Authenticated update on tasks" on tasks;
drop policy if exists "Admin delete on tasks" on tasks;
drop policy if exists "Task assignee or admin update on tasks" on tasks;
create policy "Public read on tasks" on tasks for select using (true);
create policy "Authenticated insert on tasks" on tasks for insert with check (auth.role() = 'authenticated');
create policy "Task assignee or admin update on tasks" on tasks for update
  using (
    assigned_to in (select id from members where user_id = auth.uid())
    or is_admin()
  )
  with check (
    assigned_to in (select id from members where user_id = auth.uid())
    or is_admin()
  );
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

-- ------------------------------------------------------------
-- ACTIVITY LOG: row level security
-- Anyone can read it (transparency). Any signed-in user can add
-- an entry (the app does this automatically). Nobody — not even
-- admins — can update or delete rows: no update/delete policy is
-- defined at all, so Postgres blocks both by default. This makes
-- the audit trail tamper-proof once written.
-- ------------------------------------------------------------
alter table activity_log enable row level security;
drop policy if exists "Public read on activity_log" on activity_log;
drop policy if exists "Authenticated insert on activity_log" on activity_log;
drop policy if exists "Admin update on activity_log" on activity_log;
drop policy if exists "Admin delete on activity_log" on activity_log;
create policy "Public read on activity_log" on activity_log for select using (true);
create policy "Authenticated insert on activity_log" on activity_log for insert with check (auth.role() = 'authenticated');
create policy "Admin update on activity_log" on activity_log for update using (is_admin()) with check (is_admin());
create policy "Admin delete on activity_log" on activity_log for delete using (is_admin());

-- ------------------------------------------------------------
-- REAL-TIME SYNC
-- Adds these tables to Supabase's realtime publication so every
-- open browser tab receives live updates automatically. Safe to
-- re-run — skips any table already added.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries') then
    alter publication supabase_realtime add table entries;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members') then
    alter publication supabase_realtime add table members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
    alter publication supabase_realtime add table tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents') then
    alter publication supabase_realtime add table documents;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log') then
    alter publication supabase_realtime add table activity_log;
  end if;
end $$;