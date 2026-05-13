create table if not exists public.trade_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  snapshot_kind text not null,
  trade_count integer not null default 0,
  checksum text not null,
  data jsonb not null
);

create index if not exists trade_state_snapshots_user_created_idx
  on public.trade_state_snapshots (user_id, created_at desc);

alter table public.trade_state_snapshots enable row level security;

create policy "Users can read their own trade state snapshots"
  on public.trade_state_snapshots
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own trade state snapshots"
  on public.trade_state_snapshots
  for insert
  with check (auth.uid() = user_id);
