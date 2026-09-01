-- ===========================================================================
-- Datos iniciales de configuracion (motivos y fechas de ejemplo).
--
-- NO incluye alumnos: el padron son datos personales y se carga aparte,
-- desde el panel de admin o con `npm run import:alumnos`.
-- NO incluye usuarios: los crea Supabase Auth; ver docs/supabase.md para
-- darle rol al primer administrador.
-- ===========================================================================

insert into public.motivos_excepcion (descripcion, orden, activo) values
  ('Certificado medico',                        10, true),
  ('Superposicion con examen de otra carrera',  20, true),
  ('Motivo laboral certificado',                30, true),
  ('Fallecimiento de familiar directo',         40, true),
  ('Residencia fuera de la ciudad',             50, true),
  ('Otro (detallar en observaciones)',          90, true)
on conflict do nothing;

insert into public.fechas_recuperatorio (fecha, cupo, activo) values
  (current_date + interval '14 days', 60,   true),
  (current_date + interval '28 days', 60,   true),
  (current_date + interval '45 days', null, true)
on conflict (fecha) do nothing;
