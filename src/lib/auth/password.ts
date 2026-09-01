import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hash de contrasenas con scrypt (Node nativo, sin dependencias externas).
 *
 * scrypt es una KDF con costo de memoria: a diferencia de un SHA-256 pelado,
 * hace inviable el ataque por diccionario con GPU. Se usa el algoritmo del
 * propio Node para no arrastrar un binario nativo mas (bcrypt/argon2).
 *
 * Formato almacenado: `scrypt$N$r$p$<salt-hex>$<hash-hex>`. Guardar los
 * parametros junto al hash permite subirlos mas adelante sin invalidar las
 * contrasenas ya existentes.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16384; // costo CPU/memoria (2^14)
const R = 8;
const P = 1;
const LARGO_CLAVE = 64;
const LARGO_SAL = 16;
// scrypt necesita ~128 * N * r bytes; el default de Node (32 MB) queda justo.
const MAX_MEM = 64 * 1024 * 1024;

export async function hashearPassword(password: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const derivada = await scrypt(password.normalize("NFKC"), sal, LARGO_CLAVE, { N, r: R, p: P, maxmem: MAX_MEM });
  return `scrypt$${N}$${R}$${P}$${sal.toString("hex")}$${derivada.toString("hex")}`;
}

export async function verificarPassword(password: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const [, nTexto, rTexto, pTexto, salHex, hashHex] = partes as [string, string, string, string, string, string];
  const n = Number(nTexto);
  const r = Number(rTexto);
  const p = Number(pTexto);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let esperado: Buffer;
  try {
    esperado = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }

  const derivada = await scrypt(password.normalize("NFKC"), Buffer.from(salHex, "hex"), esperado.length, {
    N: n,
    r,
    p,
    maxmem: MAX_MEM,
  });

  // Comparacion en tiempo constante: un `===` filtra informacion por el
  // tiempo que tarda en encontrar la primera diferencia.
  return derivada.length === esperado.length && timingSafeEqual(derivada, esperado);
}
