"""Helpers para ejercitar la app como lo haria un navegador sin JS.

Next renderiza las Server Actions con campos ocultos ($ACTION_*) para que el
formulario funcione sin JavaScript. Reenviarlos es exactamente el camino de
"progressive enhancement", asi que probar por aca ejercita el servidor real.
"""
import os
import re
import sys

import requests

# El puerto lo fija correr.sh (variable PUERTO), para poder correr la suite
# aunque 3100 este ocupado. Tenerlo hardcodeado aca rompia esa salida.
PUERTO = os.environ.get("PUERTO", "3100")
BASE = os.environ.get("E2E_BASE", f"http://127.0.0.1:{PUERTO}")

def campos_ocultos(html, indice=0):
    """Devuelve los inputs ocultos del formulario `indice` de la pagina."""
    formularios = re.findall(r"<form\b.*?</form>", html, re.S)
    if not formularios:
        raise AssertionError("no se encontro ningun <form> en la pagina")
    campos = {}
    for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>', formularios[indice]):
        tag = m.group(0)
        nombre = re.search(r'name="([^"]*)"', tag)
        valor = re.search(r'value="([^"]*)"', tag)
        if nombre:
            campos[nombre.group(1)] = html_unescape(valor.group(1) if valor else "")
    return campos

def html_unescape(s):
    return (s.replace("&quot;", '"').replace("&amp;", "&")
             .replace("&lt;", "<").replace("&gt;", ">").replace("&#x27;", "'"))

def formulario_con(html, marcador, indice=0):
    """Campos ocultos del primer formulario que contiene `marcador`."""
    formularios = re.findall(r"<form\b.*?</form>", html, re.S)
    coincidentes = [f for f in formularios if marcador in f]
    if not coincidentes:
        raise AssertionError(f"ningun formulario contiene {marcador!r}")
    campos = {}
    for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>', coincidentes[indice]):
        tag = m.group(0)
        nombre = re.search(r'name="([^"]*)"', tag)
        valor = re.search(r'value="([^"]*)"', tag)
        if nombre:
            campos[nombre.group(1)] = html_unescape(valor.group(1) if valor else "")
    return campos

RESULTADOS = []

def check(descripcion, condicion, detalle=""):
    RESULTADOS.append((descripcion, bool(condicion), detalle))
    marca = "PASA" if condicion else "FALLA"
    print(f"  [{marca}] {descripcion}" + (f"  -> {detalle}" if detalle and not condicion else ""))

def resumen():
    fallas = [r for r in RESULTADOS if not r[1]]
    print(f"\n{'='*62}")
    print(f"{len(RESULTADOS)-len(fallas)}/{len(RESULTADOS)} verificaciones pasaron")
    if fallas:
        print("\nFALLAS:")
        for d, _, det in fallas:
            print(f"  - {d}: {det}")
        sys.exit(1)
    print("Todo verde.")

def sesion():
    s = requests.Session()
    s.headers["User-Agent"] = "e2e-test"
    return s

def desasegurar(s):
    """Quita el flag Secure de las cookies del jar.

    En produccion la app marca la cookie de sesion como Secure (correcto), asi
    que un cliente HTTP no la reenvia sobre http://. El test corre contra
    127.0.0.1 sin TLS, de modo que simulamos ser un navegador sobre HTTPS.
    No cambia nada del servidor: solo del cliente de prueba.
    """
    for c in s.cookies:
        c.secure = False

def login(s, usuario, password):
    html = s.get(f"{BASE}/login").text
    campos = campos_ocultos(html)
    campos.update({"usuario": usuario, "password": password})
    r = s.post(f"{BASE}/login", files={k: (None, v) for k, v in campos.items()},
               allow_redirects=False)
    desasegurar(s)
    if r.status_code in (302, 303, 307):
        r = s.get(BASE + r.headers["location"])
    return r

def pdf_falso(nombre="certificado.pdf"):
    contenido = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                 b"trailer<</Root 1 0 R>>\n%%EOF\n")
    return (nombre, contenido, "application/pdf")
