// UUID v5 (RFC 4122, SHA-1) sin dependencias.
//
// Todos los ids del catálogo de habilitación son deterministas: el mismo
// nombre produce el mismo uuid en local, staging y producción, y regenerar
// el seed nunca cambia un id (las evaluaciones e instantáneas no quedan
// apuntando a un id huérfano).
//
// El namespace del proyecto es el MISMO que usa la migración 0061 (F1) para
// las prácticas nuevas de `practicas_medicas`:
//   namespace = uuidv5(NAMESPACE_URL, 'https://ewah.tech/habilitacion')
//   id        = uuidv5(namespace, 'practicas_medicas:' || nombre)
import { createHash } from "node:crypto";

export const NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

function uuidABytes(uuid) {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`uuid inválido: ${uuid}`);
  return Buffer.from(hex, "hex");
}

export function uuidv5(nombre, namespace) {
  const hash = createHash("sha1")
    .update(Buffer.concat([uuidABytes(namespace), Buffer.from(nombre, "utf8")]))
    .digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // versión 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const NAMESPACE_PROYECTO = uuidv5("https://ewah.tech/habilitacion", NAMESPACE_URL);

/** id determinista para una entidad del catálogo: `<tipo>:<parte1>:<parte2>…` */
export function idDe(tipo, ...partes) {
  return uuidv5([tipo, ...partes.map((p) => (p == null ? "" : String(p)))].join(":"), NAMESPACE_PROYECTO);
}

/** Mismo esquema de 0061 para prácticas del catálogo creadas por la división D2. */
export function idPracticaMedica(nombre) {
  return uuidv5(`practicas_medicas:${nombre}`, NAMESPACE_PROYECTO);
}
