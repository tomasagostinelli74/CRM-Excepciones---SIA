-- ===========================================================================
-- Storage: bucket PRIVADO para los comprobantes PDF.
--
-- `public = false` es lo que hace que no exista una URL publica al PDF: el
-- unico acceso es a traves del servidor de la aplicacion (que usa la
-- service role key, igual que con las tablas). No se agregan politicas de
-- storage.objects por el mismo motivo que en las tablas: nadie mas que el
-- servidor toca este bucket.
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos-fichas', 'adjuntos-fichas', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;
