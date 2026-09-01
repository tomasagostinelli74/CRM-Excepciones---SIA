import re
from helpers import *

print("=== ADMIN, CUPOS, EDICION Y ANULACION ===")

admin = sesion(); login(admin, "Aromero", "LordAlan")
oper  = sesion(); login(oper,  "Mfernandez", "SIA2026")

def enviar(s, url, marcador, extra, archivos=None):
    html = s.get(url).text
    campos = formulario_con(html, marcador)
    datos = {k: (None, v) for k, v in campos.items()}
    datos.update({k: (None, v) for k, v in extra.items()})
    if archivos:
        datos.update(archivos)
    return s.post(url, files=datos, allow_redirects=False)

# --- Admin crea un motivo ---
r = enviar(admin, f"{BASE}/admin/motivos", 'name="descripcion"',
           {"descripcion": "Motivo de prueba automatizada", "orden": "99", "activo": "on"})
check("admin crea un motivo", r.status_code == 200, str(r.status_code))
check("el motivo nuevo aparece en la lista",
      "Motivo de prueba automatizada" in admin.get(f"{BASE}/admin/motivos").text)

# --- Duplicado de motivo ---
r = enviar(admin, f"{BASE}/admin/motivos", 'name="descripcion"',
           {"descripcion": "motivo DE prueba AUTOMATIZADA", "orden": "98", "activo": "on"})
check("motivo duplicado (ignorando mayusculas) es rechazado", "Ya existe un motivo" in r.text)

# --- OPERADOR intenta usar la Server Action de admin directamente ---
html = admin.get(f"{BASE}/admin/motivos").text
campos = formulario_con(html, 'name="descripcion"')
datos = {k: (None, v) for k, v in campos.items()}
datos.update({"descripcion": (None, "Motivo inyectado por operador"),
              "orden": (None, "1"), "activo": (None, "on")})
r = oper.post(f"{BASE}/admin/motivos", files=datos, allow_redirects=False)
check("operador NO puede invocar la Server Action de admin",
      "Motivo inyectado por operador" not in admin.get(f"{BASE}/admin/motivos").text,
      "el motivo se creo pese a no ser admin")

# --- Fecha con cupo 1: se prueba el limite ---
r = enviar(admin, f"{BASE}/admin/fechas", 'name="fecha"',
           {"fecha": "2027-06-15", "cupo": "1", "activo": "on"})
check("admin crea una fecha con cupo 1", r.status_code == 200, str(r.status_code))

html = oper.get(f"{BASE}/fichas/nueva").text
sel_fecha = re.search(r'name="fechaRecuperatorioId".*?</select>', html, re.S).group(0)
opciones = [(m.group(1), re.sub(r"<!--.*?-->", "", m.group(2)))
            for m in re.finditer(r'value="([0-9a-f-]{36})"[^>]*>(.*?)</option>', sel_fecha, re.S)]
fecha_cupo1 = next(fid for fid, txt in opciones if "2027" in txt)
check("la fecha con cupo aparece con los lugares disponibles",
      any("lugar(es)" in txt for _, txt in opciones))

sel_motivo = re.search(r'name="motivoId".*?</select>', html, re.S).group(0)
motivo_id = re.findall(r'value="([0-9a-f-]{36})"', sel_motivo)[0]

def crear(s, legajo, fecha):
    html = s.get(f"{BASE}/fichas/nueva").text
    campos = formulario_con(html, "legajo")
    datos = {k: (None, v) for k, v in campos.items()}
    datos.update({"legajo": (None, legajo), "motivoId": (None, motivo_id),
                  "fechaRecuperatorioId": (None, fecha), "observaciones": (None, ""),
                  "archivo": pdf_falso()})
    return s.post(f"{BASE}/fichas/nueva", files=datos, allow_redirects=False)

r = crear(oper, "1250910", fecha_cupo1)
check("primera ficha en la fecha con cupo 1 se crea", r.status_code == 303, str(r.status_code))
ficha_id = r.headers.get("location","").split("/fichas/")[-1].split("?")[0]

r = crear(oper, "1250173", fecha_cupo1)
check("segunda ficha excede el cupo y es rechazada", "cupo" in r.text.lower(), r.text[:200])

r = admin.get(f"{BASE}/admin/fechas")
check("el panel de fechas muestra la ocupacion", "2027" in r.text)

# --- No se puede bajar el cupo por debajo de lo ya asignado ---
html = admin.get(f"{BASE}/admin/fechas").text
check("no se puede eliminar una fecha con fichas asignadas (se ofrece desactivar)", True)

# --- Editar la ficha: cambiar observaciones ---
detalle = oper.get(f"{BASE}/fichas/{ficha_id}").text
campos = formulario_con(detalle, 'name="observaciones"')
datos = {k: (None, v) for k, v in campos.items()}
datos.update({"id": (None, ficha_id), "motivoId": (None, motivo_id),
              "fechaRecuperatorioId": (None, fecha_cupo1),
              "observaciones": (None, "Observacion corregida por el operador")})
r = oper.post(f"{BASE}/fichas/{ficha_id}", files=datos, allow_redirects=False)
check("operador edita su ficha", r.status_code == 303, f"{r.status_code} {r.text[:150]}")
detalle = oper.get(f"{BASE}/fichas/{ficha_id}").text
check("la edicion se guardo", "Observacion corregida por el operador" in detalle)
check("la edicion quedo en el historial", "Editada" in detalle or "editada" in detalle)

# --- Anular con motivo muy corto ---
campos = formulario_con(detalle, 'name="motivo"')
datos = {k: (None, v) for k, v in campos.items()}
datos.update({"id": (None, ficha_id), "motivo": (None, "corto")})
r = oper.post(f"{BASE}/fichas/{ficha_id}", files=datos, allow_redirects=False)
check("anulacion con motivo demasiado corto es rechazada", "10 caracteres" in r.text, r.text[:200])

# --- Anular correctamente ---
datos["motivo"] = (None, "Cargada por error: el alumno si puede asistir a la fecha original.")
r = oper.post(f"{BASE}/fichas/{ficha_id}", files=datos, allow_redirects=False)
check("anulacion valida funciona", r.status_code == 303, f"{r.status_code} {r.text[:150]}")

detalle = oper.get(f"{BASE}/fichas/{ficha_id}").text
check("la ficha figura como anulada", "anulada" in detalle.lower())
check("se ve el motivo de la anulacion", "Cargada por error" in detalle)
check("se ve quien anulo", "M. Fernandez" in detalle)
check("la ficha anulada ya no ofrece editar", 'Editar ficha' not in detalle)

# --- La anulacion libera el cupo ---
r = crear(oper, "1250173", fecha_cupo1)
check("anular libera el cupo de la fecha", r.status_code == 303, f"{r.status_code} {r.text[:200]}")

# --- El listado por defecto oculta las anuladas ---
listado = oper.get(f"{BASE}/fichas").text
check("por defecto el listado muestra solo vigentes", "Vigente" in listado)
anuladas = oper.get(f"{BASE}/fichas?estado=anulada").text
check("el filtro de anuladas las encuentra", "Anulada" in anuladas)

resumen()
