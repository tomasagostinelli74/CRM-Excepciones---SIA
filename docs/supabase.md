# Publicar el sistema con un link (guia sin conocimientos tecnicos)

Esta guia te lleva de "el sistema vive en una computadora" a "el sistema
tiene un link web que cualquiera del equipo puede abrir". No necesitas saber
programar ni usar una terminal: son dos cuentas gratuitas y algunos
copiar-y-pegar.

Vas a crear dos cuentas:

- **Supabase** — donde vive la base de datos y los PDF adjuntos, en la nube,
  seguros aunque se apague tu computadora.
- **Vercel** — el servicio que le da al sistema un link real
  (`https://tu-sistema.vercel.app`) y lo mantiene prendido las 24 horas.

Las dos tienen plan gratuito, suficiente para este sistema.

Calculá unos 20-30 minutos la primera vez.

---

## Parte 1 — Crear el proyecto en Supabase

1. Entra a **[supabase.com](https://supabase.com)** y creá una cuenta
   (podes usar tu cuenta de GitHub o tu email).
2. Click en **"New Project"**.
3. Completá:
   - **Name**: por ejemplo `fichas-excepcion` (el nombre no importa mucho).
   - **Database Password**: elegi una contrasena y **guardala en un lugar
     seguro** (un Bloc de notas, por ejemplo). La vas a necesitar en la
     Parte 3. Si Supabase te ofrece "generar" una, tambien sirve — igual
     hay que guardarla.
   - **Region**: elegi la que este mas cerca (si aparece una de
     Sudamerica, esa; si no, cualquiera anda bien).
4. Click en **"Create new project"** y esperá 1-2 minutos mientras se
   prepara.

---

## Parte 2 — Crear las tablas (un solo copiar y pegar)

1. En el menu de la izquierda de tu proyecto de Supabase, buscá el icono
   de una hoja con `</>` que dice **"SQL Editor"** y hace click.
2. Click en **"New query"**.
3. Abri el archivo **`supabase/PEGAR_EN_SUPABASE.sql`** de la carpeta del
   proyecto (con el Bloc de notas, o cualquier editor de texto alcanza).
   Seleccioná todo el contenido (Ctrl+A) y copialo (Ctrl+C).
4. Pegalo en el recuadro grande del SQL Editor de Supabase (Ctrl+V).
5. Click en el boton **"Run"** (o Ctrl+Enter).

Si todo salio bien, abajo vas a ver un mensaje de exito y ninguna linea en
rojo. Esto ya creo todas las tablas y cargo los datos iniciales: dos
usuarios (`Aromero` / `LordAlan` como administrador, `Mfernandez` /
`SIA2026` como operador), 6 motivos de excepcion y 3 fechas de
recuperatorio de ejemplo.

> Si por error le das a "Run" dos veces, no pasa nada: esta escrito para
> poder correrse mas de una vez sin duplicar datos.

**Para confirmar que funciono:** en el menu de la izquierda, entra a
**"Table Editor"**. Deberias ver las tablas `alumnos`, `usuarios`,
`motivos_excepcion`, `fechas_recuperatorio`, `fichas_excepcion` y
`auditoria`.

---

## Parte 3 — Copiar las 3 claves de conexion

Todavia en el proyecto de Supabase, click en el icono de **engranaje**
("Project Settings") en la esquina inferior izquierda.

### Clave 1: la direccion de la base de datos

1. Entra a **"Database"** (en el menu de Settings).
2. Buscá la seccion **"Connection string"**.
3. Elegi el formato **"URI"**.
4. Copiá el texto. Se ve asi:
   `postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-xxxxx.pooler.supabase.com:6543/postgres`
5. **Importante**: donde dice `[YOUR-PASSWORD]`, reemplazalo por la
   contrasena que elegiste en la Parte 1 (sin los corchetes). Guardá este
   texto ya corregido — es el valor de `SUPABASE_DB_URL`.

### Clave 2: la direccion del proyecto

1. Entra a **"API"** (en el mismo menu de Settings).
2. Copiá el valor de **"Project URL"** (algo como
   `https://xxxxx.supabase.co`). Es el valor de `SUPABASE_URL`.

### Clave 3: la clave secreta del servidor

1. En la misma pantalla de **"API"**, buscá **"Project API keys"**.
2. Copiá la que dice **`service_role`** (puede pedirte click en "Reveal"
   para mostrarla). Es el valor de `SUPABASE_SERVICE_ROLE_KEY`.

> ⚠️ Esta ultima clave es secreta: da acceso total a la base de datos. No
> la compartas ni la pegues en ningun lugar salvo en Vercel, en el paso
> siguiente. Nunca va en un mensaje de WhatsApp, email, ni en el codigo.

Al final de esta parte tenes que tener guardados 3 valores:
`SUPABASE_DB_URL`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

---

## Parte 4 — Publicar en Vercel

1. Entra a **[vercel.com](https://vercel.com)** y creá una cuenta
   **con GitHub** (el mismo GitHub donde esta el codigo del proyecto) —
   esto hace que Vercel pueda ver el repositorio directamente.
2. Click en **"Add New..."** y despues **"Project"**.
3. Buscá el repositorio (`CRM-Excepciones---SIA`) en la lista y click en
   **"Import"**.
4. Vercel va a detectar que es un proyecto Next.js solo. No cambies nada
   en "Build and Output Settings".
5. Abri la seccion **"Environment Variables"** y cargá, una por una
   (nombre a la izquierda, valor a la derecha):

   | Nombre | Valor |
   |---|---|
   | `SESSION_SECRET` | Cualquier texto largo y aleatorio, minimo 32 caracteres. Si no sabes que poner, escribi 40 letras y numeros al azar. |
   | `DATA_ADAPTER` | `supabase` |
   | `STORAGE_ADAPTER` | `supabase` |
   | `SUPABASE_DB_URL` | La Clave 1 de la Parte 3 (con la contrasena ya puesta) |
   | `SUPABASE_URL` | La Clave 2 de la Parte 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | La Clave 3 de la Parte 3 |
   | `MAX_PDF_MB` | `10` |
   | `TZ` | `America/Argentina/Buenos_Aires` |

6. Click en **"Deploy"**.
7. Esperá 1-3 minutos. Cuando termine, Vercel te va a mostrar un boton
   para visitar el sitio, con un link como
   `https://crm-excepciones-sia.vercel.app`.

**Ese es el link del sistema.** Es el que le pasas a tu equipo. Anda desde
cualquier navegador, en computadora, tablet o celular.

Entra con `Aromero` / `LordAlan` (administrador) y cambia la contrasena
de inmediato desde **Usuarios** en el panel de administracion — son
credenciales de arranque, pensadas para que las reemplaces apenas entres.

---

## Parte 5 — Cargar el padron de alumnos

El sistema arranca sin alumnos cargados (esos datos son personales y por
eso no viajan con el codigo). Una vez adentro del sistema, con el usuario
administrador:

1. Anda a **Alumnos** en el menu.
2. Subi el Excel del sistema academico (columnas `legajo` y `alumno`).
3. Vas a ver una vista previa (cuantos alumnos entran, si hay alguno con
   error) antes de que se guarde nada.
4. Click en **"Confirmar e importar"**.

Podes repetir este paso cada vez que tengas una actualizacion del padron:
agrega los alumnos nuevos y actualiza los existentes, sin borrar a nadie.

---

## Listo, ¿y ahora?

- **Cambia las dos contrasenas iniciales** desde el panel de
  administracion, en Usuarios.
- Guarda en un lugar seguro (fuera del chat, fuera del codigo) los 3
  valores de Supabase y el `SESSION_SECRET`: son las llaves del sistema.
- Cada vez que se suban cambios al codigo del proyecto en GitHub, Vercel
  vuelve a publicar el sitio solo, sin que tengas que hacer nada.

---

## Si algo no funciona

**"Error de conexion" o la pagina no carga datos.**
Revisa `SUPABASE_DB_URL` en Vercel: es el error mas comun. Verifica que:
- reemplazaste `[YOUR-PASSWORD]` por la contrasena real (sin los
  corchetes),
- no quedo ningun espacio de mas al copiar y pegar,
- la contrasena no tiene un caracter raro que se haya cortado al copiar
  (si tu contrasena tiene simbolos como `@` o `#`, y algo falla, es mas
  facil crear una contrasena nueva sin simbolos desde Supabase: Settings →
  Database → "Reset database password").

**Subi un PDF y da error.**
Revisa que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` esten bien
copiados en Vercel, y que en la Parte 2 el "Run" haya terminado sin
errores en rojo (esa migracion es la que crea el espacio de
almacenamiento para los PDF).

**Cambie una variable de entorno en Vercel y no paso nada.**
Vercel necesita "Redeploy" para que una variable nueva tenga efecto: en tu
proyecto de Vercel, pestana **Deployments**, en el ultimo despliegue click
en los tres puntos → **Redeploy**.

**Quiero probarlo en mi computadora antes de publicarlo.**
Es la Parte 1 del `README.md` del proyecto — no hace falta ninguna cuenta
para eso, corre todo local.

---

## Para quien vaya a tocar el codigo

Notas tecnicas de lo que hay detras de esta guia:

- La capa de datos habla Postgres directo (con transacciones reales:
  `BEGIN`/`COMMIT`), no a traves de la API REST de Supabase
  (PostgREST). El codigo esta en `src/lib/data/postgres/`; `src/lib/data/supabase/`
  solo re-exporta esa clase bajo el nombre que usan el resto de los
  archivos.
- La autenticacion sigue siendo la propia de la app (scrypt + cookie
  firmada con HMAC, tabla `usuarios`), no Supabase Auth. La app es 100%
  server-side — el navegador nunca le habla a Supabase directo — asi que
  el unico secreto que importa es la `service_role key`, que nunca sale
  del servidor.
- Por eso mismo, las tablas tienen RLS activado pero **sin ninguna
  politica**: nada es alcanzable con la clave publica. Es la configuracion
  mas segura para este tipo de arquitectura, no un descuido.
- El cupo de cada fecha y la regla de "un alumno no puede tener dos
  fichas vigentes para la misma fecha" estan garantizados **dentro de la
  base** (un trigger y un indice unico parcial, ver
  `supabase/migrations/20260101000000_esquema_inicial.sql`), no solo en
  el codigo de la aplicacion: dos cargas simultaneas no pueden pasarse del
  cupo. Esto esta probado con un test de concurrencia real contra
  Postgres (dos inserciones simultaneas contra un cupo de 1: gana
  exactamente una).
- `supabase/PEGAR_EN_SUPABASE.sql` es la union de los 3 archivos de
  `supabase/migrations/`, generada para que la Parte 2 de esta guia sea un
  solo copiar-y-pegar. Si se agrega o cambia una migracion, hay que
  regenerarlo (concatenar los archivos de esa carpeta en orden).
- Todo esto se probo end-to-end con las 95 verificaciones de
  `tests/e2e/` corriendo contra un Postgres real (no mockeado), con las
  dos capas (`DATA_ADAPTER=supabase`, `STORAGE_ADAPTER=local` — el
  storage de Supabase en si no se pudo probar en vivo por no haber un
  proyecto Supabase real disponible en el entorno de desarrollo; el
  codigo de `src/lib/storage/supabase.ts` sigue la API documentada de
  Supabase Storage pero conviene probarlo con el primer PDF real que se
  suba tras publicar).
