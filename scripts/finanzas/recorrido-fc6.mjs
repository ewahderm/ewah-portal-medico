// Recorrido de Flujo de caja FC6 (informe por actividades, exportes Excel
// y PDF, cierre de febrero con arqueo, mes cerrado bloqueado y reapertura)
// en navegador real. Parte de lo que dejan los recorridos anteriores
// (inicio el 1 de febrero del año en curso).
import { chromium } from "@playwright/test";
import { mkdirSync, statSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/fc6"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const toast = (t) => page.getByText(t).last();
const anio = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 4);
async function descargar(boton, extension) {
  const href = await boton.evaluate((el) => el.closest("a")?.getAttribute("href") ?? null);
  if (href) {
    const r = await page.request.get(`${B}${href}`);
    if (!r.ok()) throw new Error(`${href}: ${r.status()} ${(await r.text()).slice(0, 300)}`);
  }
  const [d] = await Promise.all([page.waitForEvent("download"), boton.click()]);
  const ruta = `${S}/${d.suggestedFilename()}`;
  await d.saveAs(ruta);
  if (!ruta.endsWith(extension) || statSync(ruta).size < 500) throw new Error(`descarga inválida: ${ruta}`);
  console.log(`   ${d.suggestedFilename()} (${statSync(ruta).size} bytes)`);
}
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("informe del mes por actividades", async () => {
  await page.goto(`${B}/finanzas/informe`);
  await page.getByText(/Flujo de efectivo · \w+ de \d{4}/).waitFor();
  for (const t of ["Actividades de operación", "Actividades de inversión", "Actividades de financiación", "Efectivo al inicio del periodo", "Efectivo al final del periodo"]) {
    await page.getByText(t, { exact: true }).first().waitFor();
  }
  await page.getByText("Abonos de la pasarela (cobros con tarjeta)").first().waitFor();
  await page.screenshot({ path: `${S}/fc6-informe.png`, fullPage: true });
});
await paso("rango de meses", async () => {
  await page.fill("#informeDesde", `${anio}-02`);
  await page.waitForURL(/desde=\d{4}-02/);
  await page.getByText(/febrero de \d{4} a \w+ de \d{4}/).waitFor();
  await page.getByText("Entradas y salidas por mes").waitFor();
});
await paso("exportes: Excel del informe y de movimientos, y PDF", async () => {
  await descargar(page.getByText("Informe en Excel"), ".xlsx");
  await descargar(page.getByText("Movimientos en Excel"), ".xlsx");
  await descargar(page.getByRole("button", { name: "PDF" }), ".pdf");
});
await paso("cerrar febrero con un faltante en el arqueo", async () => {
  await page.goto(`${B}/finanzas/cierre`);
  await page.getByText(`Cerrar febrero de ${anio}`).first().waitFor();
  const efectivo = page.locator("div.rounded-lg.border", { has: page.locator("input[id^=contado-]") }).first();
  const contado = efectivo.locator("input[id^=contado-]");
  const sistema = Number((await contado.inputValue()).replace(/\D/g, ""));
  await contado.fill(String(sistema - 1000));
  await efectivo.getByText(/Faltan \$\s?1\.000/).waitFor();
  await page.getByRole("button", { name: `Cerrar febrero de ${anio}` }).click();
  await page.getByText(/Explica la diferencia de/).waitFor();
  await efectivo.locator("input[id^=motivo-]").fill("Faltó un billete de mil en la caja");
  await page.getByRole("button", { name: `Cerrar febrero de ${anio}` }).click();
  await toast(`Febrero de ${anio} cerrado`).waitFor({ timeout: 20000 });
  await page.getByText(`Cerrar marzo de ${anio}`).first().waitFor();
  await page.getByText(/Arqueo .*: faltante de \$\s?1\.000/).waitFor();
  await page.screenshot({ path: `${S}/fc6-cierre.png`, fullPage: true });
});
await paso("un mes cerrado no admite movimientos", async () => {
  await page.goto(`${B}/finanzas`);
  await page.getByRole("button", { name: "Salió plata" }).first().click();
  const d = page.locator("[data-slot=dialog-content]").last();
  await d.locator("input[id^=monto-]").fill("10.000");
  await d.getByRole("radiogroup", { name: "Categoría", exact: true }).getByRole("radio", { name: /Arrendamiento/ }).click();
  await d.getByRole("radiogroup", { name: "Cuenta", exact: true }).getByRole("radio", { name: /Bancolombia/ }).click();
  await d.locator("input[id^=fecha-]").fill(`${anio}-02-15`);
  await d.getByRole("button", { name: "Registrar" }).click();
  await d.getByText(/El mes de 02\/\d{4} está cerrado/).waitFor();
  await d.getByRole("button", { name: "Cancelar" }).click();
});
await paso("reabrir febrero con motivo", async () => {
  await page.goto(`${B}/finanzas/cierre`);
  await page.getByRole("button", { name: "Reabrir" }).click();
  await page.fill("#motivoReabrir", "Falta registrar una factura de febrero");
  await page.locator("[data-slot=dialog-content]").getByRole("button", { name: "Reabrir" }).click();
  await toast(`Febrero de ${anio} reabierto`).waitFor();
  await page.getByText(`Cerrar febrero de ${anio}`).first().waitFor();
});
await paso("móvil 390 px (informe y cierre)", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  for (const ruta of ["/finanzas/informe", "/finanzas/cierre"]) {
    await m.goto(`${B}${ruta}`); await m.waitForLoadState("networkidle");
    const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    if (ancho > 390) throw new Error(`scroll horizontal ${ancho} en ${ruta}`);
    await m.screenshot({ path: `${S}/fc6-movil-${ruta.split("/").pop()}.png`, fullPage: true });
  }
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
