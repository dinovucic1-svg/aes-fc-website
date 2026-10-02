update public.aesfc_photos
set is_active = false
where url like 'data:image/%'
  and length(url) > 400000;

update public.aesfc_photos
set is_active = false
where is_active = true
  and id in (
    select id
    from public.aesfc_photos
    where is_active = true
    order by created_at asc
    offset 60
  );
