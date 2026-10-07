// Recorrido de F6 (evidencia de otros módulos y protocolos) en navegador
// real contra el Supabase local (levantar.sh) con datos de RRHH, neveras e
// insumos cargados. Correr desde apps/web como recorrido-f5.mjs.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/ewah-recorrido";
mkdirSync(`${S}/shots`, { recursive: true });
writeFileSync(`${S}/bioseguridad.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const tarjeta = (codigo) => page.locator(`article[aria-label^='Criterio ${codigo}:']`);
const abrirDetalle = async (codigo) => {
  await tarjeta(codigo).getByRole("button", { name: /Ver detalle/ }).click();
  await page.getByRole("heading", { name: "Historial de evaluaciones" }).waitFor();
};
const cerrar = async () => {
  await page.locator("[data-slot=dialog-content] [data-slot=dialog-close]").first().click();
  await page.getByRole("heading", { name: "Historial de evaluaciones" }).waitFor({ state: "hidden" });
};

await page.goto(`${B}/login`);
await page.fill('input[name="email"]', "admin@ewah.local");
await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("TH.1: resumen de RRHH con tabla de personas", async () => {
  await page.goto(`${B}/habilitacion/autoevaluacion?estandar=talento_humano`);
  await abrirDetalle("11.1.TH.1");
  await page.getByRole("heading", { name: "Evidencia que ya tienes en otros módulos" }).waitFor();
  await page.getByRole("cell", { name: "Dra. Ana Pérez" }).waitFor();
  console.log("  ", (await page.getByText(/persona\(s\):/).innerText()).slice(0, 160));
});
await page.screenshot({ path: `${S}/shots/f6-1-th1.png` });
await paso("TH.1: usar como evidencia", async () => {
  await page.getByRole("button", { name: "Usar como evidencia" }).click();
  await page.getByText("Ya es evidencia de este criterio").waitFor();
  await page.getByRole("heading", { name: /Evidencias \(1\)/ }).waitFor();
});
await cerrar();
await paso("TH.1: Cumple directo (ya tiene evidencia)", async () => {
  await page.waitForTimeout(800);
  const guardado = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/habilitacion/autoevaluacion"));
  await tarjeta("11.1.TH.1").getByRole("button", { name: "Cumple", exact: true }).click();
  await page.locator("article[aria-label='Criterio 11.1.TH.1: Cumple']").waitFor();
  if (await page.getByRole("heading", { name: /agrega la evidencia/ }).isVisible()) throw new Error("pidió evidencia");
  // El estado es optimista: se espera a que el guardado termine antes de
  // navegar (si no, el navegador aborta el POST y la consola lo registra).
  await guardado;
});

await paso("MD.4.8: neveras 30/30 días y sugerencia", async () => {
  await page.goto(`${B}/habilitacion/autoevaluacion?estandar=medicamentos_dispositivos_insumos`);
  await abrirDetalle("11.1.MD.4.8");
  await page.getByText(/Nevera de toxina: 30\/30 días/).waitFor();
  await page.getByText(/parece cumplirse/).waitFor();
});
await cerrar();
await paso("MD.1.8: insumo sin registro sanitario", async () => {
  await abrirDetalle("11.1.MD.1.8");
  await page.getByText(/Gasa estéril/).waitFor();
  await page.getByText(/parece NO cumplirse/).waitFor();
});
await page.screenshot({ path: `${S}/shots/f6-2-md18.png` });
await cerrar();

await paso("PP.12.5: cargar protocolo, usarlo y descargarlo", async () => {
  await page.goto(`${B}/habilitacion/autoevaluacion?estandar=procesos_prioritarios`);
  await abrirDetalle("11.1.PP.12.5");
  await page.getByText("Protocolo: Bioseguridad").waitFor();
  await page.getByRole("button", { name: "Cargar el protocolo" }).click();
  await page.setInputFiles("input[aria-label='Archivo del protocolo']", `${S}/bioseguridad.pdf`);
  await page.getByRole("button", { name: "Cargar", exact: true }).click();
  await page.getByText("Versión 1").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Usar como evidencia" }).click();
  await page.getByText("Ya es evidencia de este criterio").waitFor();
  await page.evaluate(() => { window.open = (u) => { window.__url = u; return null; }; });
  await page.getByRole("button", { name: /bioseguridad\.pdf/ }).first().click();
  await page.waitForFunction(() => window.__url, null, { timeout: 10000 });
  const r = await fetch(await page.evaluate(() => window.__url));
  const inicio = Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString();
  if (r.status !== 200 || inicio !== "%PDF-") throw new Error(`descarga ${r.status}`);
});
await page.screenshot({ path: `${S}/shots/f6-3-protocolo.png` });
await paso("PP.12.5: segunda versión", async () => {
  await page.getByRole("button", { name: "Cargar versión nueva" }).click();
  await page.setInputFiles("input[aria-label='Archivo del protocolo']", `${S}/bioseguridad.pdf`);
  await page.getByRole("button", { name: "Cargar", exact: true }).click();
  await page.getByText("Versión 2").first().waitFor({ timeout: 15000 });
});
await cerrar();

await paso("RRHH no lista protocolos de habilitación", async () => {
  await page.goto(`${B}/rrhh`);
  await page.getByRole("tab", { name: /Protocolos/ }).click();
  await page.getByText("Manual de funciones").first().waitFor();
  if (await page.getByText("Bioseguridad").count()) throw new Error("RRHH muestra un protocolo de habilitación");
});

console.log("errores de consola:", errores.length ? errores : "ninguno");
await browser.close();
