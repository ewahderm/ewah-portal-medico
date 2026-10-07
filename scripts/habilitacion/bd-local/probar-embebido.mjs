// Ejecuta las migraciones del repo y las pruebas SQL de esta carpeta contra un
// PostgreSQL REAL y portátil (paquete npm `embedded-postgres`), sin psql ni
// Docker. Alternativa en Windows a probar.sh. Mismas reglas que probar.sh
// (stubs de Supabase, ids de practicas_medicas alineados antes de 0061,
// perfil legado antes de 0080) y una emulación mínima de psql (\set, :VAR,
// :'VAR', \gset).
//
// Preparación (una vez), en una carpeta con RUTA CORTA (Windows limita las
// rutas a 260 caracteres y initdb falla si es larga; evita también OneDrive):
//   mkdir C:\Users\<tu-usuario>\pgt && cd C:\Users\<tu-usuario>\pgt
//   npm init -y && npm install embedded-postgres pg
//   copia este archivo ahí como probar.mjs
// Uso:
//   node probar.mjs "<ruta-del-repo>" [fases,separadas,por,comas]
import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { createRequire } from "node:module";
import EmbeddedPostgres from "embedded-postgres";

const require = createRequire(import.meta.url);
const pg = require("pg");
// Como psql: fechas y marcas de tiempo como texto, sin pasar por Date de JS.
for (const oid of [1082, 1083, 1114, 1184, 1186]) pg.types.setTypeParser(oid, (v) => v);

const RAIZ = process.argv[2];
const FILTRO = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!RAIZ) throw new Error("falta la raíz del repo");
const BD_LOCAL = join(RAIZ, "scripts/habilitacion/bd-local");
const MIGRACIONES = join(RAIZ, "supabase/migrations");
const PUERTO = 54399;
const DIR_DATOS = join(import.meta.dirname, "pgdata");

// ---------------- emulación mínima de psql ----------------
// Divide un script en sentencias respetando comentarios, comillas y $$...$$,
// y resuelve \set, :VAR, :'VAR' y \gset.
function* sentencias(texto, vars) {
  let i = 0;
  let actual = "";
  const n = texto.length;
  const sustituir = (s) =>
    s
      .replace(/:'([A-Za-z_][A-Za-z0-9_]*)'/g, (m, v) => (v in vars ? `'${String(vars[v]).replace(/'/g, "''")}'` : m))
      .replace(/(?<![:\w]):([A-Za-z_][A-Za-z0-9_]*)/g, (m, v) => (v in vars ? vars[v] : m));
  let tramo = ""; // texto "normal" pendiente de sustituir
  const vaciarTramo = () => {
    actual += sustituir(tramo);
    tramo = "";
  };
  while (i < n) {
    const c = texto[i];
    const resto2 = texto.slice(i, i + 2);
    if (resto2 === "--") {
      const fin = texto.indexOf("\n", i);
      const e = fin < 0 ? n : fin;
      tramo += texto.slice(i, e);
      i = e;
    } else if (resto2 === "/*") {
      const fin = texto.indexOf("*/", i + 2);
      const e = fin < 0 ? n : fin + 2;
      tramo += texto.slice(i, e);
      i = e;
    } else if (c === "'" && tramo.endsWith(":") && !tramo.endsWith("::") && /^'[A-Za-z_][A-Za-z0-9_]*'/.test(texto.slice(i, i + 80)) && texto.slice(i + 1, texto.indexOf("'", i + 1)) in vars) {
      // :'variable' de psql → literal entre comillas con el valor
      const j = texto.indexOf("'", i + 1);
      const valor = String(vars[texto.slice(i + 1, j)]).replace(/'/g, "''");
      tramo = tramo.slice(0, -1) + `'${valor}'`;
      i = j + 1;
    } else if (c === "'") {
      vaciarTramo();
      let j = i + 1;
      while (j < n) {
        if (texto[j] === "'" && texto[j + 1] === "'") j += 2;
        else if (texto[j] === "'") break;
        else j++;
      }
      actual += texto.slice(i, j + 1);
      i = j + 1;
    } else if (c === '"') {
      vaciarTramo();
      const j = texto.indexOf('"', i + 1);
      actual += texto.slice(i, j + 1);
      i = j + 1;
    } else if (c === "$") {
      const m = /^\$([A-Za-z_]*)\$/.exec(texto.slice(i, i + 40));
      if (m) {
        vaciarTramo();
        const cierre = m[0];
        const j = texto.indexOf(cierre, i + cierre.length);
        if (j < 0) throw new Error("dollar-quote sin cerrar cerca de: " + texto.slice(i, i + 60));
        actual += texto.slice(i, j + cierre.length);
        i = j + cierre.length;
      } else {
        tramo += c;
        i++;
      }
    } else if (c === "\\" && (i === 0 || texto[i - 1] === "\n" || texto.startsWith("\\gset", i))) {
      // meta-comando hasta fin de línea
      const fin = texto.indexOf("\n", i);
      const e = fin < 0 ? n : fin;
      const cmd = texto.slice(i, e).trim();
      i = e;
      if (cmd.startsWith("\\gset")) {
        vaciarTramo();
        const sql = actual.trim();
        actual = "";
        if (sql) yield { sql, gset: true };
      } else if (cmd.startsWith("\\set ")) {
        const m = /^\\set\s+(\S+)\s*(.*)$/.exec(cmd);
        if (m) {
          let v = m[2].trim();
          if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
          vars[m[1]] = v;
        }
      }
      // otros (\echo, \timing...) se ignoran
    } else if (c === ";") {
      vaciarTramo();
      const sql = actual.trim();
      actual = "";
      if (sql) yield { sql, gset: false };
      i++;
    } else {
      tramo += c;
      i++;
    }
  }
  vaciarTramo();
  const resto = actual.trim();
  if (resto) yield { sql: resto, gset: false };
}

async function correr(archivoOTexto, nombre, { esTexto = false, silencioso = false } = {}) {
  const texto = esTexto ? archivoOTexto : readFileSync(archivoOTexto, "utf8").replace(/\r\n/g, "\n");
  const cliente = new pg.Client({ host: "127.0.0.1", port: PUERTO, user: "postgres", password: "postgres", database: "hab_prueba" });
  await cliente.connect();
  const avisos = [];
  cliente.on("notice", (m) => avisos.push(m.message));
  const vars = {};
  let numero = 0;
  try {
    for (const s of sentencias(texto, vars)) {
      numero++;
      try {
        const r = await cliente.query(s.sql);
        if (s.gset) {
          const fila = (Array.isArray(r) ? r[r.length - 1] : r).rows[0];
          if (fila) for (const [k, v] of Object.entries(fila)) vars[k] = v == null ? "" : String(v);
        }
      } catch (e) {
        throw new Error(`${nombre} · sentencia #${numero}: ${e.message}\n   SQL: ${s.sql.slice(0, 400).replace(/\s+/g, " ")}`);
      }
    }
  } finally {
    await cliente.end();
  }
  if (!silencioso) for (const a of avisos) console.log("   " + a);
  return avisos;
}

function alinearIds() {
  const m = JSON.parse(readFileSync(join(RAIZ, "scripts/habilitacion/fuentes/mapeo-servicios.json"), "utf8"));
  const q = (s) => s.replaceAll("'", "''");
  const lineas = m.map(
    (r) => `update practicas_medicas set id = '${r.practica_medica_id}' where codigo = '${q(r.grupo_usuario)}' and nombre = '${q(r.nombre_usuario)}';`,
  );
  lineas.push(
    `do $$ begin if (select count(*) from practicas_medicas where id in (${m.map((r) => `'${r.practica_medica_id}'`).join(",")})) <> ${m.length} then raise exception 'ids de practicas_medicas sin alinear'; end if; end $$;`,
  );
  return lineas.join("\n");
}

const PERFIL_LEGADO_0080 = `
insert into clinicas (id, nombre, nit, plan_id, pais_operacion_id)
values ('00000000-0000-0000-0000-000000000080','Clínica de prueba perfil 0080','MIGRATION-0080',
  (select id from planes where codigo = 'gratis'), (select id from paises where codigo = 'CO'));
insert into sst_perfil (clinica_id, codigo_actividad) values ('00000000-0000-0000-0000-000000000080', '3862101');
`;

// ---------------- principal ----------------
rmSync(DIR_DATOS, { recursive: true, force: true });
mkdirSync(DIR_DATOS, { recursive: true });
const servidor = new EmbeddedPostgres({
  databaseDir: DIR_DATOS,
  user: "postgres",
  password: "postgres",
  port: PUERTO,
  persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (m) => console.log("[pg]", String(m).trim().slice(0,1500)),
  onError: (m) => console.log("[pg-err]", String(m).trim().slice(0,1500)),
});
let codigo = 0;
try {
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase("hab_prueba");
  console.log("PostgreSQL embebido listo.");

  console.log("Migraciones:");
  await correr(join(BD_LOCAL, "00-stubs-supabase.sql"), "00-stubs-supabase.sql", { silencioso: true });
  const archivos = readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort();
  for (const f of archivos) {
    const num = f.slice(0, 4);
    if (num === "0061") await correr(alinearIds(), "(alinear ids)", { esTexto: true, silencioso: true });
    if (num === "0080") await correr(PERFIL_LEGADO_0080, "(perfil legado 0080)", { esTexto: true, silencioso: true });
    await correr(join(MIGRACIONES, f), f, { silencioso: true });
    console.log("  OK " + f);
  }

  const fases = readdirSync(BD_LOCAL)
    .filter((f) => f.endsWith("-datos.sql"))
    .map((f) => f.replace("-datos.sql", ""))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const orden = [...fases.filter((f) => /^f\d/.test(f)), ...fases.filter((f) => /^sst/.test(f)), ...fases.filter((f) => /^ma/.test(f)), ...fases.filter((f) => /^rp/.test(f))];
  for (const fase of orden) {
    if (FILTRO.length && !FILTRO.some((p) => fase === p)) continue;
    console.log(`Pruebas ${fase}:`);
    await correr(join(BD_LOCAL, `${fase}-datos.sql`), `${fase}-datos.sql`, { silencioso: true });
    const avisos = await correr(join(BD_LOCAL, `${fase}-pruebas.sql`), `${fase}-pruebas.sql`, { silencioso: true });
    const ok = avisos.filter((a) => a.startsWith("OK ")).length;
    console.log(`   ${ok} comprobaciones OK`);
  }
  console.log("Todo en verde.");
} catch (e) {
  console.error("FALLA:", e && e.message ? e.message : e);
  if (e && e.stack) console.error(String(e.stack).split("\n").slice(0, 4).join("\n"));
  codigo = 1;
} finally {
  try {
    await servidor.stop();
  } catch {}
}
process.exit(codigo);
