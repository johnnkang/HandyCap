-- One row per round per account.
--
-- Timestamps are TEXT holding the exact ISO-8601 UTC string the client wrote,
-- not timestamptz. The merge compares them lexicographically, and Postgres
-- renders timestamptz as "2026-09-08T12:00:00+00:00" while JavaScript's
-- toISOString() produces "2026-09-08T12:00:00.000Z" — mixing the two formats
-- would silently corrupt conflict resolution.
create table if not exists public.rounds (
  user_id    uuid not null references auth.users (id) on delete cascade,
  round_id   text not null,
  -- json, not jsonb: jsonb normalises and reorders keys, which would change
  -- the serialised payload the client fingerprints its pushes with, making
  -- every pulled row look new and re-pushing the whole record every sync.
  -- Nothing ever queries inside the payload, so jsonb buys nothing here.
  payload    json,
  updated_at text not null,
  deleted_at text,
  -- Server-assigned, monotonic in commit order, and the ONLY thing the client's
  -- pull cursor advances on. updated_at is a client clock: a device running
  -- fast would carry a timestamp-based cursor past rows other devices had not
  -- written yet and never be handed them again.
  cursor     text not null,
  primary key (user_id, round_id)
);

create sequence if not exists public.rounds_cursor_seq;

-- Zero-padded so the client can compare cursors lexicographically, exactly as
-- the in-memory fake does.
create or replace function public.stamp_cursor()
returns trigger
language plpgsql
as $$
begin
  new.cursor := lpad(nextval('public.rounds_cursor_seq')::text, 20, '0');
  return new;
end;
$$;

drop trigger if exists rounds_stamp_cursor on public.rounds;
create trigger rounds_stamp_cursor
  before insert or update on public.rounds
  for each row execute function public.stamp_cursor();

-- Serves the incremental pull: rows after a cursor, for one account.
create index if not exists rounds_user_cursor
  on public.rounds (user_id, cursor);

alter table public.rounds enable row level security;

-- "You can only ever touch your own rounds", enforced by Postgres rather than
-- by application code that has to be right every time.
drop policy if exists "own rounds" on public.rounds;
create policy "own rounds" on public.rounds
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Account deletion. A client cannot delete an auth user, so this runs as the
-- definer. The cascade on user_id removes the rounds with it.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
