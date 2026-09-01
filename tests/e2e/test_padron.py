import os
import re
from helpers import *

print("=== IMPORT DEL PADRON REAL Y USUARIOS ===")

XLSX = os.environ.get("PADRON_XLSX", "padron/Alumnos_a_ingresar.xlsx")
admin = sesion(); login(admin, "Aromero", "LordAlan")
oper  = sesion(); login(oper,  "Mfernandez", "SIA2026")

def subir(s, extra_archivo):
    html = s.get(f"{BASE}/admin/alumnos").text
    campos = formulario_con(html, 'name="archivo"')
    datos = {k: (None, v) for k, v in campos.items()}
    datos["archivo"] = extra_archivo
    return s.post(f"{BASE}/admin/alumnos", files=datos, allow_redirects=False)

# --- Archivo que no es xlsx ---
r = subir(admin, ("padron.xlsx", b"esto no es un excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
check("archivo corrupto es rechazado con mensaje claro",
      "no se pudo leer" in r.text.lower() or "valido" in r.text.lower(), r.text[:200])

r = subir(admin, ("padron.csv", b"legajo,alumno\n1,x", "text/csv"))
check("extension distinta de .xlsx es rechazada", "Excel (.xlsx)" in r.text or "xlsx" in r.text.lower())

# --- Excel valido con columnas equivocadas ---
import io as _io
try:
    import openpyxl
    buf = _io.BytesIO()
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["columna_rara", "otra"]); ws.append([1, "x"])
    wb.save(buf)
    r = subir(admin, ("mal.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
    check("Excel sin las columnas legajo/alumno es rechazado", "legajo" in r.text and "alumno" in r.text)
except ImportError:
    print("  (openpyxl no disponible, se omite)")

# --- Excel con filas invalidas mezcladas ---
import openpyxl
buf = _io.BytesIO()
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["legajo", "alumno"])
ws.append([9911111, "Prueba Uno, Alumno"])          # valida
ws.append(["ABC123", "Prueba Dos, Alumno"])         # legajo no numerico
ws.append([9911113, ""])                            # sin nombre
ws.append(["", "Sin Legajo, Alumno"])               # sin legajo
ws.append([9911115, "  Espacios  ,  De Mas  "])     # sucia pero valida
ws.append([9911111, "Prueba Uno Repetido, Alumno"]) # duplicada en archivo
wb.save(buf)
r = subir(admin, ("mixto.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
check("la vista previa reporta filas rechazadas", "Rechazadas" in r.text or "rechazad" in r.text.lower())
check("la vista previa detecta el legajo no numerico", "no son numeros" in r.text or "numeros" in r.text)
check("la vista previa detecta el legajo repetido", "9911111" in r.text)
check("la vista previa NO escribe todavia en la base",
      "todavia no se escribio" in r.text.lower() or "9911115" not in admin.get(f"{BASE}/admin/alumnos?q=9911115").text)

# --- Import real del padron completo ---
antes = admin.get(f"{BASE}/admin/alumnos").text
n_antes = int(re.search(r"([\d.]+) alumno\(s\) habilitados", antes).group(1).replace(".", ""))
check("el padron ya tiene los alumnos del seed + import previo", n_antes > 2000, str(n_antes))

with open(XLSX, "rb") as f:
    contenido = f.read()

# Paso 1: vista previa
r = subir(admin, ("Alumnos_a_ingresar.xlsx", contenido, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
check("vista previa del padron real: 2094 validos", "2.094" in r.text or "2094" in r.text, "no aparece el conteo")
check("vista previa del padron real: 0 rechazadas",
      re.search(r"Rechazadas\s*</p>\s*<p[^>]*>0<", r.text) is not None or ">0<" in r.text)
check("la vista previa avisa que no borra a los ausentes",
      "no borra" in r.text.lower(), "falta la aclaracion sobre el upsert")

# Paso 2: confirmar (el formulario cambia de accion tras la vista previa)
campos = formulario_con(r.text, 'name="archivo"')
datos = {k: (None, v) for k, v in campos.items()}
datos["archivo"] = ("Alumnos_a_ingresar.xlsx", contenido,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
r2 = admin.post(f"{BASE}/admin/alumnos", files=datos, allow_redirects=False)
check("el import confirmado responde OK", r2.status_code == 200, str(r2.status_code))
check("el import informa el resultado", "actualizado" in r2.text.lower() or "Padron actualizado" in r2.text)

# --- Verificacion contra la base ---
r = admin.get(f"{BASE}/admin/alumnos?q=1251054")
check("un legajo real del Excel esta en el padron", "1251054" in r.text)
r = admin.get(f"{BASE}/admin/alumnos?q=D%C2%B4Amico")
check("busqueda por apellido con acento agudo funciona", "1250499" in r.text or "Amico" in r.text)
r = admin.get(f"{BASE}/admin/alumnos?q=perez")
check("busqueda sin acentos encuentra Perez/Pérez", "Perez" in r.text or "Pérez" in r.text)

# --- Operador no puede importar ---
html = admin.get(f"{BASE}/admin/alumnos").text
campos = formulario_con(html, 'name="archivo"')
datos = {k: (None, v) for k, v in campos.items()}
datos["archivo"] = ("intruso.xlsx", contenido, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
r = oper.post(f"{BASE}/admin/alumnos", files=datos, allow_redirects=False)
check("operador NO puede importar el padron", r.status_code in (302,307) or "permisos" in r.text.lower(),
      f"status {r.status_code}")

# --- Usuarios ---
html = admin.get(f"{BASE}/admin/usuarios").text
campos = formulario_con(html, 'name="usuario"')
datos = {k: (None, v) for k, v in campos.items()}
datos.update({"usuario": (None, "Ptest"), "nombre": (None, "P. Test"),
              "rol": (None, "operador"), "password": (None, "corta"), "activo": (None, "on")})
r = admin.post(f"{BASE}/admin/usuarios", files=datos, allow_redirects=False)
check("contrasena corta es rechazada", "8 caracteres" in r.text)

datos["password"] = (None, "unaClaveSegura123")
r = admin.post(f"{BASE}/admin/usuarios", files=datos, allow_redirects=False)
check("admin crea un usuario operador", "Ptest" in admin.get(f"{BASE}/admin/usuarios").text)

nuevo = sesion()
login(nuevo, "Ptest", "unaClaveSegura123")
check("el usuario nuevo puede iniciar sesion", nuevo.get(f"{BASE}/fichas").status_code == 200)
check("el usuario nuevo es operador (sin acceso a admin)",
      nuevo.get(f"{BASE}/admin", allow_redirects=False).status_code in (302,307))

# --- La pantalla refleja ambos roles ---
html = admin.get(f"{BASE}/admin/usuarios").text
check("la pantalla de usuarios lista ambos roles", "Administrador" in html and "Operador" in html)

resumen()
