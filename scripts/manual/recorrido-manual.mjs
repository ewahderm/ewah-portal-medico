// Recorrido del módulo Manual en navegador real: índice, buscador, guía con
// sus capturas, navegación anterior/siguiente y móvil a 390 px.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/manual"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
let esperar404 = false;
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color") && !(esperar404 && m.text().includes("404"))) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("el Manual está en el menú y lista las guías por grupo", async () => {
  await page.getByRole("link", { name: "Manual", exact: true }).first().click();
  await page.waitForURL(/\/manual$/);
  await page.getByRole("heading", { name: "Manual de EWAH" }).waitFor();
  for (const g of ["Primeros pasos", "Atención", "Flujo de caja", "Cumplimiento"]) await page.getByRole("heading", { name: g, exact: true }).waitFor();
  const n = await page.locator("a[href^='/manual/']").count();
  if (n !== 18) throw new Error(`se esperaban 18 guías, hay ${n}`);
  await page.screenshot({ path: `${S}/manual-indice.png`, fullPage: true });
});
await paso("el buscador encuentra sin tildes", async () => {
  await page.fill("#buscarManual", "liquidacion bold");
  await page.getByRole("link", { name: /Cobros de tratamientos y Bold/ }).waitFor();
  if ((await page.locator("a[href^='/manual/']").count()) !== 1) throw new Error("el buscador no filtró");
  await page.fill("#buscarManual", "zzzz");
  await page.getByText("No encontramos guías con esas palabras.").waitFor();
  await page.fill("#buscarManual", "");
});
await paso("una guía con tabla de contenido, capturas y siguiente", async () => {
  await page.getByRole("link", { name: /Agenda y citas/ }).click();
  await page.waitForURL(/\/manual\/agenda$/);
  await page.getByRole("heading", { name: "Agenda y citas", level: 1 }).waitFor();
  await page.getByRole("navigation", { name: "En esta guía" }).getByRole("link", { name: "Agenda una cita" }).click();
  await page.waitForURL(/#nueva-cita$/);
  const imagenes = page.locator("article img");
  await imagenes.first().scrollIntoViewIfNeeded();
  for (let i = 0; i < (await imagenes.count()); i++) {
    await imagenes.nth(i).scrollIntoViewIfNeeded();
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await imagenes.nth(i).elementHandle());
  }
  await page.getByText("Ir al módulo").waitFor();
  await page.screenshot({ path: `${S}/manual-guia.png`, fullPage: true });
  await page.getByRole("link", { name: /Atenciones: anamnesis/ }).last().click();
  await page.waitForURL(/\/manual\/atenciones$/);
});
await paso("todas las guías abren y sus imágenes cargan", async () => {
  await page.goto(`${B}/manual`);
  const enlaces = await page.locator("a[href^='/manual/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const href of enlaces) {
    await page.goto(`${B}${href}`);
    await page.locator("article").waitFor();
    await page.waitForLoadState("networkidle");
    // next/image las carga perezosas: se lleva cada una a la vista y se espera.
    const imgs = page.locator("article img");
    for (let i = 0; i < (await imgs.count()); i++) {
      await imgs.nth(i).scrollIntoViewIfNeeded();
      await imgs.nth(i).evaluate((el) => (el.complete ? null : new Promise((r) => { el.onload = r; el.onerror = r; setTimeout(r, 15000); })));
    }
    const rotas = await imgs.evaluateAll((todas) => todas.filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")));
    if (rotas.length) throw new Error(`${href}: imágenes rotas ${rotas.join(", ")}`);
  }
  console.log(`   ${enlaces.length} guías revisadas`);
});
await paso("guía inexistente da 404", async () => {
  esperar404 = true;
  const r = await page.goto(`${B}/manual/no-existe`);
  esperar404 = false;
  if (r?.status() !== 404) throw new Error(`status ${r?.status()}`);
});
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  for (const ruta of ["/manual", "/manual/flujo-de-caja"]) {
    await m.goto(`${B}${ruta}`); await m.waitForLoadState("networkidle");
    const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    if (ancho > 390) throw new Error(`scroll horizontal ${ancho} en ${ruta}`);
  }
  await m.screenshot({ path: `${S}/manual-movil.png`, fullPage: false });
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
