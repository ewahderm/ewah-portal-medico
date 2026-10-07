// Recorrido de SG-SST F5 (matriz de peligros) en navegador real contra el
// Supabase local. Correr desde apps/web: cp ../../scripts/sgsst/recorrido-sst5.mjs . && node recorrido-sst5.mjs /tmp/sst
import { chromium } from "@playwright/test";
const S = process.argv[2] ?? "/tmp/sst"; const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (sel, texto) => { await page.locator(sel).click(); await page.getByRole("option", { name: texto }).click(); };
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("agregar desde plantilla y ver la valoración en vivo", async () => {
  await page.goto(`${B}/sst/peligros`);
  await page.getByRole("button", { name: "Agregar peligro" }).click();
  await elegir("#plantilla", /Pinchazos y cortes/);
  if ((await page.inputValue("#descripcionPeligro")) !== "Pinchazos y cortes con material cortopunzante contaminado") throw new Error("la plantilla no llenó el peligro");
  await page.getByText(/Nivel II · NR 450/).waitFor();
  await elegir("#nd", "Muy alto (10)");
  await page.getByText(/Nivel I · NR 750/).waitFor();
  await page.fill("#expuestos", "4");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Peligro agregado").waitFor();
});
await paso("aviso de no aceptable sin medidas y agregar una medida", async () => {
  await page.getByText(/no aceptable sin medidas/).waitFor();
  await page.getByRole("button", { name: /^Medidas/ }).first().click();
  await page.getByRole("button", { name: "Agregar acción" }).click();
  await page.locator("textarea[id^=descripcionAccion]").fill("Cambiar a agujas con dispositivo de seguridad");
  await elegir("[id^=jerarquia-]", "Control de ingeniería");
  await elegir("[id^=responsableId-]", "Admin Local");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByText("Acción agregada").waitFor();
  await page.waitForTimeout(800);
  if (await page.getByText(/no aceptable sin medidas/).count()) throw new Error("sigue el aviso");
  await page.getByText(/Control de ingeniería · Admin Local/).waitFor();
});
await page.screenshot({ path: `${S}/sst5-matriz.png`, fullPage: true });
await paso("editar recalcula y retirar con motivo", async () => {
  await page.getByRole("button", { name: "Editar" }).first().click();
  await elegir("#ne", "Esporádica (1)");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Peligro actualizado").waitFor();
  await page.getByText(/Nivel II · NR 250/).first().waitFor();
});
await paso("móvil 390 px", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${B}/sst/peligros`); await m.getByText("Matriz de peligros").first().waitFor();
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  await m.screenshot({ path: `${S}/sst5-movil.png`, fullPage: true });
  if (ancho > 390) throw new Error(`scroll horizontal ${ancho}`);
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
