// Recorrido de Flujo de caja FC4 (tarifa de Bold con simulador, pendientes
// de abono, liquidación con diferencia y reporte, anulación y nueva
// liquidación) en navegador real. Parte de lo que deja recorrido-fc3.mjs:
// un cobro de $100.000 con Tarjeta crédito pendiente en "Bold por abonar".
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/fc4"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
writeFileSync(`${S}/reporte-bold.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (sel, texto) => { await page.locator(sel).click(); await page.getByRole("option", { name: texto }).first().click(); };
const dialogo = () => page.locator("[data-slot=dialog-content]").filter({ has: page.locator("form, textarea") }).last();
const toast = (t) => page.getByText(t).last();
const pesos = (t) => Number((t.match(/\$\s?([\d.]+)/)?.[1] ?? "0").replaceAll(".", ""));
const cifra = async (titulo) => pesos(await page.getByText(titulo).locator("..").innerText());
async function esperar(fn, valor, que) {
  for (let i = 0; i < 40; i++) { if ((await fn()) === valor) return; await page.waitForTimeout(250); }
  throw new Error(`${que}: ${await fn()} (esperado ${valor})`);
}
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("tarifa de Bold con simulador", async () => {
  await page.goto(`${B}/finanzas/configuracion?tab=medios`);
  await page.locator("li", { has: page.getByLabel("Destino de Tarjeta crédito", { exact: true }) }).getByRole("button", { name: "Tarifa" }).click();
  await page.getByText("Aún no tiene tarifa").waitFor();
  await page.getByRole("button", { name: "Usar la tarifa estándar de Bold" }).click();
  await page.getByText("Te llegan").locator("..").getByText(/93\.996/).waitFor();
  await page.fill("#tarifaSimulador", "250.000");
  await page.getByText(/235\.440/).first().waitFor();
  await page.screenshot({ path: `${S}/fc4-tarifa.png` });
  await page.getByRole("button", { name: "Guardar tarifa" }).click();
  await toast("Tarifa guardada").waitFor();
  await page.getByText(/Desde el .* 3,79 %/).or(page.getByText("3,79 % + $300 (IVA incluido) · abono en 1 día hábil").first()).first().waitFor();
  await page.keyboard.press("Escape");
});
let disponible0, porAbonar0;
await paso("pendientes de Bold con el neto esperado", async () => {
  await page.goto(`${B}/finanzas`);
  disponible0 = await cifra("Disponible en pesos");
  porAbonar0 = await cifra("Por abonar (pasarela)");
  await page.getByText("Por abonar (pasarela)").click();
  await page.waitForURL(/\/finanzas\/bold/);
  await page.getByText(/llegan \$\s?93\.996/).first().waitFor();
  await page.screenshot({ path: `${S}/fc4-bold.png`, fullPage: true });
});
await paso("liquidar con diferencia y reporte", async () => {
  await page.getByRole("checkbox", { name: /Elegir los cobros que llegan/ }).first().click();
  await page.getByRole("button", { name: "Liquidar", exact: true }).click();
  await dialogo().getByText("Neto esperado").waitFor();
  await elegir("#cuentaLiquidacion", /Bancolombia/);
  await page.fill("#netoLiquidacion", "93.900");
  await dialogo().getByText(/Llegaron \$\s?96 menos/).waitFor();
  await page.locator("#reporteLiquidacion").setInputFiles(`${S}/reporte-bold.pdf`);
  await dialogo().getByRole("button", { name: "Liquidar" }).click();
  await toast("Liquidación registrada").waitFor({ timeout: 20000 });
  await page.getByText("Con diferencia").waitFor();
  await page.getByText("reporte-bold.pdf").waitFor();
  await page.getByText("No hay cobros pendientes de abono.").waitFor();
  await page.goto(`${B}/finanzas`);
  await esperar(() => cifra("Disponible en pesos"), disponible0 + 93900, "disponible tras liquidar");
  await esperar(() => cifra("Por abonar (pasarela)"), porAbonar0 - 100000, "por abonar tras liquidar");
});
await paso("los movimientos de la liquidación", async () => {
  await page.goto(`${B}/finanzas/movimientos`);
  await page.getByText("Comisión pasarela").first().waitFor();
  await page.getByText(/Retenciones/).first().waitFor();
  if ((await page.getByText("Liquidación", { exact: true }).count()) < 4) throw new Error("faltan movimientos de la liquidación");
});
await paso("anular la liquidación devuelve los cobros a pendientes", async () => {
  await page.goto(`${B}/finanzas/bold`);
  await page.getByRole("button", { name: "Anular" }).first().click();
  await page.locator("textarea").fill("El neto era otro, se liquida de nuevo");
  await page.locator("[data-slot=dialog-content]").getByRole("button", { name: "Anular" }).click();
  await toast("Liquidación anulada").waitFor();
  await page.getByText(/llegan \$\s?93\.996/).first().waitFor();
  await page.goto(`${B}/finanzas`);
  await esperar(() => cifra("Disponible en pesos"), disponible0, "disponible tras anular");
});
await paso("liquidar de nuevo, exacto", async () => {
  await page.goto(`${B}/finanzas/bold`);
  await page.getByRole("checkbox", { name: /Elegir el cobro de/ }).first().click();
  await page.getByRole("button", { name: "Liquidar", exact: true }).click();
  await elegir("#cuentaLiquidacion", /Bancolombia/);
  await dialogo().getByRole("button", { name: "Liquidar" }).click();
  await toast("Liquidación registrada").waitFor({ timeout: 20000 });
  await page.goto(`${B}/finanzas`);
  await esperar(() => cifra("Disponible en pesos"), disponible0 + 93996, "disponible tras liquidar exacto");
});
await paso("móvil 390 px (Bold)", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/finanzas/bold`); await m.waitForLoadState("networkidle");
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
  await m.screenshot({ path: `${S}/fc4-movil-bold.png`, fullPage: true });
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
