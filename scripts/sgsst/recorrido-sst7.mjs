// Recorrido de SG-SST F7 (plan anual, comités e indicadores) en navegador
// real contra el Supabase local. Correr desde apps/web como los demás.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/sst"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
writeFileSync(`${S}/acta.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("plan anual: agregar y ejecutar", async () => {
  await page.goto(`${B}/sst/plan`);
  await page.getByRole("button", { name: "Agregar actividad" }).click();
  await page.fill("#actividadPlan", "Inspección de guardianes y señalización");
  await page.fill("#metaPlan", "100 % de consultorios");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByText("Actividad agregada").waitFor();
  const fila = page.locator("li", { has: page.getByText("Inspección de guardianes y señalización") }).first();
  await fila.getByRole("button", { name: "Ejecutada" }).click();
  await fila.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Actividad ejecutada").waitFor();
  await page.getByText(/Cumplimiento: \d+ de \d+/).waitFor();
});
await paso("comité: conformar el vigía con acta y registrar una reunión", async () => {
  await page.getByRole("tab", { name: "Comités" }).click();
  await page.getByRole("button", { name: /Conformar|Nuevo periodo/ }).first().click();
  await page.getByLabel("Integrante 1").fill("Auxiliar Dos");
  await page.setInputFiles("#actaComite", `${S}/acta.pdf`);
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await page.getByText("Comité conformado").waitFor({ timeout: 20000 });
  await page.getByText(/Acta de conformación: acta.pdf/).waitFor();
  await page.getByRole("button", { name: "Registrar reunión" }).click();
  await page.locator("textarea[id^=temas-]").fill("Revisión del pinchazo de agosto y de los guardianes");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await page.getByText("Reunión registrada").waitFor();
  await page.getByText(/Reuniones \(1\)/).waitFor();
});
await paso("indicadores del año", async () => {
  await page.getByRole("tab", { name: "Indicadores" }).click();
  await page.getByText(/Indicadores \d{4} \(Res. 0312/).waitFor();
  const filas = await page.locator("tbody tr").count();
  if (filas < 1) throw new Error("sin meses");
  console.log(`   ${filas} meses calculados`);
});
await page.screenshot({ path: `${S}/sst7-indicadores.png`, fullPage: true });
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/sst/plan?tab=indicadores`); await m.getByText(/Indicadores \d{4}/).waitFor();
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: `${S}/sst7-movil.png`, fullPage: true });
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
