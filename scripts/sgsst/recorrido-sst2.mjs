// Recorrido de SG-SST F2 (autoevaluación de estándares mínimos) en
// navegador real contra el Supabase local. Correr desde apps/web como los
// demás. Usa el primer año sin autoevaluación cerrada (se puede repetir).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/sst"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

let anio = new Date().getFullYear();
await paso("elegir un año sin autoevaluación cerrada", async () => {
  for (;; anio--) {
    await page.goto(`${B}/sst/estandares?anio=${anio}`);
    await page.getByText(`Estándares mínimos ${anio}`).waitFor();
    if (!(await page.getByText(/^Resultado \(cerrada/).count())) break;
  }
  console.log(`   año ${anio}`);
});
await paso("iniciar con el grupo del diagnóstico", async () => {
  if (await page.getByRole("button", { name: "Iniciar autoevaluación" }).count()) {
    const combo = page.locator("#grupoEstandares");
    if (!(await combo.inputValue())) { await combo.click(); await page.getByRole("option", { name: /^7 estándares/ }).click(); }
    await page.getByRole("button", { name: "Iniciar autoevaluación" }).click();
    await page.getByText(`Autoevaluación ${anio} iniciada`).waitFor();
  }
  await page.getByText(/\d+ de \d+ ítems calificados/).waitFor();
});
const filtro = (n) => page.getByRole("group", { name: "Filtrar ítems" }).getByRole("button", { name: new RegExp(`^${n}`) });
const items = () => page.locator("main li").filter({ has: page.getByRole("radiogroup") });
await paso("no aplica exige justificación", async () => {
  await filtro("Sin calificar").click();
  const li = items().first();
  if (!(await li.count())) return;
  await li.getByRole("radio", { name: "No aplica" }).click();
  if (await li.getByRole("button", { name: "Guardar" }).isEnabled()) throw new Error("Guardar habilitado sin justificación");
  await li.getByPlaceholder(/Por qué no aplica/).fill("No tenemos trabajadores en alturas ni en espacios confinados");
  const antes = await items().count();
  await li.getByRole("button", { name: "Guardar" }).click();
  await page.waitForFunction((n) => document.querySelectorAll("main li [role=radiogroup]").length < n, antes);
});
await paso("un ítem no cumple con su acción de mejora", async () => {
  const li = items().first();
  if (!(await li.count())) return;
  const codigo = (await li.locator(".font-mono").textContent()).trim();
  await li.getByRole("radio", { name: "No cumple" }).click();
  await li.getByPlaceholder(/Evidencia u observación/).fill("No hay evidencia documentada");
  await li.getByRole("button", { name: "Guardar" }).click();
  await filtro("No cumple").click();
  const nc = page.locator("main li").filter({ hasText: codigo }).first();
  await nc.getByRole("button", { name: "Agregar acción" }).click();
  await nc.locator("textarea[name=descripcion]").fill("Documentar y divulgar el estándar pendiente");
  await nc.locator("input[id^=responsableId-]").click(); await page.getByRole("option").first().click();
  await nc.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByText("Acción agregada").waitFor();
  await nc.getByText("Documentar y divulgar el estándar pendiente").waitFor();
});
await paso("calificar el resto como cumple", async () => {
  await filtro("Sin calificar").click();
  for (let n = await items().count(); n > 0; n = await items().count()) {
    const li = items().first();
    await li.getByRole("radio", { name: "Cumple", exact: true }).click();
    await li.getByRole("button", { name: "Guardar" }).click();
    await page.waitForFunction((k) => document.querySelectorAll("main li [role=radiogroup]").length < k, n, { timeout: 15000 });
  }
});
await paso("cerrar: la BD fija puntaje y nivel", async () => {
  await page.getByRole("button", { name: "Cerrar autoevaluación" }).click();
  await page.getByRole("button", { name: "Cerrar autoevaluación" }).last().click();
  await page.getByText("Autoevaluación cerrada").waitFor();
  await page.getByText(/^Resultado \(cerrada/).waitFor();
  const puntaje = await page.locator("p.text-3xl").textContent();
  console.log(`   puntaje ${puntaje}`);
  if (await page.getByRole("radiogroup").count()) throw new Error("sigue editable");
});
await page.screenshot({ path: `${S}/sst2-estandares.png`, fullPage: true });
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/sst/estandares?anio=${anio}`); await m.getByText(`Estándares mínimos ${anio}`).waitFor();
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: `${S}/sst2-movil.png`, fullPage: true });
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
