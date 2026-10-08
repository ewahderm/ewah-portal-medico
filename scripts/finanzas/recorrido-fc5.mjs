// Recorrido de Flujo de caja FC5 (socios: reembolso parcial de la tarjeta,
// tope, préstamos en ambos sentidos, devoluciones y anulación) en navegador
// real. Parte de lo que dejan los recorridos anteriores: Ana María Socia con
// deuda en su tarjeta.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/fc5"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (sel, texto) => { await page.locator(sel).click(); await page.getByRole("option", { name: texto }).first().click(); };
const dialogo = () => page.locator("[data-slot=dialog-content]").filter({ has: page.locator("form") }).last();
const toast = (t) => page.getByText(t).last();
const pesos = (t) => Number((t.match(/\$\s?([\d.]+)/)?.[1] ?? "0").replaceAll(".", ""));
const ana = () => page.locator("[data-slot=card]", { hasText: "Ana María Socia" }).first();
const dato = async (titulo) => pesos(await ana().getByText(titulo).locator("..").innerText());
async function esperar(fn, valor, que) {
  for (let i = 0; i < 40; i++) { if ((await fn()) === valor) return; await page.waitForTimeout(250); }
  throw new Error(`${que}: ${await fn()} (esperado ${valor})`);
}
async function operar(boton, monto) {
  await ana().getByRole("button", { name: boton }).click();
  await dialogo().waitFor();
  await elegir("#cuentaSocio", /Bancolombia/);
  if (monto) await page.fill("#montoSocio", monto);
  await dialogo().getByRole("button", { name: /Reembolsar|Registrar/ }).click();
}
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

let deuda0;
await paso("la ficha de Ana muestra lo que se le debe", async () => {
  await page.goto(`${B}/finanzas`);
  await page.getByText("Se les debe a los socios").click();
  await page.waitForURL(/\/finanzas\/socios/);
  deuda0 = await dato("Gastos con su tarjeta por reembolsar");
  console.log(`   deuda de la tarjeta: ${deuda0}`);
  if (deuda0 <= 300000) throw new Error("se esperaba deuda en la tarjeta de Ana");
  await page.getByText(/art\. 35 del Estatuto Tributario/).waitFor();
  await page.screenshot({ path: `${S}/fc5-socios.png`, fullPage: true });
});
await paso("no se reembolsa de más", async () => {
  await ana().getByRole("button", { name: "Reembolsar tarjeta" }).click();
  await dialogo().waitFor();
  if (Number((await page.locator("#montoSocio").inputValue()).replace(/\D/g, "")) !== deuda0) throw new Error("el valor no viene de la deuda");
  await elegir("#cuentaSocio", /Bancolombia/);
  await page.fill("#montoSocio", String(deuda0 + 1));
  await dialogo().getByRole("button", { name: "Reembolsar" }).click();
  await dialogo().getByText("No puede ser más de lo pendiente.").waitFor();
  await dialogo().getByRole("button", { name: "Cancelar" }).click();
  await dialogo().waitFor({ state: "detached" });
});
await paso("reembolso parcial", async () => {
  await operar("Reembolsar tarjeta", "300.000");
  await toast("Registrado").waitFor();
  await esperar(() => dato("Gastos con su tarjeta por reembolsar"), deuda0 - 300000, "deuda tras reembolsar");
  await ana().getByText("Reembolso a socio").first().waitFor();
});
await paso("Ana le presta a la clínica y se le devuelve una parte", async () => {
  const antes = await dato("Préstamos que nos hizo");
  await operar("Nos presta", "2.000.000");
  await toast("Registrado").waitFor();
  await esperar(() => dato("Préstamos que nos hizo"), antes + 2000000, "préstamo del socio");
  await operar("Le devolvemos", "500.000");
  await toast("Registrado").last().waitFor();
  await esperar(() => dato("Préstamos que nos hizo"), antes + 1500000, "tras devolverle");
});
await paso("préstamo a Ana y su devolución", async () => {
  const antes = await dato("Préstamos que le hicimos");
  await operar("Prestarle", "1.000.000");
  await esperar(() => dato("Préstamos que le hicimos"), antes + 1000000, "préstamo a Ana");
  await operar("Nos devuelve", "250.000");
  await esperar(() => dato("Préstamos que le hicimos"), antes + 750000, "tras su devolución");
});
await paso("anular el reembolso devuelve la deuda", async () => {
  const fila = ana().locator("li", { hasText: "Reembolso a socio" }).first();
  await fila.getByRole("button", { name: "Anular" }).click();
  await page.locator("[data-slot=dialog-content] textarea").fill("El reembolso se hizo por otra cuenta");
  await page.locator("[data-slot=dialog-content]").getByRole("button", { name: "Anular" }).click();
  await toast("Movimiento anulado").waitFor();
  await esperar(() => dato("Gastos con su tarjeta por reembolsar"), deuda0, "deuda tras anular");
});
await paso("móvil 390 px (socios)", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/finanzas/socios`); await m.waitForLoadState("networkidle");
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
  await m.screenshot({ path: `${S}/fc5-movil-socios.png`, fullPage: true });
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
