// Recorrido de F7 (documentos, trámite, suficiencia) y F8 (obligaciones,
// novedades, calendario) en navegador real contra el Supabase local
// (levantar.sh) con EWAH como IPS persona jurídica, D2, nueva, sede de 2003.
// Correr desde apps/web como recorrido-f5.mjs. Incluye la regresión de /citas.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/ewah-recorrido";
mkdirSync(`${S}/shots`, { recursive: true });
writeFileSync(`${S}/doc.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const renglon = (nombre) => page.locator("li", { has: page.getByText(nombre, { exact: true }) }).first();
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const haceDias = (n) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const subir = async (nombre, opciones = {}) => {
  await renglon(nombre).getByRole("button", { name: /Subir/ }).click();
  await page.setInputFiles("#archivo-doc", `${S}/doc.pdf`);
  if (opciones.expedicion) await page.fill("#fechaExpedicion", opciones.expedicion);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("heading", { name: /Subir|Versión nueva/ }).waitFor({ state: "hidden", timeout: 20000 });
};

await page.goto(`${B}/login`);
await page.fill('input[name="email"]', "admin@ewah.local");
await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await paso("checklist de IPS persona jurídica (sede 2003, IPS nueva)", async () => {
  await page.goto(`${B}/habilitacion/documentos`);
  await page.getByText(/Para radicar te faltan/).waitFor();
  for (const n of ["Copia del RUT", "Certificado de existencia y representación legal (≤ 30 días)", "Plan de ajustes de instalaciones eléctricas", "Estados financieros (constitución, intermedios o cierre)"]) {
    if (!(await renglon(n).count())) throw new Error(`falta ${n}`);
  }
  if (await page.getByText("Títulos de pregrado/posgrado (o convalidación MEN)", { exact: true }).count()) throw new Error("una IPS no debe pedir títulos del PI");
  console.log("  ", (await page.getByText(/Para radicar te faltan/).innerText()).replace(/\s+/g, " "));
});
await page.screenshot({ path: `${S}/shots/f7-1-checklist.png` });
await paso("subir RUT v1 y v2 (historial)", async () => {
  await subir("Copia del RUT");
  await renglon("Copia del RUT").getByText("Cargado").waitFor();
  await subir("Copia del RUT");
  await renglon("Copia del RUT").getByRole("button", { name: "2 versiones" }).waitFor();
});
await paso("certificado de existencia con 40 días = vencido para radicar", async () => {
  await subir("Certificado de existencia y representación legal (≤ 30 días)", { expedicion: haceDias(40) });
  await renglon("Certificado de existencia y representación legal (≤ 30 días)").getByText("Vencido").waitFor();
});
await paso("documento financiero (carpeta financiero/)", async () => {
  await subir("Estados financieros (constitución, intermedios o cierre)");
  await renglon("Estados financieros (constitución, intermedios o cierre)").getByText("Cargado").waitFor();
});
await paso("No aplica con justificación", async () => {
  await renglon("Plan hospitalario para emergencias").getByRole("button", { name: "No aplica" }).click();
  await page.getByLabel("Justificación").fill("La secretaría nos indicó que no aplica para consulta externa.");
  await page.getByRole("button", { name: "Marcar «No aplica»" }).click();
  await renglon("Plan hospitalario para emergencias").getByText("No aplica", { exact: true }).first().waitFor();
});
await paso("trámite: radicado y visita con subsanables (8 días hábiles)", async () => {
  for (const [tipo, sub] of [["Radiqué la solicitud", false], ["Se hizo la visita de verificación", true]]) {
    await page.getByRole("button", { name: "Registrar", exact: true }).first().click();
    await page.locator("#tipo-hito").click();
    await page.getByRole("option", { name: tipo }).click();
    if (sub) await page.getByText(/El acta dejó incumplimientos/).click();
    await page.getByRole("button", { name: "Registrar", exact: true }).last().click();
    await page.getByRole("heading", { name: "Registrar un paso del trámite" }).waitFor({ state: "hidden" });
  }
  await page.getByText(/Subsanar a más tardar el/).waitFor();
});
await paso("suficiencia patrimonial", async () => {
  const cifras = { patrimonioTotal: "600.000.000", capital: "1.000.000.000", mercantiles360: "0", laborales360: "0", pasivoCorriente: "80.000.000" };
  for (const [k, v] of Object.entries(cifras)) await page.fill(`#suf-${k}`, v);
  await page.getByText("Cumples los tres indicadores.").waitFor();
  await page.getByRole("button", { name: "Guardar estas cifras" }).click();
  await page.getByText("Cifras registradas").waitFor();
});
await page.screenshot({ path: `${S}/shots/f7-2-tramite.png`, fullPage: true });

await paso("obligaciones: presentar con radicado, anular y reabrir", async () => {
  await page.goto(`${B}/habilitacion/obligaciones`);
  await page.getByText(/Te aplican \(/).waitFor();
  const ft001 = page.locator("li", { has: page.getByText(/^FT001/) }).first();
  await ft001.getByText(/Próxima:/).click();
  await page.getByRole("button", { name: "Marcar como presentada" }).click();
  await page.fill("#radicado", "SIHO-2027-1");
  await page.getByRole("button", { name: "Marcar como presentada" }).click();
  await page.getByText("Presentación registrada").waitFor();
  await ft001.getByText(/presentada/).first().click();
  await page.getByRole("button", { name: "Anular y corregir" }).click();
  await page.fill("#motivo-oc", "Radicado digitado con error");
  await page.getByRole("button", { name: "Anular", exact: true }).click();
  await page.getByText(/registra la presentación correcta/).waitFor();
});
await paso("subsanación de la visita aparece en obligaciones", async () => {
  await page.reload();
  await page.locator("li", { has: page.getByText(/Subsanación/i) }).first().waitFor();
});
await paso("novedad: cierre temporal de un servicio", async () => {
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await page.locator("#novedad").click();
  await page.getByRole("option", { name: /cierre temporal/i }).first().click();
  await page.locator("#servicio-nov").click();
  await page.getByRole("option").nth(1).click();
  await page.getByRole("button", { name: "Registrar", exact: true }).last().click();
  await page.getByText("Novedad registrada").waitFor();
});
await page.screenshot({ path: `${S}/shots/f8-1-obligaciones.png` });

await paso("calendario mes y agenda", async () => {
  await page.goto(`${B}/habilitacion/calendario`);
  await page.locator(".rbc-month-view").waitFor();
  console.log("   eventos en el mes:", await page.locator(".rbc-event").count());
  await page.getByRole("button", { name: "Agenda" }).click();
  await page.waitForURL(/vista=agenda/);
  await page.locator(".rbc-agenda-view").waitFor();
});
await page.screenshot({ path: `${S}/shots/f8-2-calendario.png` });

await paso("resumen: ruta y lo urgente", async () => {
  await page.goto(`${B}/habilitacion`);
  await page.getByText("Tu ruta de habilitación").waitFor();
  const ruta = await page.locator("ol[aria-label='Ruta de habilitación']").innerText();
  console.log("  ", ruta.replace(/\s+/g, " ").slice(0, 400));
});
await page.screenshot({ path: `${S}/shots/f8-3-resumen.png`, fullPage: true });

await paso("regresión: /citas sigue mostrando la agenda", async () => {
  await page.goto(`${B}/citas`);
  await page.locator(".rbc-calendar").waitFor();
  await page.getByRole("button", { name: "Mes" }).click();
  await page.locator(".rbc-month-view").waitFor();
});

const movil = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
const pm = await movil.newPage();
for (const ruta of ["documentos", "obligaciones", "calendario"]) {
  await pm.goto(`${B}/habilitacion/${ruta}`);
  await pm.waitForLoadState("networkidle");
  const ancho = await pm.evaluate(() => document.documentElement.scrollWidth);
  console.log(`móvil ${ruta}: scrollWidth ${ancho}`);
  await pm.screenshot({ path: `${S}/shots/movil-${ruta}.png` });
}
console.log("errores de consola:", errores.length ? errores : "ninguno");
await browser.close();
