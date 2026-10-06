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
  added_by text,
  added_by_email text,
  added_by_user_id uuid references auth.users(id) on delete set null,
  source_type text not null,
  date_published date,
  date_collected date,
  relevance text not null,
  file_path text,
  file_name text,
  created_at timestamptz default now()
);

alter table entries add column if not exists added_by text;
alter table entries add column if not exists added_by_email text;
alter table entries add column if not exists added_by_user_id uuid references auth.users(id) on delete set null;

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
  approved boolean not null default true,
  profile_completed boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Add columns to members created before these updates (safe to re-run)
alter table members add column if not exists bio text;

-- Add user_id to members created before this update (safe to re-run)
alter table members add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table members add column if not exists last_seen_at timestamptz;
alter table members add column if not exists last_login_at timestamptz;
alter table members add column if not exists approved boolean not null default true;
alter table members add column if not exists profile_completed boolean not null default false;

update members
set profile_completed = true
where not profile_completed
  and nullif(trim(name), '') is not null
  and nullif(trim(bio), '') is not null;

-- Private WhatsApp linking, notification consent, and source-intake state.
create table if not exists member_whatsapp (
  member_id uuid primary key references members(id) on delete cascade,
  phone_e164 text unique,
  opted_in_at timestamptz,
  linked_at timestamptz,
  link_code_hash text,
  link_code_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_intake_sessions (
  phone_e164 text primary key,
  member_id uuid not null references members(id) on delete cascade,
  step text not null,
  payload jsonb not null default '{}'::jsonb,
  file_path text,
  file_name text,
  mime_type text,
  updated_at timestamptz not null default now()
);

-- One profile per signed-in user — enforced at the database level
-- so it can't be bypassed even outside the app's UI.
create unique index if not exists members_user_id_unique on members(user_id) where user_id is not null;

-- Remove legacy unclaimed placeholder profiles; claimed profiles are untouched.
delete from members
where user_id is null
  and name in ('FixerCtrl', 'Team 01');

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

-- Table: task_comments (questions and discussion on assigned work)
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references members(id) on delete set null,
  author_email text,
  body text not null,
  created_at timestamptz default now()
);

-- Table: activity_log (append-only audit trail — nothing can
-- update or delete rows here, not even admins, by design)
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  actor_name text,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details text,
  created_at timestamptz default now()
);

alter table activity_log add column if not exists actor_name text;
alter table activity_log add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

update activity_log a
set actor_name = coalesce(a.actor_name, m.name, a.actor_email),
    actor_user_id = coalesce(a.actor_user_id, u.id)
from auth.users u
left join members m on m.user_id = u.id
where lower(a.actor_email) = lower(u.email)
  and (a.actor_name is null or a.actor_user_id is null);

-- Backfill source contributors only from a matching nearby audit event.
with candidate_matches as (
  select
    e.id as entry_id,
    coalesce(m.name, a.actor_email) as added_by,
    a.actor_email as added_by_email,
    u.id as added_by_user_id,
    row_number() over (
      partition by e.id
      order by abs(extract(epoch from (a.created_at - e.created_at))), a.created_at desc
    ) as entry_rank,
    row_number() over (
      partition by a.id
      order by abs(extract(epoch from (a.created_at - e.created_at))), e.created_at desc
    ) as activity_rank
  from entries e
  join activity_log a
    on a.action = 'added a source'
    and a.details = e.source || ' (' || e.kin || '_' || e.kiq || ')'
    and a.created_at between e.created_at - interval '5 minutes' and e.created_at + interval '5 minutes'
  left join auth.users u on lower(u.email) = lower(a.actor_email)
  left join members m on m.user_id = u.id
  where e.added_by_email is null or e.added_by_user_id is null
)
update entries e
set added_by = coalesce(e.added_by, matches.added_by),
    added_by_email = coalesce(e.added_by_email, matches.added_by_email),
    added_by_user_id = coalesce(e.added_by_user_id, matches.added_by_user_id)
from candidate_matches matches
where e.id = matches.entry_id
  and matches.entry_rank = 1
  and matches.activity_rank = 1;

-- ------------------------------------------------------------
-- ADMIN CHECK
-- Edit the email list below to match the admin emails in
-- config.js. Everyone else remains a standard user.
-- ------------------------------------------------------------
create or replace function is_admin() returns boolean as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('fixerctrl@gmail.com', 'mlungisimash27@gmail.com');
$$ language sql stable;

create or replace function stamp_activity_actor() returns trigger as $$
declare
  member_name text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select name into member_name from members where user_id = auth.uid();
  new.actor_user_id := auth.uid();
  new.actor_email := coalesce(auth.jwt() ->> 'email', new.actor_email);
  new.actor_name := coalesce(member_name, auth.jwt() -> 'user_metadata' ->> 'full_name', new.actor_email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists stamp_activity_actor on activity_log;
create trigger stamp_activity_actor
  before insert on activity_log
  for each row execute function stamp_activity_actor();

create or replace function audit_site_change() returns trigger as $$
declare
  old_row jsonb;
  new_row jsonb;
  record_row jsonb;
  action_text text;
  details_text text;
  task_name text;
  assignee_name text;
  source_actor_user_id uuid;
  source_actor_email text;
  source_actor_name text;
begin
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;
  record_row := coalesce(new_row, old_row);

  if tg_table_name = 'members' and tg_op = 'UPDATE'
      and (old_row - array['last_seen_at', 'last_login_at'])
          = (new_row - array['last_seen_at', 'last_login_at']) then
    return null;
  end if;
  if tg_table_name = 'member_whatsapp' and (
      (tg_op = 'INSERT' and new_row ->> 'phone_e164' is null)
      or (tg_op = 'UPDATE' and old_row ->> 'phone_e164' is not distinct from new_row ->> 'phone_e164')
      or (tg_op = 'DELETE' and old_row ->> 'phone_e164' is null)
  ) then
    return null;
  end if;

  case tg_table_name
    when 'entries' then
      source_actor_user_id := nullif(record_row ->> 'added_by_user_id', '')::uuid;
      source_actor_email := record_row ->> 'added_by_email';
      source_actor_name := record_row ->> 'added_by';
      action_text := case tg_op
        when 'INSERT' then 'added a source'
        when 'UPDATE' then 'updated a source'
        else 'deleted a source'
      end;
      details_text := coalesce(record_row ->> 'source', 'Source')
        || ' (' || coalesce(record_row ->> 'kin', '?')
        || '_' || coalesce(record_row ->> 'kiq', '?') || ')';
    when 'documents' then
      action_text := case
        when record_row ->> 'slug' = 'manual' then 'updated the Manual'
        else 'updated the Collection Plan'
      end;
    when 'members' then
      if tg_op = 'INSERT' then
        action_text := 'joined the team';
      elsif tg_op = 'DELETE' then
        action_text := 'removed a team member';
      elsif old_row ->> 'approved' is distinct from new_row ->> 'approved' then
        action_text := case new_row ->> 'approved'
          when 'true' then 'approved member access'
          else 'revoked member access'
        end;
      elsif old_row ->> 'avatar_path' is distinct from new_row ->> 'avatar_path' then
        action_text := 'updated a profile photo';
      else
        action_text := 'updated a member profile';
      end if;
      details_text := record_row ->> 'name';
    when 'member_whatsapp' then
      select m.user_id, u.email, m.name
        into source_actor_user_id, source_actor_email, source_actor_name
        from members m
        left join auth.users u on u.id = m.user_id
        where m.id = (record_row ->> 'member_id')::uuid;
      action_text := case
        when tg_op = 'DELETE' or new_row ->> 'phone_e164' is null then 'disconnected WhatsApp'
        else 'connected WhatsApp'
      end;
      details_text := source_actor_name;
    when 'tasks' then
      task_name := coalesce(record_row ->> 'title', 'Task');
      if tg_op = 'INSERT' then
        action_text := 'assigned a task';
        select name into assignee_name from members where id = (record_row ->> 'assigned_to')::uuid;
        details_text := '"' || task_name || '" to ' || coalesce(assignee_name, 'someone');
      elsif tg_op = 'DELETE' then
        action_text := 'deleted a task';
        details_text := '"' || task_name || '"';
      elsif old_row ->> 'assigned_to' is distinct from new_row ->> 'assigned_to' then
        action_text := 'reassigned a task';
        select name into assignee_name from members where id = (old_row ->> 'assigned_to')::uuid;
        details_text := '"' || task_name || '" from ' || coalesce(assignee_name, 'Unassigned');
        select name into assignee_name from members where id = (new_row ->> 'assigned_to')::uuid;
        details_text := details_text || ' to ' || coalesce(assignee_name, 'Unassigned');
      elsif old_row ->> 'status' is distinct from new_row ->> 'status' then
        action_text := 'changed task status';
        details_text := '"' || task_name || '" → ' || coalesce(new_row ->> 'status', 'unknown');
      else
        action_text := 'updated a task';
        details_text := '"' || task_name || '"';
      end if;
    when 'task_comments' then
      action_text := case tg_op
        when 'INSERT' then 'commented on a task'
        when 'UPDATE' then 'edited a task comment'
        else 'deleted a task comment'
      end;
      select title into task_name from tasks where id = (record_row ->> 'task_id')::uuid;
      details_text := coalesce(task_name, 'Task');
    else
      return null;
  end case;

  insert into activity_log (actor_email, actor_name, actor_user_id, action, details)
  values (source_actor_email, source_actor_name, source_actor_user_id, action_text, details_text);

  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists audit_entries_change on entries;
create trigger audit_entries_change
  after insert or update or delete on entries
  for each row execute function audit_site_change();

drop trigger if exists audit_documents_change on documents;
create trigger audit_documents_change
  after insert or update or delete on documents
  for each row execute function audit_site_change();

drop trigger if exists audit_members_change on members;
create trigger audit_members_change
  after insert or update or delete on members
  for each row execute function audit_site_change();

drop trigger if exists audit_member_whatsapp_change on member_whatsapp;
create trigger audit_member_whatsapp_change
  after insert or update or delete on member_whatsapp
  for each row execute function audit_site_change();

drop trigger if exists audit_tasks_change on tasks;
create trigger audit_tasks_change
  after insert or update or delete on tasks
  for each row execute function audit_site_change();

drop trigger if exists audit_task_comments_change on task_comments;
create trigger audit_task_comments_change
  after insert or update or delete on task_comments
  for each row execute function audit_site_change();

create or replace function is_approved_member() returns boolean as $$
  select is_admin() or exists (
    select 1 from members
    where user_id = auth.uid()
      and approved
      and profile_completed
      and nullif(trim(name), '') is not null
      and nullif(trim(bio), '') is not null
  );
$$ language sql stable security definer set search_path = public;

create or replace function enforce_member_approval() returns trigger as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') and not is_admin() then
    if tg_op = 'INSERT' then
      new.approved := false;
      new.profile_completed := new.profile_completed
        and nullif(trim(new.name), '') is not null
        and nullif(trim(new.bio), '') is not null;
    elsif new.approved is distinct from old.approved then
      raise exception 'Only an admin can change member approval';
    elsif new.profile_completed and (nullif(trim(new.name), '') is null or nullif(trim(new.bio), '') is null) then
      raise exception 'A complete profile requires a name and short bio';
    end if;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists enforce_member_approval on members;
create trigger enforce_member_approval
  before insert or update on members
  for each row execute function enforce_member_approval();

update members m
set approved = true,
    profile_completed = true
from auth.users u
where m.user_id = u.id
  and lower(u.email) in ('fixerctrl@gmail.com', 'mlungisimash27@gmail.com')
  and nullif(trim(m.name), '') is not null
  and nullif(trim(m.bio), '') is not null;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Anyone can read (the system stays publicly viewable, per the
-- assignment brief). Only signed-in users can add/edit. Only
-- admins (see is_admin() above) can delete.
-- ------------------------------------------------------------
alter table entries enable row level security;
alter table documents enable row level security;
alter table members enable row level security;
alter table member_whatsapp enable row level security;
alter table whatsapp_intake_sessions enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;

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

drop policy if exists "Users read own WhatsApp settings" on member_whatsapp;
create policy "Users read own WhatsApp settings" on member_whatsapp for select
  using (member_id in (select id from members where user_id = auth.uid()) or is_admin());

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
create policy "Authenticated insert on tasks" on tasks for insert
  with check (
    auth.role() = 'authenticated'
    and assigned_by in (select id from members where user_id = auth.uid())
  );
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

drop policy if exists "Public read on task_comments" on task_comments;
drop policy if exists "Authenticated insert on task_comments" on task_comments;
create policy "Public read on task_comments" on task_comments for select using (true);
create policy "Authenticated insert on task_comments" on task_comments for insert with check (auth.role() = 'authenticated');

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
drop policy if exists "Authenticated update on sources bucket" on storage.objects;
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
drop policy if exists "Allow all read on activity_log" on activity_log;
drop policy if exists "Allow all insert on activity_log" on activity_log;
drop policy if exists "Allow all update on activity_log" on activity_log;
drop policy if exists "Allow all delete on activity_log" on activity_log;
drop policy if exists "Authenticated insert on activity_log" on activity_log;
drop policy if exists "Admin update on activity_log" on activity_log;
drop policy if exists "Admin delete on activity_log" on activity_log;
create policy "Public read on activity_log" on activity_log for select using (true);
create policy "Authenticated insert on activity_log" on activity_log for insert with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- APPROVED MEMBER ACCESS
-- Pending users may read and update only their own profile.
-- Workspace data and source files require a complete, approved
-- profile; admins always retain access for approval review.
-- ------------------------------------------------------------
drop policy if exists "Public read on entries" on entries;
drop policy if exists "Authenticated insert on entries" on entries;
drop policy if exists "Authenticated update on entries" on entries;
drop policy if exists "Approved members read entries" on entries;
drop policy if exists "Approved members insert entries" on entries;
drop policy if exists "Approved members update entries" on entries;
create policy "Approved members read entries" on entries for select using (is_approved_member());
create policy "Approved members insert entries" on entries for insert
  with check (auth.role() = 'authenticated' and is_approved_member());
create policy "Approved members update entries" on entries for update
  using (is_approved_member()) with check (is_approved_member());

drop policy if exists "Public read on documents" on documents;
drop policy if exists "Authenticated insert on documents" on documents;
drop policy if exists "Everyone can edit documents" on documents;
drop policy if exists "Approved members read documents" on documents;
drop policy if exists "Approved members insert documents" on documents;
drop policy if exists "Approved members update documents" on documents;
create policy "Approved members read documents" on documents for select using (is_approved_member());
create policy "Approved members insert documents" on documents for insert
  with check (auth.role() = 'authenticated' and is_approved_member());
create policy "Approved members update documents" on documents for update
  using (is_approved_member()) with check (is_approved_member());

drop policy if exists "Public read on members" on members;
drop policy if exists "Users insert own member profile" on members;
drop policy if exists "Users insert own pending profile" on members;
drop policy if exists "Users or admin update member profile" on members;
drop policy if exists "Members read approved profiles and own pending profile" on members;
create policy "Members read approved profiles and own pending profile" on members for select
  using (user_id = auth.uid() or is_approved_member());
create policy "Users insert own pending profile" on members for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());
create policy "Users or admin update member profile" on members for update
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

drop policy if exists "Public read on tasks" on tasks;
drop policy if exists "Authenticated insert on tasks" on tasks;
drop policy if exists "Task assignee or admin update on tasks" on tasks;
drop policy if exists "Approved members read tasks" on tasks;
drop policy if exists "Approved members insert tasks" on tasks;
drop policy if exists "Approved task assignee or admin update" on tasks;
create policy "Approved members read tasks" on tasks for select using (is_approved_member());
create policy "Approved members insert tasks" on tasks for insert
  with check (
    auth.role() = 'authenticated'
    and is_approved_member()
    and assigned_by in (select id from members where user_id = auth.uid())
  );
create policy "Approved task assignee or admin update" on tasks for update
  using (
    is_approved_member()
    and (assigned_to in (select id from members where user_id = auth.uid()) or is_admin())
  )
  with check (
    is_approved_member()
    and (assigned_to in (select id from members where user_id = auth.uid()) or is_admin())
  );

drop policy if exists "Public read on task_comments" on task_comments;
drop policy if exists "Authenticated insert on task_comments" on task_comments;
drop policy if exists "Approved members read task comments" on task_comments;
drop policy if exists "Approved members insert task comments" on task_comments;
create policy "Approved members read task comments" on task_comments for select using (is_approved_member());
create policy "Approved members insert task comments" on task_comments for insert
  with check (auth.role() = 'authenticated' and is_approved_member());

drop policy if exists "Public read on sources bucket" on storage.objects;
drop policy if exists "Authenticated upload on sources bucket" on storage.objects;
drop policy if exists "Approved members read source files" on storage.objects;
drop policy if exists "Approved members upload source files" on storage.objects;
drop policy if exists "Approved members update source files" on storage.objects;
drop policy if exists "Approved members delete source files" on storage.objects;
update storage.buckets set public = false where id = 'sources';
create policy "Approved members read source files" on storage.objects
  for select using (bucket_id = 'sources' and is_approved_member());
create policy "Approved members upload source files" on storage.objects
  for insert with check (bucket_id = 'sources' and auth.role() = 'authenticated' and is_approved_member());
create policy "Approved members delete source files" on storage.objects
  for delete using (
    bucket_id = 'sources'
    and is_approved_member()
    and (owner_id = auth.uid()::text or is_admin())
  );

drop policy if exists "Public read on activity_log" on activity_log;
drop policy if exists "Allow all read on activity_log" on activity_log;
drop policy if exists "Allow all insert on activity_log" on activity_log;
drop policy if exists "Allow all update on activity_log" on activity_log;
drop policy if exists "Allow all delete on activity_log" on activity_log;
drop policy if exists "Authenticated insert on activity_log" on activity_log;
drop policy if exists "Admin update on activity_log" on activity_log;
drop policy if exists "Admin delete on activity_log" on activity_log;
drop policy if exists "Approved members read activity log" on activity_log;
drop policy if exists "Authenticated users record activity" on activity_log;
create policy "Approved members read activity log" on activity_log for select using (is_approved_member());
create policy "Authenticated users record activity" on activity_log for insert
  with check (auth.role() = 'authenticated');

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
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments') then
    alter publication supabase_realtime add table task_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents') then
    alter publication supabase_realtime add table documents;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log') then
    alter publication supabase_realtime add table activity_log;
  end if;
end $$;

-- Refresh PostgREST so newly-created task_comments is immediately available.
notify pgrst, 'reload schema';