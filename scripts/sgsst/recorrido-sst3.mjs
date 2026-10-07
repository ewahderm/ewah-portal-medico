// Recorrido de SG-SST F3 (incidentes y accidentes) en navegador real contra
// el Supabase local (levantar.sh + personal en RRHH, ver recorrido-sst1).
// Correr desde apps/web: cp ../../scripts/sgsst/recorrido-sst3.mjs . && node recorrido-sst3.mjs /tmp/sst
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/sst"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
writeFileSync(`${S}/informe.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (id, texto) => { await page.locator(`#${id}`).click(); await page.getByRole("option", { name: texto }).click(); };

await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("reportar un accidente con riesgo biológico", async () => {
  await page.goto(`${B}/sst/eventos`);
  await page.getByRole("button", { name: "Reportar un evento" }).click();
  await elegir("empleadoId", "Enfermera Uno");
  await page.fill("#resumen", "Pinchazo con aguja al desechar en el guardián");
  await page.fill("#tipoLesion", "Herida punzante");
  await page.fill("#parteCuerpo", "Dedo índice izquierdo");
  await page.getByText("Hubo exposición a riesgo biológico").click();
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.waitForURL(/\/sst\/eventos\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await page.getByText(/Reportar a la ARL: vence/).waitFor();
  await page.getByText(/Exposición a riesgo biológico/).first().waitFor();
});
await page.screenshot({ path: `${S}/sst3-1-evento.png`, fullPage: true });
await paso("reporte a la ARL con FURAT y a la EPS", async () => {
  await page.getByText("Reportado a la ARL (FURAT)").click();
  await page.fill("#furat", "FURAT-2026-001");
  await page.getByText("Reportado a la EPS").click();
  await page.fill("#seguimientoBiologico", "Fuente negativa para VIH y VHB; control a los 3 meses");
  await page.getByRole("button", { name: "Guardar seguimiento" }).click();
  await page.getByText("Seguimiento guardado").waitFor();
  // Tras el refresh el aviso desaparece; si no, waitFor agota el tiempo.
  await page.getByText(/Reportar a la ARL: vence/).waitFor({ state: "detached", timeout: 10000 });
});
await paso("investigación: guardar, subir informe y cerrar", async () => {
  await page.locator('input[aria-label="Nombre del integrante 1"]').fill("Jefe de enfermería");
  await page.getByRole("button", { name: "Agregar integrante" }).click();
  await page.locator('input[aria-label="Nombre del integrante 2"]').fill("Vigía SST");
  await page.getByRole("button", { name: "Iniciar investigación" }).click();
  await page.getByText("Investigación guardada").waitFor();
  await page.getByText("Plan de acción").waitFor();
  await page.fill("#causasInmediatas", "Desecho de la aguja sin activar el dispositivo de seguridad");
  await page.fill("#causasBasicas", "Guardián lejos del punto de atención y prisa por carga de trabajo");
  await page.setInputFiles("#informe", `${S}/informe.pdf`);
  await page.getByText("Cerrar la investigación").click();
  await page.getByRole("button", { name: "Cerrar investigación" }).click();
  await page.getByText(/Cerrada el/).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "informe.pdf" }).waitFor();
});
await paso("plan de acción: crear y cerrar", async () => {
  await page.getByRole("button", { name: "Agregar acción" }).click();
  await page.locator("textarea[id^=descripcionAccion]").fill("Ubicar un guardián al alcance en cada consultorio");
  await page.locator("[id^=responsableId]").click(); await page.getByRole("option", { name: "Admin Local" }).click();
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByText("Acción agregada").waitFor();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByLabel("Cómo se cumplió").fill("Guardianes instalados en los 3 consultorios");
  await page.getByRole("button", { name: "Cerrar acción" }).click();
  await page.getByText(/Cerrada el .*Guardianes instalados/).waitFor();
});
await page.screenshot({ path: `${S}/sst3-2-investigacion.png`, fullPage: true });
await paso("incidente sin lesión y filtros", async () => {
  await page.goto(`${B}/sst/eventos`);
  await page.getByRole("button", { name: "Reportar un evento" }).click();
  await page.getByRole("radio", { name: /Incidente/ }).click();
  await elegir("empleadoId", "Auxiliar Dos");
  await page.fill("#resumen", "Piso mojado sin señalizar en el pasillo, casi cae");
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.waitForURL(/\/sst\/eventos\/[0-9a-f-]{36}$/);
  await page.getByText(/no se reporta a la ARL/).waitFor();
  await page.goto(`${B}/sst/eventos?tipo=incidente`);
  const items = page.locator("ul li a[href^='/sst/eventos/']");
  const n = await items.count();
  const accidentes = await items.filter({ hasText: "Accidente de trabajo" }).count();
  if (n < 1 || accidentes > 0) throw new Error(`filtro de incidentes: ${n} ítems, ${accidentes} accidentes`);
});
await paso("RRHH sigue mostrando los accidentes", async () => {
  await page.goto(`${B}/rrhh`);
  await page.getByRole("tab", { name: /Accidentes/ }).click();
  await page.getByText(/Pinchazo con aguja/).first().waitFor();
});
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  m.on("pageerror", (e) => errores.push(String(e)));
  await m.goto(`${B}/sst/eventos?estado=todos`); await m.getByText("Incidentes, accidentes y enfermedad laboral").waitFor();
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: `${S}/sst3-3-movil.png`, fullPage: true });
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
