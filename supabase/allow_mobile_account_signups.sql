-- Run this in the Supabase SQL Editor for the connected Plain Depot project.
-- It allows the public website/mobile app to submit contractor account requests.

create extension if not exists pgcrypto;

create table if not exists public.plain_depot_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  company text not null,
  email text not null,
  phone text,
  trade text not null default 'Electrical',
  project_type text,
  default_zip text,
  notes text,
  status text not null default 'new',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.plain_depot_clients
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.plain_depot_clients alter column user_id set default auth.uid();

create index if not exists plain_depot_clients_user_id_idx on public.plain_depot_clients (user_id);
create index if not exists plain_depot_clients_email_idx on public.plain_depot_clients (lower(email));

alter table public.plain_depot_clients enable row level security;

grant insert on public.plain_depot_clients to anon, authenticated;
grant select on public.plain_depot_clients to authenticated;

drop policy if exists "Website can create Plain Depot clients" on public.plain_depot_clients;
create policy "Website can create Plain Depot clients"
on public.plain_depot_clients
for insert
to anon, authenticated
with check (true);

drop policy if exists "Users can read their own Plain Depot client profile" on public.plain_depot_clients;
create policy "Users can read their own Plain Depot client profile"
on public.plain_depot_clients
for select
to authenticated
using (user_id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "Dashboard can read Plain Depot clients" on public.plain_depot_clients;
create policy "Dashboard can read Plain Depot clients"
on public.plain_depot_clients
for select
to authenticated
using (true);

alter table if exists public.plain_depot_orders
  add column if not exists account_user_id uuid references auth.users(id) on delete set null,
  add column if not exists client_id uuid references public.plain_depot_clients(id) on delete set null,
  add column if not exists customer_email text,
  add column if not exists customer_company text,
  add column if not exists order_items jsonb not null default '[]'::jsonb,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists tracking_status text,
  add column if not exists tracking_eta text,
  add column if not exists tracking_location text,
  add column if not exists tracking_url text,
  add column if not exists tracking_events jsonb not null default '[]'::jsonb,
  add column if not exists tracking_updated_at timestamp with time zone;

do $$
begin
  if to_regclass('public.plain_depot_orders') is not null then
    create index if not exists plain_depot_orders_account_user_id_idx on public.plain_depot_orders (account_user_id);
    create index if not exists plain_depot_orders_client_id_idx on public.plain_depot_orders (client_id);
    create index if not exists plain_depot_orders_customer_email_idx on public.plain_depot_orders (lower(customer_email));
    create index if not exists plain_depot_orders_tracking_number_idx on public.plain_depot_orders (tracking_number);
  end if;
end $$;

do $$
begin
  if to_regclass('public.plain_depot_orders') is not null then
    execute 'grant select on public.plain_depot_orders to authenticated';
    execute 'drop policy if exists "Users can read their own Plain Depot orders" on public.plain_depot_orders';
    execute $policy$
      create policy "Users can read their own Plain Depot orders"
      on public.plain_depot_orders
      for select
      to authenticated
      using (
        account_user_id = auth.uid()
        or lower(customer_email) = lower(auth.jwt() ->> 'email')
        or client_id in (
          select id
          from public.plain_depot_clients
          where user_id = auth.uid()
            or lower(email) = lower(auth.jwt() ->> 'email')
        )
        or order_items -> 'customer' ->> 'userId' = auth.uid()::text
        or lower(order_items -> 'customer' ->> 'email') = lower(auth.jwt() ->> 'email')
      )
    $policy$;
  end if;
end $$;

create table if not exists public.plain_depot_mobile_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  cart jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  previous_orders jsonb not null default '[]'::jsonb,
  notifications jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

alter table public.plain_depot_mobile_app_state
  add column if not exists profile jsonb not null default '{}'::jsonb,
  add column if not exists previous_orders jsonb not null default '[]'::jsonb,
  add column if not exists notifications jsonb not null default '[]'::jsonb,
  add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.plain_depot_mobile_app_state enable row level security;

grant select, insert, update, delete on public.plain_depot_mobile_app_state to authenticated;

drop policy if exists "Users can read their own Plain Depot mobile app state" on public.plain_depot_mobile_app_state;
create policy "Users can read their own Plain Depot mobile app state"
on public.plain_depot_mobile_app_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own Plain Depot mobile app state" on public.plain_depot_mobile_app_state;
create policy "Users can create their own Plain Depot mobile app state"
on public.plain_depot_mobile_app_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Plain Depot mobile app state" on public.plain_depot_mobile_app_state;
create policy "Users can update their own Plain Depot mobile app state"
on public.plain_depot_mobile_app_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.plain_depot_user_order_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.plain_depot_clients(id) on delete set null,
  order_id text,
  customer jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'submitted',
  created_at timestamp with time zone not null default now()
);

alter table public.plain_depot_user_order_history
  add column if not exists client_id uuid references public.plain_depot_clients(id) on delete set null;

create index if not exists plain_depot_user_order_history_user_id_idx on public.plain_depot_user_order_history (user_id);
create index if not exists plain_depot_user_order_history_client_id_idx on public.plain_depot_user_order_history (client_id);

alter table public.plain_depot_user_order_history enable row level security;

grant select, insert on public.plain_depot_user_order_history to authenticated;

drop policy if exists "Users can read their own Plain Depot order history" on public.plain_depot_user_order_history;
create policy "Users can read their own Plain Depot order history"
on public.plain_depot_user_order_history
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their own Plain Depot order history" on public.plain_depot_user_order_history;
create policy "Users can create their own Plain Depot order history"
on public.plain_depot_user_order_history
for insert
to authenticated
with check (auth.uid() = user_id);

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'plain_depot_products',
    'plain_depot_orders',
    'plain_depot_suppliers',
    'plain_depot_shipments',
    'plain_depot_settings',
    'plain_depot_clients',
    'plain_depot_mobile_app_state',
    'plain_depot_user_order_history'
  ]
  loop
    if to_regclass('public.' || realtime_table) is not null then
      begin
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      exception
        when duplicate_object then null;
        when undefined_object then null;
        when invalid_parameter_value then null;
      end;
    end if;
  end loop;
end $$;
