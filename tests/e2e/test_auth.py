from helpers import *

print("=== AUTENTICACION Y AUTORIZACION ===")

# --- Sin sesion ---
anon = sesion()
r = anon.get(f"{BASE}/fichas", allow_redirects=False)
check("sin sesion, /fichas redirige al login", r.status_code in (302,307) and "/login" in r.headers.get("location",""), f"{r.status_code} {r.headers.get('location')}")

r = anon.get(f"{BASE}/admin", allow_redirects=False)
check("sin sesion, /admin redirige al login", r.status_code in (302,307), str(r.status_code))

r = anon.get(f"{BASE}/api/fichas/exportar")
check("sin sesion, exportar CSV da 401", r.status_code == 401, str(r.status_code))

# --- Credenciales incorrectas ---
s = sesion()
r = login(s, "Aromero", "contrasena-incorrecta")
check("password incorrecta es rechazada", "incorrectos" in r.text, "no aparece el mensaje de error")
check("password incorrecta no crea sesion", "crm_sesion" not in s.cookies, "quedo cookie de sesion")

s2 = sesion()
r = login(s2, "usuario-que-no-existe", "loquesea")
check("usuario inexistente da el MISMO mensaje que password mala",
      "incorrectos" in r.text, "el mensaje difiere y permite enumerar usuarios")

# --- Login admin ---
admin = sesion()
r = login(admin, "Aromero", "LordAlan")
check("login admin funciona", "crm_sesion" in admin.cookies, "no se creo la cookie")
# Atributos de seguridad, leidos del Set-Cookie crudo.
probe = sesion()
html = probe.get(f"{BASE}/login").text
campos = campos_ocultos(html); campos.update({"usuario": "Aromero", "password": "LordAlan"})
raw = probe.post(f"{BASE}/login", files={k: (None, v) for k, v in campos.items()},
                 allow_redirects=False).headers.get("set-cookie", "")
check("cookie de sesion es HttpOnly", "HttpOnly" in raw, raw)
check("cookie de sesion es Secure en produccion", "Secure" in raw, raw)
check("cookie de sesion es SameSite=lax", "SameSite=lax" in raw, raw)
check("login exitoso redirige a /fichas", "crm_sesion" in raw)

r = admin.get(f"{BASE}/admin")
check("admin entra al panel de administracion", r.status_code == 200 and "Tablero" in r.text, str(r.status_code))
r = admin.get(f"{BASE}/admin/usuarios")
check("admin ve la gestion de usuarios", "Aromero" in r.text and "Mfernandez" in r.text)

# --- Login operador ---
oper = sesion()
login(oper, "Mfernandez", "SIA2026")
check("login operador funciona", "crm_sesion" in oper.cookies)

r = oper.get(f"{BASE}/fichas")
check("operador entra al listado de fichas", r.status_code == 200 and "Fichas de excepcion" in r.text)

r = oper.get(f"{BASE}/admin", allow_redirects=False)
check("operador NO puede entrar a /admin (redirige)",
      r.status_code in (302,307) and "solo-admin" in r.headers.get("location",""),
      f"{r.status_code} {r.headers.get('location')}")

for ruta in ["/admin/motivos", "/admin/fechas", "/admin/alumnos", "/admin/usuarios"]:
    r = oper.get(f"{BASE}{ruta}", allow_redirects=False)
    check(f"operador bloqueado en {ruta}", r.status_code in (302,307), str(r.status_code))

r = oper.get(f"{BASE}/fichas")
check("el menu del operador NO muestra links de admin",
      "/admin/usuarios" not in r.text and "/admin/motivos" not in r.text)

# --- Cookie manipulada ---
falsa = sesion()
falsa.cookies.set("crm_sesion", "eyJ1c3VhcmlvSWQiOiJoYWNrIn0.firmafalsa", domain="127.0.0.1")
desasegurar(falsa)
r = falsa.get(f"{BASE}/fichas", allow_redirects=False)
check("cookie con firma invalida es rechazada", r.status_code in (302,307), str(r.status_code))

resumen()
