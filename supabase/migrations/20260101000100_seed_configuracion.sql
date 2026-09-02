-- ===========================================================================
-- Datos iniciales: usuarios, motivos y fechas de ejemplo.
--
-- Se puede pegar y correr junto con el archivo anterior, o por separado
-- despues. Es idempotente: correrlo de nuevo no duplica nada.
--
-- NO incluye el padron de alumnos: son datos personales y se cargan aparte,
-- desde el panel de administracion (/admin/alumnos) una vez que el sistema
-- esta publicado.
-- ===========================================================================

-- --- Usuarios iniciales -----------------------------------------------------
-- Contrasenas ya hasheadas con scrypt (nunca se guarda texto plano). Son
-- credenciales de arranque: cambialas desde /admin/usuarios apenas entres.
--   Aromero    / LordAlan  (administrador)
--   Mfernandez / SIA2026   (operador)
insert into public.usuarios (usuario, nombre, rol, password_hash, activo) values
  ('Aromero', 'A. Romero', 'admin',
   'scrypt$16384$8$1$c7d46fb7743719eabf0b10cf9a646ac0$4bbcbe96e2be2105453cbaf63587758afeb778abe3195e7fe0aefec7c4ec22a5c482942657463f0d6ff34d6a265ae3a60a1f40a2c3df2c6f0ba4fbb9dc5e8d89',
   true),
  ('Mfernandez', 'M. Fernandez', 'operador',
   'scrypt$16384$8$1$69d7c6398d4c0cc4311a7fe117a7cc13$f4b95b11c0e53ca2d02d8be44b250b758abba4722154b337d465f6719864d2177a10221db5fdd1b7795435b9f4f8a1922aad9625888044d799616ec930fefbcb',
   true)
on conflict (lower(usuario)) do nothing;

-- --- Motivos de excepcion ----------------------------------------------------
insert into public.motivos_excepcion (descripcion, orden, activo) values
  ('Certificado medico',                        10, true),
  ('Superposicion con examen de otra carrera',  20, true),
  ('Motivo laboral certificado',                30, true),
  ('Fallecimiento de familiar directo',         40, true),
  ('Residencia fuera de la ciudad',             50, true),
  ('Otro (detallar en observaciones)',          90, true)
on conflict (lower(descripcion)) do nothing;

-- --- Fechas de recuperatorio de ejemplo -------------------------------------
insert into public.fechas_recuperatorio (fecha, cupo, activo) values
  (current_date + interval '14 days', 60,   true),
  (current_date + interval '28 days', 60,   true),
  (current_date + interval '45 days', null, true)
on conflict (fecha) do nothing;
