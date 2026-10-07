// Recorrido de SG-SST F4 (documentos) en navegador real contra el Supabase
// local. Correr desde apps/web: cp ../../scripts/sgsst/recorrido-sst4.mjs . && node recorrido-sst4.mjs /tmp/sst
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/sst"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
writeFileSync(`${S}/plan.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
writeFileSync(`${S}/falso.pdf`, "MZ no soy un pdf");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));
const fila = () => page.locator("div.py-3", { has: page.getByText("Plan anual de trabajo del SG-SST (firmado)", { exact: true }) });

await paso("checklist según el grupo", async () => {
  await page.goto(`${B}/sst/documentos`);
  await page.getByText("Documentos del SG-SST").waitFor();
  console.log("  ", await page.getByText(/cargados$/).innerText());
});
await paso("subir v1 y v2 del plan anual", async () => {
  await page.getByLabel("Subir Plan anual de trabajo del SG-SST (firmado)").setInputFiles(`${S}/plan.pdf`);
  await page.getByText(/versión 1 cargada/).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await page.getByLabel("Subir Plan anual de trabajo del SG-SST (firmado)").setInputFiles(`${S}/plan.pdf`);
  await page.getByText(/versión 2 cargada/).waitFor({ timeout: 20000 });
  await fila().getByRole("button", { name: "2 versiones" }).waitFor();
});
await paso("archivo falso rechazado", async () => {
  await page.getByLabel("Subir Política de Seguridad y Salud en el Trabajo").setInputFiles(`${S}/falso.pdf`);
  await page.getByText(/Formato no soportado/).waitFor();
});
await paso("descarga firmada", async () => {
  let url = null;
  await page.exposeFunction("__capturar", (u) => { url = u; });
  await page.evaluate(() => { window.open = (u) => { window.__capturar(String(u)); return null; }; });
  await fila().getByRole("button", { name: /v2 · plan.pdf/ }).click();
  await page.waitForFunction(() => true);
  for (let i = 0; i < 20 && !url; i++) await page.waitForTimeout(250);
  if (!url || !url.includes("/storage/v1/object/sign/sst/")) throw new Error(`url: ${url}`);
  const r = await page.request.get(url);
  if (r.status() !== 200) throw new Error(`descarga ${r.status()}`);
});
await page.screenshot({ path: `${S}/sst4-documentos.png`, fullPage: true });
await paso("RRHH ya no lista los del SG-SST", async () => {
  await page.goto(`${B}/rrhh`);
  await page.getByRole("tab", { name: /Protocolos/ }).click();
  await page.waitForTimeout(800);
  if (await page.getByText("Plan anual de trabajo del SG-SST (firmado)").count()) throw new Error("RRHH sigue mostrando documentos del SG-SST");
});
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/sst/documentos`); await m.getByText("Documentos del SG-SST").waitFor();
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: `${S}/sst4-movil.png`, fullPage: true });
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
