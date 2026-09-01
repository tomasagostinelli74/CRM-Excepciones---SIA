#!/usr/bin/env bash
#
# Corre la suite end-to-end contra un build de produccion.
#
#   bash tests/e2e/correr.sh
#
# Levanta el servidor en el puerto 3100 con datos frescos (seed + padron),
# ejecuta las cuatro suites y apaga el servidor al terminar.
#
# Requisitos: python3 con `requests` y `openpyxl`.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

PUERTO="${PUERTO:-3100}"
PADRON="${PADRON_XLSX:-padron/Alumnos_a_ingresar.xlsx}"

# Un servidor previo en el mismo puerto arruina la corrida en silencio: el
# reset borra el archivo de la base, pero ese proceso conserva el handle
# abierto al inodo viejo y sigue sirviendo los datos anteriores.
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PUERTO/" 2>/dev/null; then
  echo "Ya hay algo escuchando en el puerto $PUERTO."
  echo "Cerralo antes de correr los tests, o usa: PUERTO=3101 bash tests/e2e/correr.sh"
  exit 1
fi

if [[ ! -f "$PADRON" ]]; then
  echo "Falta el padron en $PADRON."
  echo "Copia ahi el .xlsx del sistema academico, o define PADRON_XLSX."
  exit 1
fi

echo "→ Build de produccion"
npm run build > /dev/null

echo "→ Base de datos limpia"
npx tsx scripts/reset.ts > /dev/null
npx tsx scripts/seed.ts  > /dev/null
npx tsx scripts/import-alumnos.ts "$PADRON" > /dev/null

echo "→ Levantando servidor en :$PUERTO"
SESSION_SECRET="${SESSION_SECRET:-$(head -c 32 /dev/urandom | base64)}" \
  npx next start -p "$PUERTO" > /tmp/e2e-servidor.log 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null || true' EXIT

listo=0
for _ in $(seq 1 60); do
  if ! kill -0 "$SERVIDOR" 2>/dev/null; then
    echo "El servidor se cayo al arrancar:"
    cat /tmp/e2e-servidor.log
    exit 1
  fi
  if curl -s -o /dev/null "http://127.0.0.1:$PUERTO/login"; then listo=1; break; fi
  sleep 0.5
done

if [[ "$listo" -ne 1 ]]; then
  echo "El servidor no respondio a tiempo:"
  cat /tmp/e2e-servidor.log
  exit 1
fi

echo "→ Corriendo suites"
cd tests/e2e
PADRON_XLSX="$RAIZ/$PADRON" python3 test_auth.py
PADRON_XLSX="$RAIZ/$PADRON" python3 test_fichas.py
PADRON_XLSX="$RAIZ/$PADRON" python3 test_admin.py
PADRON_XLSX="$RAIZ/$PADRON" python3 test_padron.py

echo
echo "Todas las suites pasaron."
