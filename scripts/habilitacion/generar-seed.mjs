#!/usr/bin/env node
// Genera las migraciones de siembra del módulo de Habilitación:
//   salida/0063_habilitacion_seed_norma.sql
//   salida/0064_habilitacion_seed_catalogos.sql
//
// Escribe en scripts/habilitacion/salida/ (NO en supabase/migrations/): la
// fase F2 las mueve a supabase/migrations/ junto con el esquema (0062).
//
// Antes de escribir corre las 9 validaciones de §2.3; si alguna falla no
// escribe nada y sale con código 1. Determinista: dos corridas producen el
// mismo SHA-256 (se imprime al final).
//
// Uso: node scripts/habilitacion/generar-seed.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cargarTodo, RAIZ, sha256 } from "./lib/cargar.mjs";
import { construirModelo } from "./lib/modelo.mjs";
import { validarTodo } from "./lib/validaciones.mjs";
import { generar0063, generar0064 } from "./lib/generar-sql.mjs";
import { imprimirResultados } from "./validar.mjs";

const HASHES_0063 = [
  "criterios.json",
  "mapeo-servicios.json",
  "curaduria/remisiones.json",
  "curaduria/remite-11-1.json",
  "curaduria/no-remision.json",
  "curaduria/correcciones-bloques.json",
  "curaduria/criterios-adicionales.json",
  "curaduria/vigencias.json",
  "curaduria/mapeo-ajustes.json",
];
const HASHES_0064 = [
  "inscripcion.json",
  "reportes.json",
  "curaduria/obligaciones-reglas.json",
  "curaduria/documentos-condiciones.json",
  "curaduria/festivos-co.json",
];

const elegir = (hashes, claves) => Object.fromEntries(claves.map((k) => [k.includes("/") ? k : `fuentes/${k}`, hashes[k]]));

/** Genera el SQL en memoria (sin escribir). Lanza si alguna validación falla. */
export function generarSeed(raiz = RAIZ) {
  const entrada = cargarTodo(raiz);
  const modelo = construirModelo(entrada);
  const resultados = validarTodo(entrada, modelo);
  const archivos = resultados.every((r) => r.ok)
    ? [generar0063(modelo, elegir(entrada.hashes, HASHES_0063)), generar0064(modelo, elegir(entrada.hashes, HASHES_0064))]
    : null;
  return { resultados, archivos, modelo };
}

const esPrincipal = import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, "/").replace(/^\//, "")}`).href;
if (esPrincipal) {
  const { resultados, archivos } = generarSeed();
  const fallas = imprimirResultados(resultados);
  if (fallas > 0 || !archivos) {
    console.error("\nNo se escribió el SQL: corrige la curaduría y vuelve a correr.");
    process.exit(1);
  }
  const dir = join(RAIZ, "salida");
  mkdirSync(dir, { recursive: true });
  console.log("");
  for (const { nombre, sql } of archivos) {
    writeFileSync(join(dir, nombre), sql, "utf8");
    console.log(`${sha256(sql)}  salida/${nombre}  (${(Buffer.byteLength(sql, "utf8") / 1024).toFixed(0)} KB)`);
  }
}
