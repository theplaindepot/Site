-- Run this in Supabase SQL Editor and send me the results.
-- It lists your existing public tables and columns so I can map the website to them.

select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
