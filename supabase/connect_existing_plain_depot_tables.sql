-- Run this against your existing Supabase project.
-- It does NOT recreate your product/order/shipment tables.
-- It only adds the missing client-profile table and public-safe storefront views.

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

create or replace function public.plain_depot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plain_depot_clients_set_updated_at on public.plain_depot_clients;
create trigger plain_depot_clients_set_updated_at
before update on public.plain_depot_clients
for each row execute function public.plain_depot_set_updated_at();

alter table public.plain_depot_products enable row level security;
alter table public.plain_depot_orders enable row level security;
alter table public.plain_depot_shipments enable row level security;
alter table public.plain_depot_settings enable row level security;
alter table public.plain_depot_clients enable row level security;

alter table public.plain_depot_products add column if not exists website_description text;
alter table public.plain_depot_products add column if not exists website_image text;
alter table public.plain_depot_products add column if not exists website_images jsonb not null default '[]'::jsonb;
alter table public.plain_depot_products add column if not exists website_featured boolean not null default true;
alter table public.plain_depot_products add column if not exists website_availability text;

create index if not exists plain_depot_clients_user_id_idx on public.plain_depot_clients (user_id);
create index if not exists plain_depot_clients_email_idx on public.plain_depot_clients (lower(email));
create index if not exists plain_depot_orders_account_user_id_idx on public.plain_depot_orders (account_user_id);
create index if not exists plain_depot_orders_client_id_idx on public.plain_depot_orders (client_id);
create index if not exists plain_depot_orders_customer_email_idx on public.plain_depot_orders (lower(customer_email));
create index if not exists plain_depot_orders_tracking_number_idx on public.plain_depot_orders (tracking_number);

drop view if exists public.plain_depot_public_products;
create view public.plain_depot_public_products as
select
  sku,
  name,
  category,
  price,
  stock,
  img,
  created_at,
  updated_at,
  case
    when stock <= 0 then 'Out of stock'
    when stock <= reorder_point then 'Limited availability'
    else 'Available'
  end as availability,
  website_description,
  website_image,
  website_images,
  coalesce(website_featured, true) as website_featured,
  website_availability
from public.plain_depot_products
where coalesce(website_featured, true) = true;

create or replace view public.plain_depot_public_settings as
select
  id,
  business_name,
  subtitle,
  updated_at
from public.plain_depot_settings;

grant select on public.plain_depot_public_products to anon, authenticated;
grant select on public.plain_depot_public_settings to anon, authenticated;

drop policy if exists "Website can read Plain Depot products" on public.plain_depot_products;
drop policy if exists "Website can read Plain Depot shipments" on public.plain_depot_shipments;
drop policy if exists "Website can read Plain Depot settings" on public.plain_depot_settings;
revoke select on public.plain_depot_products from anon;
revoke select on public.plain_depot_shipments from anon;
revoke select on public.plain_depot_settings from anon;

drop policy if exists "Website can create Plain Depot orders" on public.plain_depot_orders;
create policy "Website can create Plain Depot orders"
on public.plain_depot_orders for insert
to anon, authenticated
with check (true);

grant select on public.plain_depot_orders to authenticated;

drop policy if exists "Users can read their own Plain Depot orders" on public.plain_depot_orders;
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
);

drop policy if exists "Website can create Plain Depot clients" on public.plain_depot_clients;
create policy "Website can create Plain Depot clients"
on public.plain_depot_clients for insert
to anon, authenticated
with check (true);

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
