-- Task event outbox for reliable delivery (mxmcgi -> mxmnotify)
-- Minimal schema: store payload + delivery status/attempts

create table if not exists public.task_event_outbox (
  event_id text primary key,
  module_type text not null,
  task_id text not null,
  user_id text not null,
  task_status text not null,
  payload jsonb not null,
  attempts int not null default 0,
  last_error text,
  sent_at timestamp,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create index if not exists task_event_outbox_unsent_idx
  on public.task_event_outbox (sent_at, created_at);

