#!/usr/bin/env node
// Corre las 9 validaciones de §2.3 sobre fuentes + curaduría y sale con
// código 1 si alguna falla. Uso: node scripts/habilitacion/validar.mjs
import { cargarTodo } from "./lib/cargar.mjs";
import { construirModelo } from "./lib/modelo.mjs";
import { validarTodo } from "./lib/validaciones.mjs";

export function imprimirResultados(resultados) {
  for (const r of resultados) {
    console.log(`${r.ok ? "OK   " : "FALLA"} ${r.n}. ${r.nombre}`);
    for (const d of r.detalle) console.log(`        ${d}`);
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(fallas === 0 ? "\nValidaciones en verde (9/9)." : `\n${fallas} validación(es) en rojo.`);
  return fallas;
}

const esPrincipal = import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, "/").replace(/^\//, "")}`).href;
if (esPrincipal) {
  const entrada = cargarTodo();
  const modelo = construirModelo(entrada);
  const fallas = imprimirResultados(validarTodo(entrada, modelo));
  process.exit(fallas === 0 ? 0 : 1);
}
