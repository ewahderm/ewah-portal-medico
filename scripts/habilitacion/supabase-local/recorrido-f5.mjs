// Recorrido de F5 en navegador real contra el Supabase local (levantar.sh).
// Correr desde apps/web (resuelve @playwright/test): cp ../../scripts/habilitacion/supabase-local/recorrido-f5.mjs ./r.mjs && node r.mjs; rm r.mjs
// Deja capturas en /tmp/ewah-recorrido/shots. Usa la BD tal como esté: correrlo sobre datos limpios.
import { chromium } from "@playwright/test";
const S = process.argv[2] ?? "/tmp/ewah-recorrido";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync(`${S}/shots`, { recursive: true });
writeFileSync(`${S}/evidencia.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
writeFileSync(`${S}/falso.pdf`, "MZ\x90 no soy un pdf");
const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errores = [];
// La captura de pantalla de Playwright inyecta caret-color en los inputs y
// React lo reporta como diferencia de hidratación: ruido de la prueba.
const ruido = (t) => t.includes("caret-color");
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !ruido(m.text())) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };

await paso("login", async () => {
  await page.goto(`${B}/login`);
  await page.fill('input[name="email"]', "admin@ewah.local");
  await page.fill('input[name="password"]', "Prueba-local-123!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
});
await paso("abrir autoevaluación", async () => {
  await page.goto(`${B}/habilitacion/autoevaluacion`, { timeout: 120000 });
  await page.getByText("criterios;").first().waitFor({ timeout: 60000 });
});
console.log("cabecera:", (await page.locator("p:has-text('criterios;')").first().innerText()).replace(/\s+/g, " "));
await page.screenshot({ path: `${S}/shots/1-inicio.png`, fullPage: false });

const tarjetas = page.locator("article[aria-label^='Criterio']");
console.log("tarjetas evaluables visibles:", await tarjetas.count());

// No cumple → plan de mejora
await paso("No cumple + plan", async () => {
  const t = tarjetas.nth(0);
  await t.getByRole("button", { name: "No cumple" }).click();
  await page.getByRole("heading", { name: /Plan de mejora/ }).waitFor();
  await page.fill("#accion", "Solicitar el certificado de calibración al proveedor");
  await page.getByRole("button", { name: "Crear plan de mejora" }).click();
  await page.getByText("Plan de mejora creado").waitFor();
});
// No aplica con justificación
await paso("No aplica", async () => {
  const t = tarjetas.nth(1);
  await t.getByRole("button", { name: "No aplica" }).click();
  await page.fill("#justificacion", "Solo prestamos consulta externa en esta sede.");
  await page.getByRole("button", { name: "Marcar «No aplica»" }).click();
  await t.locator("text=No aplica porque:").waitFor({ timeout: 15000 });
});
// Cumple sin evidencia → diálogo de evidencia (nota)
await paso("Cumple con nota", async () => {
  const t = tarjetas.nth(2);
  await t.getByRole("button", { name: "Cumple", exact: true }).click();
  await page.getByRole("heading", { name: /agrega la evidencia/ }).waitFor();
  await page.getByText("Nota", { exact: true }).click();
  await page.fill("#descripcion", "Verifiqué en sitio la hoja de vida del personal.");
  await page.getByRole("button", { name: "Guardar y marcar «Cumple»" }).click();
  await page.getByText(/: Cumple$/).first().waitFor({ timeout: 15000 });
});
// Cumple con archivo PDF (subida directa) y rechazo de un falso PDF
await paso("Cumple con PDF y rechazo de falso PDF", async () => {
  const t = tarjetas.nth(3);
  await t.getByRole("button", { name: "Cumple", exact: true }).click();
  await page.getByRole("heading", { name: /agrega la evidencia/ }).waitFor();
  await page.setInputFiles("#archivo", `${S}/falso.pdf`);
  await page.fill("#descripcion", "Intento con un archivo que no es PDF");
  await page.getByRole("button", { name: "Guardar y marcar «Cumple»" }).click();
  await page.getByText("Formato no soportado").waitFor();
  await page.setInputFiles("#archivo", `${S}/evidencia.pdf`);
  await page.fill("#descripcion", "Certificado de habilitación del equipo");
  await page.getByRole("button", { name: "Guardar y marcar «Cumple»" }).click();
  await page.getByText(/: Cumple$/).first().waitFor({ timeout: 20000 });
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${S}/shots/2-evaluados.png`, fullPage: false });

// Detalle: historial, evidencias, descarga firmada
await paso("detalle con descarga (URL firmada 60 s)", async () => {
  const t = tarjetas.nth(3);
  // window.open con noopener no se puede seguir como popup: se intercepta.
  await page.evaluate(() => { window.open = (u) => { window.__url = u; return null; }; });
  await t.getByRole("button", { name: /evidencia.*Ver detalle/ }).click();
  await page.getByRole("heading", { name: "Historial de evaluaciones" }).waitFor();
  await page.getByRole("button", { name: /evidencia\.pdf/ }).click();
  await page.waitForFunction(() => window.__url, null, { timeout: 10000 });
  const u = await page.evaluate(() => window.__url);
  const r = await fetch(u);
  const inicio = Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString();
  if (r.status !== 200 || inicio !== "%PDF-") throw new Error(`descarga ${r.status} ${inicio}`);
  console.log("  descarga:", r.status, r.headers.get("content-type"), r.headers.get("content-disposition"));
});
await page.screenshot({ path: `${S}/shots/3-detalle.png`, fullPage: false });
await page.getByRole("button", { name: "Close" }).first().click().catch(async () => { await page.keyboard.press("Escape"); });
await page.getByRole("heading", { name: "Historial de evaluaciones" }).waitFor({ state: "hidden" });

// Filtros: No cumple
await paso("filtro No cumple + URL", async () => {
  await page.getByRole("button", { name: /^No cumple \d/ }).click();
  await page.waitForURL(/estado=no_cumple/);
  console.log("  tarjetas con filtro:", await tarjetas.count());
});
// Otra pestaña de estándar
await paso("pestaña Infraestructura", async () => {
  await page.getByRole("link", { name: /Infraestructura/ }).click();
  await page.waitForURL(/estandar=infraestructura/);
  await page.locator("article[aria-label^='Criterio']").first().waitFor();
});

// Móvil
const movil = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
const pm = await movil.newPage();
await pm.goto(`${B}/habilitacion/autoevaluacion`);
await pm.locator("article[aria-label^='Criterio']").first().waitFor({ timeout: 60000 });
await pm.screenshot({ path: `${S}/shots/4-movil.png`, fullPage: false });
const anchoScroll = await pm.evaluate(() => document.documentElement.scrollWidth);
console.log("móvil scrollWidth:", anchoScroll, "(viewport 390)");

// Resumen: paso 4 de la ruta
await page.goto(`${B}/habilitacion`);
await page.getByText("criterios evaluados").first().waitFor({ timeout: 30000 });
console.log("ruta paso 4:", (await page.getByText(/criterios evaluados/).first().innerText()));
await page.screenshot({ path: `${S}/shots/5-resumen.png`, fullPage: false });

console.log("errores de consola:", errores.length ? errores : "ninguno");
await browser.close();
