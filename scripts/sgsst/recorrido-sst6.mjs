// Recorrido de SG-SST F6 (capacitación, EPP y exámenes) en navegador real
// contra el Supabase local (con la Enfermera Uno con cargo AUX y examen de
// ingreso de hace 380 días). Correr desde apps/web como los demás.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/sst"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
writeFileSync(`${S}/lista.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (sel, texto) => { await page.locator(sel).click(); await page.getByRole("option", { name: texto }).click(); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("personas: sin periodicidad pide definirla; al fijar 12 meses queda vencido", async () => {
  await page.goto(`${B}/sst/personas`);
  const fila = page.locator("li", { has: page.getByText("Enfermera Uno", { exact: true }) });
  await fila.getByText("Define la periodicidad del cargo").waitFor();
  const campo = page.getByLabel("Meses para Auxiliar de enfermería");
  await campo.fill("12");
  await campo.blur();
  await page.getByText("Periodicidad guardada").waitFor();
  await fila.getByText(/Periódico vencido hace/).waitFor({ timeout: 15000 });
});
await paso("capacitación realizada con asistentes y lista de asistencia", async () => {
  await page.getByRole("tab", { name: "Capacitación" }).click();
  await page.getByRole("button", { name: "Programar o registrar" }).click();
  await page.fill("#tema", "Manejo seguro de cortopunzantes");
  await page.fill("#duracion", "2");
  await page.getByText("Ya se realizó").click();
  await page.getByRole("checkbox", { name: "Enfermera Uno" }).click();
  await page.getByRole("checkbox", { name: "Auxiliar Dos" }).click();
  await page.setInputFiles("#soporte", `${S}/lista.pdf`);
  await page.getByRole("button", { name: "Guardar como realizada" }).click();
  await page.getByText("Capacitación registrada").waitFor({ timeout: 20000 });
  await page.getByText(/2 asistentes/).waitFor();
  await page.getByRole("button", { name: "lista.pdf" }).waitFor();
});
await paso("programar una futura y luego cancelarla", async () => {
  await page.getByRole("button", { name: "Programar o registrar" }).click();
  await page.fill("#tema", "Simulacro de evacuación");
  const futura = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  await page.fill("#fechaCap", futura);
  await page.getByRole("button", { name: "Programar" }).click();
  await page.getByText("Capacitación programada").waitFor();
  await page.locator("li", { has: page.getByText("Simulacro de evacuación") }).getByRole("button", { name: "Registrar" }).click();
  await page.getByLabel("Motivo de cancelación").fill("Se reprograma para el próximo año");
  await page.getByRole("button", { name: "Cancelar capacitación" }).click();
  await page.getByText("Capacitación cancelada").waitFor();
});
await paso("entrega de EPP y anulación", async () => {
  await page.getByRole("tab", { name: "EPP" }).click();
  await page.getByRole("button", { name: "Registrar entrega" }).click();
  await elegir("#empleadoEpp", "Enfermera Uno");
  await page.getByLabel("Cantidad 1").fill("100");
  await page.getByRole("button", { name: "Otro elemento" }).click();
  await page.getByLabel("Elemento 2").fill("Bata antifluido");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await page.getByText("Entrega registrada").waitFor();
  await page.getByText(/100 × Guantes de nitrilo, 1 × Bata antifluido/).first().waitFor();
});
await page.screenshot({ path: `${S}/sst6-epp.png`, fullPage: true });
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/sst/personas`); await m.getByText("Tu personal").waitFor();
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: `${S}/sst6-movil.png`, fullPage: true });
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
