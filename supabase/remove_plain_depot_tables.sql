-- Only run this if you want to remove the tables created by the Plain Depot schema.
-- This is destructive. Do not run it if any of these names match tables you already used.

drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.contractor_profiles cascade;
drop table if exists public.checkout_requests cascade;
drop table if exists public.quote_requests cascade;
drop table if exists public.supplier_routes cascade;
drop table if exists public.products cascade;
drop table if exists public.categories cascade;

drop function if exists public.set_updated_at() cascade;
