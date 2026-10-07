// Recorrido de SG-SST F1 en navegador real contra el Supabase local
// (levantar.sh + personal de prueba en RRHH). Correr desde apps/web:
//   cp ../../scripts/sgsst/recorrido-sst1.mjs . && node recorrido-sst1.mjs /tmp/sst; rm recorrido-sst1.mjs
import { chromium } from "@playwright/test";
const S = process.argv[2]; const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));
await page.goto(`${B}/sst`);
await page.getByText("Qué te exige la norma").waitFor();
console.log("inicial:", (await page.locator("text=Qué te exige la norma").locator("..").innerText()).replace(/\s+/g, " ").slice(0, 200));
await page.screenshot({ path: `${S}/sst-1-inicial.png`, fullPage: true });
await page.fill("#codigoActividad", "3862101");
await page.getByRole("button", { name: "Guardar" }).click();
await page.getByText(/aplican 7 estándares/).waitFor({ timeout: 15000 });
console.log("con código:", await page.getByText(/aplican 7 estándares/).innerText());
// excluir contratistas sin justificación → error
await page.getByText("No contar a los contratistas").click();
await page.fill("#justificacionExclusion", "corta");
await page.getByRole("button", { name: "Guardar" }).click();
// minLength=10: el navegador bloquea el envío (la action y la BD lo exigen igual).
if (!(await page.locator("#justificacionExclusion").evaluate((el) => el.matches(":invalid")))) throw new Error("aceptó una justificación corta");
console.log("validación de justificación OK");
await page.fill("#otrosTrabajadores", "9");
await page.getByText("No contar a los contratistas").click();
await page.getByRole("button", { name: "Guardar" }).click();
await page.getByText(/de 11 a 50 aplican 21/).waitFor({ timeout: 15000 });
console.log("con 9 fuera de RRHH:", await page.getByText(/de 11 a 50 aplican 21/).innerText());
await page.screenshot({ path: `${S}/sst-2-21.png`, fullPage: true });
await page.getByRole("radio", { name: /Trabajo solo/ }).click();
await page.fill("#otrosTrabajadores", "0");
await page.getByRole("button", { name: "Guardar" }).click();
await page.waitForTimeout(1500);
const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
await m.goto(`${B}/sst`); await m.getByText("Qué te exige la norma").waitFor();
const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
console.log("móvil scrollWidth", ancho); await m.screenshot({ path: `${S}/sst-3-movil.png`, fullPage: true });
await page.goto(`${B}/dashboard`); console.log("launcher SG-SST:", await page.getByText("SG-SST").count() > 0);
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (ancho > 390 || errores.length) process.exit(1);
