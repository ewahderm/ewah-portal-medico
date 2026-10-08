// Recorrido de Flujo de caja FC1 (asistente de arranque y configuración) en
// navegador real contra el Supabase local de
// scripts/habilitacion/supabase-local/levantar.sh. Correr desde apps/web:
//   cp ../../scripts/finanzas/recorrido-fc1.mjs . && node recorrido-fc1.mjs /tmp/fc1
// Parte de una clínica sin flujo de caja activado (BD limpia).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/fc1"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (sel, texto) => { await page.locator(sel).click(); await page.getByRole("option", { name: texto }).first().click(); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("menú y launcher llevan al flujo de caja", async () => {
  await page.goto(`${B}/dashboard`);
  await page.locator('a[href="/finanzas"]').first().waitFor();
  await page.goto(`${B}/finanzas`);
  await page.getByText("Empecemos con tu flujo de caja").waitFor();
});
await paso("asistente: fecha futura rechazada", async () => {
  await page.fill("#fechaInicio", "2099-01-01");
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByText(/no puede ser futura/).waitFor();
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  await page.fill("#fechaInicio", `${hoy.slice(0, 4)}-01-01`);
  await page.getByRole("button", { name: /Siguiente/ }).click();
});
await page.getByText(/Registra a los socios|¿Por dónde se mueve la plata/).first().waitFor();
const pro = await page.getByText("Registra a los socios").count();
console.log(`   plan ${pro ? "Pro" : "Gratis"}`);
if (pro) {
  await paso("asistente: socios", async () => {
    await page.getByRole("button", { name: "Agregar socio" }).click();
    await page.locator("input[id^=socioNombre-]").fill("Ana María Socia");
    await page.locator("input[id^=socioId-]").fill("52123456");
    await page.locator("input[id^=socioPct-]").fill("60 %");
    await page.getByRole("button", { name: /Siguiente/ }).click();
  });
}
await paso("asistente: cuentas con saldos (formato colombiano y dólares)", async () => {
  await page.getByText("¿Por dónde se mueve la plata").waitFor();
  const saldos = page.locator("input[id^=cuentaSaldo-]");
  await saldos.nth(0).fill("500.000");
  await page.locator("input[id^=cuentaNombre-]").nth(1).fill("Bancolombia ahorros");
  await saldos.nth(1).fill("12.000.000");
  // El saldo digitado sobrevive a ir y volver de paso; vacío = 0.
  await page.getByRole("button", { name: /Atrás/ }).click();
  await page.getByRole("button", { name: /Siguiente|Saltar/ }).click();
  if ((await page.locator("input[id^=cuentaSaldo-]").nth(1).inputValue()) !== "12.000.000") throw new Error("se perdió el saldo al volver");
  await page.getByRole("button", { name: "Agregar cuenta" }).click();
  await elegir("input[id^=cuentaTipo-] >> nth=2", "Efectivo");
  await page.locator("input[id^=cuentaNombre-]").nth(2).fill("Dólares");
  await elegir("input[id^=cuentaMoneda-] >> nth=1", "Dólares (USD)");
  await page.locator("input[id^=cuentaSaldo-]").nth(2).fill("200");
  if (pro) {
    await page.getByRole("button", { name: "Agregar cuenta" }).click();
    await elegir("input[id^=cuentaTipo-] >> nth=3", "Tarjeta de crédito de socio");
    await page.locator("input[id^=cuentaNombre-]").nth(3).fill("Tarjeta de Ana");
    await elegir("input[id^=cuentaSocio-]", "Ana María Socia");
    await page.locator("input[id^=cuentaSaldo-]").nth(3).fill("350.000");
    // Quitar al socio con tarjeta no la borra en silencio.
    await page.getByRole("button", { name: /Atrás/ }).click();
    await page.getByRole("button", { name: "Quitar socio 1" }).click();
    await page.getByText(/tiene una tarjeta en el paso de cuentas/).waitFor();
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.getByText("¿Por dónde se mueve la plata").waitFor();
    if ((await page.locator("input[id^=cuentaNombre-]").nth(3).inputValue()) !== "Tarjeta de Ana") throw new Error("se perdió la tarjeta del socio");
  }
  await page.locator("input[id^=cuentaSaldo-]").nth(0).fill("abc");
  await page.getByText(/Escribe un número/).waitFor();
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await page.getByText(/Revisa el saldo de: Efectivo/).waitFor();
  await page.locator("input[id^=cuentaSaldo-]").nth(0).fill("500.000");
  await page.getByRole("button", { name: /Siguiente/ }).click();
});
await paso("asistente: confirmar y activar", async () => {
  await page.getByText(/Empiezas el/).waitFor();
  await page.getByText(/12\.000\.000/).first().waitFor();
  await page.getByRole("button", { name: "Activar flujo de caja" }).click();
  await page.getByText("Flujo de caja activado").waitFor({ timeout: 20000 });
  await page.getByText("Disponible en pesos").waitFor();
  const disponible = await page.getByText("Disponible en pesos").locator("..").innerText();
  if (!disponible.includes("12.500.000")) throw new Error(`disponible: ${disponible}`);
  if (pro) await page.getByText(/Se le debe .*350\.000/).waitFor();
});
await page.screenshot({ path: `${S}/fc1-tablero.png`, fullPage: true });
await paso("configuración: nueva cuenta y desactivar", async () => {
  await page.goto(`${B}/finanzas/configuracion?tab=cuentas`);
  await page.getByRole("button", { name: "Nueva cuenta" }).click();
  await elegir("#tipoCuenta", "Nequi");
  await page.fill("#nombreCuenta", "Nequi de la clínica");
  await page.fill("#saldoCuenta", "80.000");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Cuenta creada").waitFor();
  await page.getByRole("switch", { name: "Desactivar Nequi de la clínica" }).click();
  await page.getByRole("switch", { name: "Activar Nequi de la clínica" }).waitFor();
  await page.getByRole("button", { name: "Nueva cuenta" }).click();
  await page.fill("#nombreCuenta", "bancolombia ahorros");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText(/Ya existe una cuenta con ese nombre/).waitFor();
  await page.keyboard.press("Escape");
});
await paso("configuración: renombrar y crear categoría", async () => {
  await page.goto(`${B}/finanzas/configuracion?tab=categorias`);
  await page.getByRole("button", { name: "Renombrar Gasolina" }).click();
  await page.getByLabel("Nuevo nombre de Gasolina").fill("Combustible");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText(/antes "Gasolina"/).waitFor();
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  await page.fill("#nombreCategoria", "Papelería");
  await page.getByRole("button", { name: "Crear" }).click();
  await page.getByText("Categoría creada").waitFor();
  await page.getByText("Papelería").first().waitFor();
  if (await page.getByRole("switch", { name: /Comisión pasarela/ }).count()) throw new Error("una automática se puede desactivar");
});
if (pro) {
  await paso("configuración: socio no supera el 100 %", async () => {
    await page.goto(`${B}/finanzas/configuracion?tab=socios`);
    await page.getByRole("button", { name: "Nuevo socio" }).click();
    await page.fill("#nombreSocio", "Luis Socio");
    await page.fill("#numeroSocio", "79123456");
    await page.fill("#pctSocio", "50");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByText(/más del 100/).waitFor();
    await page.fill("#pctSocio", "40");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByText("Socio creado").waitFor();
  });
}
await paso("configuración: cambiar la fecha de inicio", async () => {
  await page.goto(`${B}/finanzas/configuracion`);
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  await page.fill("#fechaInicioConfig", `${hoy.slice(0, 4)}-02-01`);
  if (await page.getByRole("button", { name: "Cambiar fecha" }).isEnabled()) throw new Error("cambia la fecha sin motivo");
  await page.fill("#motivoFecha", "Empezamos a registrar desde febrero");
  await page.getByRole("button", { name: "Cambiar fecha" }).click();
  await page.getByText("Fecha de inicio actualizada").waitFor();
  await page.getByText(/Cambios anteriores/).waitFor();
  await page.getByText(/Empezamos a registrar desde febrero/).waitFor();
});
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  for (const ruta of ["/finanzas", "/finanzas/configuracion?tab=cuentas", "/finanzas/configuracion?tab=categorias"]) {
    await m.goto(`${B}${ruta}`); await m.waitForLoadState("networkidle");
    const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    if (ancho > 390) throw new Error(`scroll horizontal ${ancho} en ${ruta}`);
  }
  await m.goto(`${B}/finanzas`); await m.screenshot({ path: `${S}/fc1-movil.png`, fullPage: true });
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
