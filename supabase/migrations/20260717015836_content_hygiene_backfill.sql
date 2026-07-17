update public.passages
set module = case
  when trim(title) in (
    'New Electricity Account', 'Public Personal Computers Available',
    'New Book Releases', 'Intercity Sleeper London-Scotland',
    'West Thames College', 'Some Places to Visit', 'West Thames College II'
  ) then 'general'::public.module
  else 'academic'::public.module
end
where skill = 'reading' and module is null;

-- Rewriting these would invalidate their linked answer sets, so retire the
-- four legacy pages below the agreed 1,500-character quality floor.
update public.passages
set status = 'archived'
where skill = 'reading' and status = 'published'
  and length(coalesce(body_html, '')) < 1500;

update public.passages
set difficulty = 'medium'
where skill = 'writing' and difficulty is null;
