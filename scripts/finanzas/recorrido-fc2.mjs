// Recorrido de Flujo de caja FC2 (registrar, transferir, divisas, tarjeta
// del socio, préstamo, lista, filtros, soporte y anulación) en navegador
// real. Parte de lo que deja recorrido-fc1.mjs (efectivo $500.000, banco
// $12.000.000, dólares, tarjeta de Ana con deuda de $350.000).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/fc2"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
writeFileSync(`${S}/factura.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

const dialogo = () => page.locator("[data-slot=dialog-content]");
const disponible = async () => (await page.getByText("Disponible en pesos").locator("..").innerText()).match(/\$\s?([\d.]+)/)?.[1];
async function esperarDisponible(valor) {
  for (let i = 0; i < 40; i++) { if ((await disponible()) === valor) return; await page.waitForTimeout(250); }
  throw new Error(`disponible: ${await disponible()} (esperado ${valor})`);
}
const radio = (grupo, nombre) => dialogo().getByRole("radiogroup", { name: grupo, exact: true }).getByRole("radio", { name: nombre });
async function registrar({ boton, monto, categoria, cuenta, tercero, archivo, extra }) {
  await page.getByRole("button", { name: boton }).first().click();
  await dialogo().waitFor();
  await dialogo().locator("input[id^=monto-]").fill(monto);
  if (categoria) await radio("Categoría", categoria).click();
  await radio("Cuenta", cuenta).click();
  if (extra) await extra();
  if (tercero) await dialogo().getByLabel("Nombre de a quién").fill(tercero);
  if (archivo) await dialogo().locator("input[type=file]").setInputFiles(archivo);
  await dialogo().getByRole("button", { name: "Registrar" }).click();
}

await paso("salió plata: arriendo con factura", async () => {
  await page.goto(`${B}/finanzas`);
  const antes = await disponible();
  await registrar({ boton: "Salió plata", monto: "2.500.000", categoria: /Arrendamiento/, cuenta: /Bancolombia/, tercero: "Inmobiliaria Los Andes", archivo: `${S}/factura.pdf` });
  await page.getByText("Salida registrada").last().waitFor({ timeout: 20000 });
  let despues = antes;
  for (let i = 0; i < 40 && despues === antes; i++) { await page.waitForTimeout(250); despues = await disponible(); }
  console.log(`   disponible ${antes} → ${despues}`);
  // 12.580.000 incluye los $80.000 de la Nequi inactiva (una cuenta inactiva con saldo sigue contando).
  if (despues !== "10.080.000") throw new Error(`disponible tras el arriendo: ${despues}`);
  await page.getByText("Arrendamiento").first().waitFor();
});
await paso("validaciones del formulario", async () => {
  await page.getByRole("button", { name: "Salió plata" }).first().click();
  await dialogo().getByRole("button", { name: "Registrar" }).click();
  await dialogo().getByText("Escribe cuánto fue.").waitFor();
  await dialogo().locator("input[id^=monto-]").fill("1.000");
  await dialogo().getByRole("button", { name: "Registrar" }).click();
  await dialogo().getByText(/en qué se gastó/).waitFor();
  await dialogo().getByRole("button", { name: "Cancelar" }).click();
  await dialogo().waitFor({ state: "detached" });
});
await paso("gasto con la tarjeta del socio aumenta su deuda", async () => {
  await registrar({ boton: "Salió plata", monto: "480.000", categoria: /Prepagada/, cuenta: /Tarjeta de Ana/,
    extra: async () => dialogo().getByText(/quedará debiendo este gasto a Ana/).waitFor() });
  await page.getByText("Salida registrada").last().waitFor();
  await page.getByText(/Se le debe \$\s?830\.000/).waitFor();
});
await paso("entró plata en efectivo", async () => {
  await registrar({ boton: "Entró plata", monto: "150.000", categoria: /Otros ingresos/, cuenta: /^Efectivo/ });
  await page.getByText("Entrada registrada").last().waitFor();
  await esperarDisponible("10.230.000");
});
await paso("consignar efectivo en el banco (no cambia lo disponible)", async () => {
  const antes = await disponible();
  await page.getByRole("button", { name: "Pasar entre cuentas" }).click();
  await dialogo().locator("input[id^=monto-]").fill("300.000");
  await radio("Cuenta", /^Efectivo/).click();
  await radio("Cuenta destino", /Bancolombia/).click();
  await dialogo().getByRole("button", { name: "Registrar" }).click();
  await page.getByText("Transferencia registrada").last().waitFor();
  await page.waitForTimeout(500);
  if ((await disponible()) !== antes) throw new Error(`una transferencia cambió lo disponible: ${antes} → ${await disponible()}`);
});
await paso("gasto en dólares con tasa digitada", async () => {
  await registrar({ boton: "Salió plata", monto: "20", categoria: /Software/, cuenta: /Dólares/, extra: async () => {
    await dialogo().locator("input[id^=tasa-]").fill("4.123,45");
    await dialogo().getByText(/Equivale a \$\s?82\.469/).waitFor();
  } });
  await page.getByText("Salida registrada").last().waitFor();
});
await paso("préstamo a socio exige el socio", async () => {
  await page.getByRole("button", { name: "Salió plata" }).first().click();
  await dialogo().locator("input[id^=monto-]").fill("1.000.000");
  await radio("Categoría", /Préstamo a socio/).click();
  await radio("Cuenta", /Bancolombia/).click();
  await dialogo().getByRole("button", { name: "Registrar" }).click();
  await dialogo().getByText("Elige el socio.").waitFor();
  await dialogo().locator("input[id^=socio-]").click();
  await page.getByRole("option", { name: /Ana María Socia/ }).click();
  await dialogo().getByRole("button", { name: "Registrar" }).click();
  await page.getByText("Salida registrada").last().waitFor();
});
await page.screenshot({ path: `${S}/fc2-tablero.png`, fullPage: true });
await paso("lista del mes, filtro y soporte firmado", async () => {
  await page.goto(`${B}/finanzas/movimientos`);
  await page.getByText(/Movimientos de/).waitFor();
  await page.getByText("Inmobiliaria Los Andes").first().waitFor();
  await page.getByRole("combobox", { name: "Tipo" }).click();
  await page.getByRole("option", { name: "Entre cuentas" }).click();
  await page.waitForURL(/tipo=transferencia/);
  await page.getByText(/Efectivo → Bancolombia/).waitFor();
  if (await page.getByText("Inmobiliaria Los Andes").count()) throw new Error("el filtro no filtra");
  await page.getByRole("button", { name: "Quitar filtros" }).click();
  await page.getByText("Inmobiliaria Los Andes").first().waitFor();
  let url = null;
  await page.exposeFunction("__capturar", (u) => { url = u; });
  await page.evaluate(() => { window.open = (u) => { window.__capturar(String(u)); return null; }; });
  await page.getByRole("button", { name: /factura\.pdf/ }).click();
  for (let i = 0; i < 20 && !url; i++) await page.waitForTimeout(250);
  if (!url || !url.includes("/storage/v1/object/sign/finanzas/")) throw new Error(`url: ${url}`);
  if ((await page.request.get(url)).status() !== 200) throw new Error("descarga del soporte");
});
await paso("anular con motivo deja el movimiento inverso", async () => {
  const fila = page.locator("li", { has: page.getByText("Inmobiliaria Los Andes") }).first();
  await fila.getByRole("button", { name: "Anular" }).click();
  if (await dialogo().getByRole("button", { name: "Anular" }).isEnabled()) throw new Error("anula sin motivo");
  await dialogo().getByRole("textbox").fill("Se registró con el valor equivocado");
  await dialogo().getByRole("button", { name: "Anular" }).click();
  await page.getByText("Movimiento anulado").waitFor();
  await page.getByText("Anulado", { exact: true }).first().waitFor();
  await page.getByText("Anulación", { exact: true }).first().waitFor();
});
await page.screenshot({ path: `${S}/fc2-movimientos.png`, fullPage: true });
await paso("móvil 390 px (tablero, lista y formulario)", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  for (const ruta of ["/finanzas", "/finanzas/movimientos"]) {
    await m.goto(`${B}${ruta}`); await m.waitForLoadState("networkidle");
    const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    if (ancho > 390) throw new Error(`scroll horizontal ${ancho} en ${ruta}`);
  }
  await m.getByRole("button", { name: "Salió plata" }).first().click();
  await m.locator("[data-slot=dialog-content]").waitFor();
  await m.screenshot({ path: `${S}/fc2-movil-form.png`, fullPage: true });
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho} en el formulario`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
