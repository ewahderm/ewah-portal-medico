// Carga de fuentes congeladas (con verificación SHA-256) y de la curaduría.
//
// El hash se calcula sobre el contenido con saltos de línea normalizados a
// LF: en Windows con core.autocrlf=true git puede materializar los JSON con
// CRLF y el contenido es el mismo dato.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

export const FUENTES = ["criterios.json", "inscripcion.json", "mapeo-servicios.json", "reportes.json"];

export const CURADURIA = [
  "remisiones.json",
  "remite-11-1.json",
  "no-remision.json",
  "correcciones-bloques.json",
  "criterios-adicionales.json",
  "vigencias.json",
  "mapeo-ajustes.json",
  "obligaciones-reglas.json",
  "documentos-condiciones.json",
  "festivos-co.json",
];

export const leerTexto = (ruta) => readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");

export const sha256 = (texto) => createHash("sha256").update(texto, "utf8").digest("hex");

export function leerChecksums(raiz = RAIZ) {
  const mapa = new Map();
  for (const linea of leerTexto(join(raiz, "fuentes", "CHECKSUMS")).split("\n")) {
    const m = linea.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/);
    if (m) mapa.set(m[2].trim(), m[1]);
  }
  return mapa;
}

/** Lee fuentes y curaduría. Lanza si un checksum no coincide (fuente alterada). */
export function cargarTodo(raiz = RAIZ) {
  const checksums = leerChecksums(raiz);
  /** @type {Record<string, any>} */
  const fuentes = {};
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const nombre of FUENTES) {
    const texto = leerTexto(join(raiz, "fuentes", nombre));
    const hash = sha256(texto);
    const esperado = checksums.get(nombre);
    if (!esperado) throw new Error(`fuentes/CHECKSUMS no tiene ${nombre}`);
    if (esperado !== hash) {
      throw new Error(`Checksum de fuentes/${nombre} no coincide (esperado ${esperado}, actual ${hash}). Las fuentes están congeladas: si cambian, es una versión nueva de la norma.`);
    }
    fuentes[nombre.replace(/\.json$/, "")] = JSON.parse(texto);
    hashes[nombre] = hash;
  }
  /** @type {Record<string, any>} */
  const curaduria = {};
  for (const nombre of CURADURIA) {
    const texto = leerTexto(join(raiz, "curaduria", nombre));
    curaduria[nombre.replace(/\.json$/, "")] = JSON.parse(texto);
    hashes[`curaduria/${nombre}`] = sha256(texto);
  }
  return { fuentes, curaduria, hashes };
}
