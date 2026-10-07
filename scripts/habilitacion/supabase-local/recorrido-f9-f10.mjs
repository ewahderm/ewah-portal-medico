// Recorrido de F9 (alertas) y F10 (tablero y cierre) en navegador real
// contra el Supabase local (levantar.sh). Correr desde apps/web como
// recorrido-f5.mjs, con el servidor de desarrollo arrancado con:
//   CRON_SECRET=secreto-local RESEND_API_KEY=re_local RESEND_BASE_URL=http://127.0.0.1:4010
// (en .env.local). Este script levanta un Resend FALSO en :4010 que guarda
// los correos y puede responder con error, para probar que un error de
// Resend no marca nada como avisado. Requiere en la BD: EWAH inscrita, una
// ocurrencia pendiente a 3 días de FT001 con correo adicional y un No cumple
// (ver el bloque SQL del commit de F9/F10).
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
const S = process.argv[2] ?? "/tmp/ewah-recorrido";
mkdirSync(`${S}/shots`, { recursive: true });
const B = "http://localhost:3000";

// ---------- Resend falso ----------
let modo = "error";
const correos = [];
const servidor = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (modo === "error") {
      res.statusCode = 422;
      return res.end(JSON.stringify({ name: "validation_error", message: "Resend falso: error forzado", statusCode: 422 }));
    }
    correos.push(JSON.parse(cuerpo));
    res.end(JSON.stringify({ id: `falso-${correos.length}` }));
  });
});
await new Promise((r) => servidor.listen(4010, "127.0.0.1", r));
const cron = async () => {
  const r = await fetch(`${B}/api/cron/diario`, { headers: { Authorization: "Bearer secreto-local" } });
  if (!r.ok) throw new Error(`cron ${r.status}`);
  return (await r.json()).habilitacion;
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };

await paso("cron sin CRON_SECRET → 401", async () => {
  const r = await fetch(`${B}/api/cron/diario`);
  if (r.status !== 401) throw new Error(`esperaba 401, fue ${r.status}`);
});
await paso("Resend con error: no se marca nada como avisado", async () => {
  const r = await cron();
  if (r.enviados !== 0 || r.fallidos < 1 || r.avisos !== 0) throw new Error(JSON.stringify(r));
});
await paso("Resend OK: un correo a la clínica + uno aparte al contador, con lo suyo", async () => {
  modo = "ok";
  const r = await cron();
  if (r.enviados !== 2 || r.avisos < 1) throw new Error(JSON.stringify(r));
  const [interno, externo] = correos;
  if (!interno.to.includes("admin@ewah.local")) throw new Error("el correo interno no va al admin");
  if (JSON.stringify(externo.to) !== JSON.stringify(["contador@externo.co"])) throw new Error("el correo externo va a otro lado");
  if (!externo.html.includes("FT001") || externo.html.includes("FT002") || externo.html.includes("Ver en EWAH")) {
    throw new Error("el contador ve más de lo suyo");
  }
  const iRojo = interno.html.indexOf("Vencido o en los próximos 7 días");
  const iAmbar = interno.html.indexOf("En los próximos 30 días");
  if (iRojo < 0 || (iAmbar >= 0 && iAmbar < iRojo)) throw new Error("el rojo no va primero");
  console.log(`   asunto: ${interno.subject}`);
  writeFileSync(`${S}/correo-interno.html`, interno.html);
});
await paso("segunda corrida el mismo día: no duplica", async () => {
  const antes = correos.length;
  const r = await cron();
  if (r.enviados !== 0 || correos.length !== antes) throw new Error(JSON.stringify(r));
});

await page.goto(`${B}/login`);
await page.fill('input[name="email"]', "admin@ewah.local");
await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("insignia de urgentes en el menú (escritorio)", async () => {
  await page.goto(`${B}/habilitacion`);
  const trigger = page.getByRole("button", { name: /Administración/ });
  const texto = await trigger.innerText();
  if (!/\d/.test(texto)) throw new Error(`sin número en el menú: ${texto}`);
  await trigger.click();
  await page.getByRole("menuitem", { name: /Habilitación.*pendientes urgentes/ }).waitFor();
  await page.keyboard.press("Escape");
});
await paso("Resumen: estándares, qué puedo declarar, disciplina", async () => {
  await page.getByText("Tu autoevaluación").waitFor();
  await page.getByText("Cumplimiento por estándar").waitFor();
  await page.getByText("¿Qué puedes declarar?").waitFor();
  await page.getByText(/No cumple/).first().waitFor();
  await page.getByText("Reportes presentados a tiempo (último año)").waitFor();
});
await page.screenshot({ path: `${S}/shots/f10-1-resumen.png`, fullPage: true });

let idAuto;
await paso("cerrar con 1 No cumple: aviso → confirmar → foto", async () => {
  await page.goto(`${B}/habilitacion/autoevaluacion`);
  await page.getByRole("button", { name: "Cerrar autoevaluación" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByText(/no se puede declarar|no se pueden declarar/).waitFor({ timeout: 20000 });
  const cerrar = dialogo.getByRole("button", { name: "Cerrar y guardar la foto" });
  if (await cerrar.isEnabled()) throw new Error("debe pedir confirmación antes de cerrar");
  await page.screenshot({ path: `${S}/shots/f10-2-dialogo.png` });
  await dialogo.getByRole("checkbox").click();
  await cerrar.click();
  await page.waitForURL(/\/historial\/[0-9a-f-]{36}$/, { timeout: 30000 });
  idAuto = page.url().split("/").at(-1);
  await page.getByText("Criterios como quedaron").waitFor();
  await page.getByText(/no se podía declarar|no se podían declarar/).waitFor();
});
await page.screenshot({ path: `${S}/shots/f10-3-foto.png`, fullPage: true });
await paso("filtro No cumple en la foto", async () => {
  await page.getByRole("link", { name: "No cumple", exact: true }).click();
  await page.waitForURL(/estado=no_cumple/);
  const n = await page.locator("details li").count();
  if (n < 1) throw new Error("sin criterios No cumple en la foto");
});
await paso("fecha de declaración en el REPS (una vez)", async () => {
  await page.getByRole("button", { name: "Guardar fecha" }).click();
  await page.getByText(/Declarada en el REPS el/).waitFor();
  if (await page.getByRole("button", { name: "Guardar fecha" }).count()) throw new Error("se puede registrar dos veces");
});
await paso("exportar Excel (3 hojas) y PDF", async () => {
  const [dx] = await Promise.all([page.waitForEvent("download"), page.locator(`a[href*="formato=xlsx"]`).click()]);
  const rutaX = `${S}/autoevaluacion.xlsx`;
  await dx.saveAs(rutaX);
  const libro = XLSX.read(readFileSync(rutaX));
  if (libro.SheetNames.join() !== "Resumen,Servicios,Criterios") throw new Error(libro.SheetNames.join());
  const filas = XLSX.utils.sheet_to_json(libro.Sheets.Criterios);
  console.log(`   Excel: ${filas.length} criterios`);
  if (filas.length < 400) throw new Error("faltan criterios en el Excel");
  const [dp] = await Promise.all([page.waitForEvent("download"), page.locator(`a[href*="formato=pdf"]`).click()]);
  const rutaP = `${S}/autoevaluacion.pdf`;
  await dp.saveAs(rutaP);
  const r = await page.request.get(`${B}/api/exportar/habilitacion/${idAuto}?formato=pdf`);
  const cuerpo = await r.body();
  if (r.headers()["content-type"] !== "application/pdf" || cuerpo.subarray(0, 4).toString() !== "%PDF") throw new Error("no es un PDF");
  console.log(`   PDF: ${(cuerpo.length / 1024).toFixed(0)} KB`);
});
await paso("historial lista la autoevaluación", async () => {
  await page.goto(`${B}/habilitacion/autoevaluacion/historial`);
  await page.getByRole("link", { name: /Autoevaluación \d{4}/ }).first().waitFor();
  await page.getByText(/servicio no apto/).first().waitFor();
});
await paso("la ocurrencia REPS quedó presentada", async () => {
  await page.goto(`${B}/habilitacion/obligaciones`);
  await page.waitForLoadState("networkidle");
});

await paso("móvil 390 px: insignia en el menú y foto legible", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  m.on("pageerror", (e) => errores.push(String(e)));
  await m.goto(`${B}/habilitacion/autoevaluacion/historial/${idAuto}`);
  await m.getByText("Criterios como quedaron").waitFor();
  const abrir = m.getByRole("button", { name: "Abrir menú" });
  if (!/\d/.test(await abrir.innerText())) throw new Error("sin insignia en el botón del menú móvil");
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 390) throw new Error(`scroll horizontal: ${ancho}px`);
  await m.screenshot({ path: `${S}/shots/f10-4-movil.png`, fullPage: true });
  await abrir.click();
  await m.getByRole("link", { name: /Habilitación.*pendientes urgentes/ }).waitFor();
  await m.screenshot({ path: `${S}/shots/f10-5-menu-movil.png` });
});

await browser.close();
servidor.close();
if (errores.length) {
  console.log("ERRORES DE CONSOLA:\n" + errores.join("\n"));
  process.exit(1);
}
console.log("Recorrido F9/F10 en verde.");
