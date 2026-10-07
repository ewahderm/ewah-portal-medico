// Recorrido de SG-SST F8 (tablero de pendientes, insignia del menú y cron)
// en navegador real contra el Supabase local. Correr desde apps/web.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/sst"; const B = "http://localhost:3000";
mkdirSync(S, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (id, texto) => { await page.locator(`#${id}`).click(); await page.getByRole("option", { name: texto }).first().click(); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

// La insignia va en el ítem SG-SST del menú "Operación" (desplegable).
const insignia = async () => {
  await page.getByRole("button", { name: /^Operación/ }).first().click();
  const item = page.getByRole("menuitem", { name: /SG-SST/ });
  await item.waitFor();
  const t = await item.textContent();
  await page.keyboard.press("Escape");
  const m = t.match(/(\d+)/); return m ? Number(m[1]) : 0;
};
let antes = 0;
await paso("tablero de pendientes en Diagnóstico", async () => {
  await page.goto(`${B}/sst`);
  await page.getByText("Pendientes", { exact: true }).waitFor();
  antes = await insignia();
  console.log(`   insignia antes: ${antes}`);
});
await paso("un accidente sin reportar aparece arriba en rojo y sube la insignia", async () => {
  await page.goto(`${B}/sst/eventos`);
  await page.getByRole("button", { name: "Reportar un evento" }).click();
  await elegir("empleadoId", /./);
  await page.fill("#resumen", "Caída en el pasillo húmedo de consulta externa");
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.waitForURL(/\/sst\/eventos\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await page.goto(`${B}/sst`);
  const primero = page.locator("ul li a").filter({ hasText: "Reportar el accidente a la ARL y la EPS" }).first();
  await primero.waitFor();
  await primero.getByText(/2 días hábiles/).waitFor();
  const despues = await insignia();
  console.log(`   insignia después: ${despues}`);
  if (despues <= antes) throw new Error("la insignia no subió");
});
await page.screenshot({ path: `${S}/sst8-tablero.png`, fullPage: true });
await paso("el cron responde con la sección de SG-SST", async () => {
  const env = readFileSync(".env.local", "utf8");
  const secreto = env.match(/^CRON_SECRET=(.*)$/m)?.[1]?.replace(/^"|"$/g, "");
  if (!secreto) { console.log("   (sin CRON_SECRET local: se omite)"); return; }
  const r = await fetch(`${B}/api/cron/diario`, { headers: { authorization: `Bearer ${secreto}` } });
  const j = await r.json();
  if (!("sst" in j)) throw new Error(JSON.stringify(j));
  console.log(`   ${JSON.stringify(j.sst)}`);
});
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/sst`); await m.getByText("Pendientes", { exact: true }).waitFor();
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: `${S}/sst8-movil.png`, fullPage: true });
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
