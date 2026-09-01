# Fichas de excepción — Examen de Ingreso

Sistema web para el departamento de Examen de Ingreso: registra de forma
prolija a los alumnos inscriptos que **no podrán asistir a la fecha de curso
asignada**, generando una *ficha de excepción* por caso, con el comprobante en
PDF adjunto y trazabilidad de quién cargó qué.

---

## Estado del proyecto

| | |
|---|---|
| **Persistencia** | SQLite local, detrás de una capa de datos intercambiable |
| **Adjuntos** | Disco del servidor (fuera de `/public`), detrás de una capa de storage |
| **Supabase** | **En stand by** — esquema, RLS y bucket ya escritos en `supabase/migrations/`; procedimiento de activación en [`docs/supabase.md`](docs/supabase.md) |
| **Autenticación** | Propia: scrypt + cookie firmada (HMAC-SHA256), roles `admin` / `operador` |

El diseño está hecho para que pasar a Supabase sea **escribir un adaptador, no
reescribir la aplicación**: ninguna pantalla ni Server Action conoce SQLite.
Todas hablan con la interfaz `Repositorio` (`src/lib/data/repository.ts`) y con
`Storage` (`src/lib/storage/index.ts`).

---

## Puesta en marcha

Requisitos: **Node.js 20.11+**.

```bash
npm install
cp .env.example .env.local
```

Generá el secreto de sesión y pegalo en `.env.local`:

```bash
openssl rand -base64 32
```

Después:

```bash
npm run db:migrate     # crea el esquema
npm run db:seed        # usuarios, motivos, fechas y 12 alumnos ficticios
npm run dev            # http://localhost:3000
```

### Usuarios iniciales

| Usuario | Contraseña | Rol |
|---|---|---|
| `Aromero` | `LordAlan` | Administrador |
| `Mfernandez` | `SIA2026` | Operador |

Se guardan **hasheadas con scrypt**, nunca en texto plano. Son credenciales de
puesta en marcha: **cambialas desde `/admin/usuarios` antes de usar el sistema
con datos reales**, y borrá estas filas de la tabla si el repositorio se
comparte.

### Cargar el padrón real de alumnos

El padrón es la fuente de verdad para validar la LU / legajo. Se carga desde el
Excel del sistema académico (columnas `legajo` y `alumno`, con el nombre en
formato `"Apellido, Nombre"`).

```bash
npm run import:alumnos -- padron/Alumnos_a_ingresar.xlsx
```

O desde el panel de administración, en **`/admin/alumnos`**, que además muestra
una **vista previa antes de confirmar**: cuántos alumnos entran, cuáles se
rechazan y por qué.

> **El padrón contiene datos personales de alumnos.** La carpeta `padron/` está
> en `.gitignore` a propósito: el archivo **no se versiona**. Si necesitás
> compartirlo, usá el canal que el departamento use para datos personales, no
> git.

El import es un **upsert**: agrega los legajos nuevos, actualiza los que
cambiaron y **no borra** a los que no figuren en el archivo, para que subir un
padrón parcial por error no deje sin validar a media facultad.

---

## Cómo se usa

### Panel del operador

- **`/fichas/nueva`** — Se ingresa el **legajo**, y al salir del campo (o con
  «Buscar») se valida contra el padrón: si existe, completa apellido y nombre en
  solo lectura; si no, muestra el error y **bloquea el envío**. Después se elige
  el **motivo** y la **fecha de recuperatorio** —ambos traídos de la base, sin
  nada hardcodeado— y se adjunta el **PDF**.
- **`/fichas`** — Listado con filtros por alumno, legajo, motivo, fecha de
  recuperatorio, rango de fechas de carga y estado. Los filtros viven en la URL,
  así que el listado es enlazable y compartible. Desde acá se ve o descarga el
  PDF de cada ficha y se **exporta a CSV** lo mismo que se está viendo.
- **`/fichas/[id]`** — Detalle con **historial de auditoría**, edición y
  anulación.

### Panel de administración (solo rol `admin`)

- **`/admin`** — Tablero con métricas y ocupación de cada fecha.
- **`/admin/motivos`** — Alta, edición, orden y activación de motivos.
- **`/admin/fechas`** — Fechas de recuperatorio con **cupo opcional**.
- **`/admin/alumnos`** — Import del padrón con vista previa, y búsqueda.
- **`/admin/usuarios`** — Usuarios y roles.

---

## Decisiones de diseño

**Las fichas se anulan, no se borran.** Anular pide un motivo y deja registrado
quién y cuándo; el registro y el PDF se conservan. El listado muestra las
vigentes por defecto y las anuladas quedan a un filtro de distancia. Anular
libera el cupo de la fecha.

**La validación del servidor es la que vale.** El formulario valida en el
navegador para dar feedback rápido, pero cada Server Action revalida todo antes
de tocar la base: que el legajo exista, que el motivo siga activo, que la fecha
siga disponible, que no se pase el cupo y que el alumno no tenga ya una ficha
vigente para esa fecha. Un motivo que el admin desactiva mientras el operador
completa el formulario es rechazado al enviar, con un mensaje claro.

**El PDF se valida por su firma binaria**, no por el nombre ni por el
`Content-Type`: ambos los elige el cliente, los primeros bytes (`%PDF-`) no.

**Los adjuntos nunca son públicos.** Viven fuera de `/public` y el único acceso
es `/api/fichas/[id]/archivo`, que exige sesión. Es la misma forma que tendrá
con Supabase Storage: bucket privado y *signed URLs* de vida corta.

**Ocultar botones no es seguridad.** La navegación filtra por rol solo para no
mostrar links inútiles; cada página de `/admin` revalida el rol en el servidor y
cada Server Action de admin empieza con `requerirRolEnAccion("admin")`. Hay un
test que invoca esas acciones como operador y verifica que no pasen.

**Roles y bajas surten efecto en el próximo click.** La sesión es sin estado,
pero cada request recarga el usuario desde la base, así que desactivar a alguien
lo deja afuera sin esperar a que venza la cookie.

**El circuito operativo funciona sin JavaScript.** Crear, editar y anular
fichas redirigen desde el servidor, y los formularios desplegables usan
`<details>`. Con JS la experiencia es mejor (búsqueda de legajo en vivo), pero
nada del circuito depende de él.

**Las fechas de calendario se manejan como texto `YYYY-MM-DD`.** Nunca se
construye un `Date` para mostrarlas: `new Date("2026-03-14")` se interpreta en
UTC y en Argentina (UTC−3) se mostraría un día antes.

### Sobre el Excel del padrón

El parser está ajustado a lo que el archivo real trae:

- ~8 % de las filas vienen con espacios de más (`"Cvitanich  , Luana Abril "`);
  se normalizan.
- Cuatro apellidos usan el acento agudo suelto como apóstrofo (`D´Amore`); se
  conserva tal cual para mostrar y se unifica solo para buscar. Buscar
  `D'Amore` encuentra las dos variantes, y `perez` encuentra `Pérez`.
- Si un nombre no tiene coma, no se adivina dónde termina el apellido (los
  apellidos compuestos son frecuentes): se guarda todo como apellido. Es
  preferible un dato incompleto pero fiel al archivo antes que uno inventado.
- El legajo se guarda como **texto** aunque hoy sea numérico, para no perder
  formato si mañana cambia.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run typecheck` | TypeScript en modo estricto |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Crea o actualiza el esquema |
| `npm run db:seed` | Datos de ejemplo (idempotente) |
| `npm run db:reset` | Borra base y adjuntos (solo desarrollo) |
| `npm run import:alumnos -- <ruta.xlsx>` | Importa el padrón |

---

## Tests

`tests/e2e/` ejercita la aplicación por HTTP contra un build de producción:
autenticación y roles, circuito completo de fichas, cupos, edición y anulación,
e import del padrón real.

```bash
bash tests/e2e/correr.sh
```

Requiere `python3` con `requests` y `openpyxl`, y el padrón en
`padron/Alumnos_a_ingresar.xlsx` (o la variable `PADRON_XLSX`). El script
levanta el servidor con datos limpios, corre las cuatro suites y lo apaga.

---

## Variables de entorno

Todas en `.env.example`. Las que importan:

| Variable | Por defecto | Para qué |
|---|---|---|
| `SESSION_SECRET` | — | Firma de la cookie de sesión. **Obligatoria en producción** (mín. 32 caracteres) |
| `DATA_ADAPTER` | `sqlite` | `sqlite` o `supabase` (este último, pendiente) |
| `SQLITE_PATH` | `./data/crm-excepciones.db` | Archivo de la base |
| `STORAGE_ADAPTER` | `local` | `local` o `supabase` (pendiente) |
| `STORAGE_PATH` | `./storage/adjuntos` | Dónde se guardan los PDF |
| `MAX_PDF_MB` | `10` | Tamaño máximo del adjunto |
| `TZ` | `America/Argentina/Buenos_Aires` | Zona horaria de fechas y horarios |

---

## Despliegue

### Antes de nada

1. **Cambiá las contraseñas iniciales** desde `/admin/usuarios`.
2. Generá un `SESSION_SECRET` propio y no lo reutilices entre ambientes.
3. Serví siempre por **HTTPS**: en producción la cookie de sesión sale con el
   flag `Secure`, así que sobre HTTP plano el navegador no la enviará y nadie
   podrá iniciar sesión. No es un bug: es el comportamiento correcto.

### Servidor propio (recomendado con la configuración actual)

Es lo que hoy funciona sin cambios, porque SQLite y los adjuntos en disco
necesitan un **filesystem persistente**:

```bash
npm ci
npm run build
npm run db:migrate
npm run db:seed          # solo la primera vez
SESSION_SECRET=... npm run start
```

Poné un reverse proxy con TLS (nginx, Caddy) delante, y hacé backup de
`data/` y `storage/`: ahí están la base y todos los comprobantes.

### Vercel

Vercel corre sobre un filesystem **efímero y de solo lectura**, así que
`DATA_ADAPTER=sqlite` y `STORAGE_ADAPTER=local` **no sirven ahí**: la base y los
PDF se perderían en cada despliegue. Desplegar en Vercel requiere primero
activar Supabase siguiendo [`docs/supabase.md`](docs/supabase.md).

Una vez hecho eso:

1. Importar el repositorio en Vercel (detecta Next.js solo).
2. Cargar en **Settings → Environment Variables**: `SESSION_SECRET`,
   `DATA_ADAPTER=supabase`, `STORAGE_ADAPTER=supabase`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `MAX_PDF_MB`, `TZ`.
3. Desplegar. Vercel ya sirve por HTTPS, así que la cookie `Secure` funciona.

> Los adjuntos viajan por Server Actions. El límite está en `next.config.ts`
> (`bodySizeLimit`) y el real lo impone `MAX_PDF_MB`, validado en el servidor.
> Tené en cuenta el límite de tamaño de request del plan de Vercel.

---

## Estructura

```
src/
  app/
    login/                    ingreso al sistema
    (app)/                    todo lo que exige sesión
      fichas/                 listado, alta, detalle, edición, anulación
      admin/                  tablero, motivos, fechas, alumnos, usuarios
    api/fichas/
      [id]/archivo/           descarga del PDF, con sesión
      exportar/               CSV del listado filtrado
  components/                 UI compartida
  lib/
    domain/                   entidades y errores del dominio
    data/
      repository.ts           ← el contrato: la única superficie de datos
      sqlite/                 adaptador actual
      supabase/               adaptador pendiente (documentado)
    storage/                  interfaz + adaptador local + validación de PDF
    auth/                     scrypt, sesión firmada, guards por rol
    import/                   parser del Excel del padrón
    validacion/               esquemas Zod compartidos
    utils/                    texto y fechas
scripts/                      migrate, seed, reset, import
supabase/migrations/          esquema Postgres + RLS + bucket (preparado)
tests/e2e/                    suite end-to-end
docs/supabase.md              cómo activar Supabase
```

---

## Nota de seguridad conocida

`npm audit` reporta una vulnerabilidad **moderada** en `uuid`, dependencia
transitiva de `exceljs`: falta un control de límites cuando se le pasa un buffer
propio, en la ruta de **escritura** de archivos. Acá `exceljs` solo se usa para
**leer** el padrón, así que esa ruta no se ejecuta. No hay versión corregida
disponible sin un cambio mayor de `exceljs`.
