alter table if exists public.newsletter_items
  add column if not exists badge text null;
