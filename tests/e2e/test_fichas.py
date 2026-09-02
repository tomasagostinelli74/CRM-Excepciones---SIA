import re
from helpers import *

print("=== CIRCUITO DE FICHAS ===")

oper = sesion(); login(oper, "Mfernandez", "SIA2026")
admin = sesion(); login(admin, "Aromero", "LordAlan")

# --- Ids de motivo y fecha desde el formulario real ---
html = oper.get(f"{BASE}/fichas/nueva").text
motivos = re.findall(r'<option value="([0-9a-f-]{36})">([^<]*)</option>', html)
check("el formulario trae motivos y fechas del servidor", len(motivos) >= 6, f"{len(motivos)} opciones")

sel_motivo = re.search(r'name="motivoId".*?</select>', html, re.S).group(0)
sel_fecha  = re.search(r'name="fechaRecuperatorioId".*?</select>', html, re.S).group(0)
motivo_id = re.findall(r'value="([0-9a-f-]{36})"', sel_motivo)[0]
fechas_ids = re.findall(r'value="([0-9a-f-]{36})"', sel_fecha)
fecha_id = fechas_ids[0]
check("hay al menos una fecha de recuperatorio ofrecida", len(fechas_ids) >= 1)

def crear_ficha(s, legajo, motivo=None, fecha=None, pdf=None, obs="Prueba automatizada"):
    html = s.get(f"{BASE}/fichas/nueva").text
    campos = formulario_con(html, "legajo")
    datos = {k: (None, v) for k, v in campos.items()}
    datos.update({
        "legajo": (None, legajo),
        "motivoId": (None, motivo or motivo_id),
        "fechaRecuperatorioId": (None, fecha or fecha_id),
        "observaciones": (None, obs),
        "archivo": pdf or pdf_falso(),
    })
    return s.post(f"{BASE}/fichas/nueva", files=datos, allow_redirects=False)

# --- Legajo inexistente ---
r = crear_ficha(oper, "0000000")
check("legajo inexistente es rechazado por el SERVIDOR",
      "no existe en el padrón" in r.text, f"status {r.status_code}")

# --- Legajo no numerico ---
r = crear_ficha(oper, "abc123")
check("legajo no numerico es rechazado", "solo números" in r.text.lower() or "no existe" in r.text)

# --- PDF invalido (no es PDF de verdad) ---
r = crear_ficha(oper, "1251054", pdf=("falso.pdf", b"esto no es un pdf en absoluto", "application/pdf"))
check("archivo que dice .pdf pero no lo es, rechazado por firma binaria",
      "no es un PDF válido" in r.text, r.text[:200] if "no es un PDF" not in r.text else "")

# --- Extension incorrecta ---
r = crear_ficha(oper, "1251054", pdf=("virus.exe", b"%PDF-1.4 igual", "application/pdf"))
check("extension distinta de .pdf rechazada", "debe ser un archivo PDF" in r.text)

# --- Ficha valida ---
r = crear_ficha(oper, "1251054", obs="Certificado presentado en mesa de entrada.")
check("ficha valida se crea y redirige al detalle",
      r.status_code == 303 and "/fichas/" in r.headers.get("location", ""),
      f"{r.status_code} {r.headers.get('location')}")
ficha_url = r.headers.get("location", "")
ficha_id = ficha_url.split("/fichas/")[-1].split("?")[0]

detalle = oper.get(f"{BASE}{ficha_url}").text
check("el detalle muestra el alumno resuelto desde el padron",
      "Jean Pierre" in detalle and "1251054" in detalle)
check("el detalle registra quien cargo la ficha", "Mfernandez" in detalle)
check("el historial muestra el evento de creacion", "Creada" in detalle or "creada" in detalle)

# --- Duplicado: mismo alumno, misma fecha ---
r = crear_ficha(oper, "1251054")
check("mismo alumno + misma fecha = duplicado rechazado",
      "ya tiene la ficha" in r.text, r.text[:200] if "ya tiene" not in r.text else "")

# --- Otro alumno, misma fecha: debe funcionar ---
r = crear_ficha(oper, "1247656")
check("otro alumno en la misma fecha si se puede crear", r.status_code == 303, str(r.status_code))

# --- Descarga del PDF ---
r = oper.get(f"{BASE}/api/fichas/{ficha_id}/archivo")
check("el PDF se descarga con sesion", r.status_code == 200 and r.content.startswith(b"%PDF"), str(r.status_code))
check("el PDF se sirve como application/pdf", "application/pdf" in r.headers.get("content-type",""))
check("el PDF no se cachea", "no-store" in r.headers.get("cache-control",""))

anon = sesion()
r = anon.get(f"{BASE}/api/fichas/{ficha_id}/archivo")
check("el PDF NO se descarga sin sesion", r.status_code == 401, str(r.status_code))

# --- Listado y filtros ---
r = oper.get(f"{BASE}/fichas")
check("el listado muestra las fichas creadas", "1251054" in r.text and "1247656" in r.text)

r = oper.get(f"{BASE}/fichas?legajo=1251054")
check("filtro por legajo funciona", "1251054" in r.text and "1247656" not in r.text)

r = oper.get(f"{BASE}/fichas?texto=fernandez")
check("filtro por texto de alumno funciona", "1247656" in r.text)

r = oper.get(f"{BASE}/fichas?motivoId=no-es-un-uuid")
check("filtro con uuid invalido no rompe la pagina", r.status_code == 200, str(r.status_code))

# --- Export CSV ---
r = oper.get(f"{BASE}/api/fichas/exportar")
check("export CSV responde 200", r.status_code == 200, str(r.status_code))
check("CSV con BOM UTF-8", r.content.startswith(b"\xef\xbb\xbf"), repr(r.content[:6]))
check("CSV separado por ;", b";" in r.content.split(b"\r\n")[0])
check("CSV incluye la ficha creada", b"1251054" in r.content)
check("CSV se descarga como adjunto", "attachment" in r.headers.get("content-disposition",""))

r = oper.get(f"{BASE}/api/fichas/exportar?legajo=1251054")
lineas = [l for l in r.content.decode("utf-8-sig").strip().split("\r\n") if l]
check("el CSV respeta los filtros del listado", len(lineas) == 2, f"{len(lineas)} lineas")



# --- Funcionamiento sin JavaScript ---
# El circuito operativo no debe depender del cliente: los tests de arriba ya
# postean como lo haria un navegador sin JS, pero ademas el boton de envio
# tiene que venir habilitado en el HTML del servidor. Si se renderizara
# deshabilitado, un usuario sin JS quedaria en un callejon sin salida.
html = oper.get(f"{BASE}/fichas/nueva").text
boton = re.search(r'<button[^>]*type="submit"[^>]*>\s*Generar ficha', html)
check("el boton 'Generar ficha' no viene deshabilitado del servidor",
      boton is not None and "disabled" not in boton.group(0),
      boton.group(0) if boton else "no se encontro el boton")

detalle = oper.get(f"{BASE}/fichas/{ficha_id}").text
check("el formulario de edicion viene en el HTML (no detras de JS)",
      'name="observaciones"' in detalle)
check("el formulario de anulacion viene en el HTML (no detras de JS)",
      'name="motivo"' in detalle)

resumen()
