// Recorrido de Flujo de caja FC3 (ingresos desde tratamientos) en navegador
// real. Parte de lo que dejan recorrido-fc1/fc2. Los tratamientos se
// siembran por SQL en el Supabase LOCAL con la sesión del administrador (el
// trigger corre igual que desde la app); la pantalla de tratamientos tiene
// su propia regresión.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const S = process.argv[2] ?? "/tmp/fc3"; const B = "http://localhost:3000";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
mkdirSync(S, { recursive: true });
const sql = (q) => execFileSync("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", DB, "-c", q], { encoding: "utf8" }).trim();

// Paciente y atención de prueba.
sql(`insert into pacientes (clinica_id, primer_nombre, primer_apellido, numero_identificacion)
  select clinica_id, 'Lucía', 'Recorrido', 'RECORRIDO-FC3' from usuarios where email = 'admin@ewah.local'`);
sql(`insert into atenciones (clinica_id, paciente_id, profesional_id, fecha)
  select u.clinica_id, p.id, u.id, (now() at time zone 'America/Bogota')::date from usuarios u, pacientes p
  where u.email = 'admin@ewah.local' and p.numero_identificacion = 'RECORRIDO-FC3'`);
// Registra un tratamiento de hoy con el medio de pago dado (por código).
const tratamiento = (medio, costo) => sql(`
  select set_config('request.jwt.claims', json_build_object('sub', (select id from usuarios where email = 'admin@ewah.local'), 'role', 'authenticated')::text, false);
  insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, notas, created_by)
  select u.clinica_id, p.id, (select id from tipos_tratamiento where clinica_id = u.clinica_id and nombre like 'Toxina%' limit 1), u.id, a.id,
    (now() at time zone 'America/Bogota')::date, ${costo}, (select id from sedes where clinica_id = u.clinica_id order by orden limit 1),
    (select id from medios_pago where clinica_id = u.clinica_id and codigo = '${medio}'), 'recorrido-fc3', u.id
  from usuarios u join pacientes p on p.numero_identificacion = 'RECORRIDO-FC3' join atenciones a on a.paciente_id = p.id
  where u.email = 'admin@ewah.local' returning id`).split("\n").pop();

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage(); const errores = [];
page.on("pageerror", (e) => errores.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color")) errores.push(m.text()); });
const paso = async (n, f) => { const t = Date.now(); await f(); console.log(`OK ${n} (${Date.now() - t} ms)`); };
const elegir = async (sel, texto) => { await page.locator(sel).click(); await page.getByRole("option", { name: texto }).first().click(); };
const dialogo = () => page.locator("[data-slot=dialog-content]");
const toast = (t) => page.getByText(t).last();
const pesos = (t) => Number((t.match(/\$\s?([\d.]+)/)?.[1] ?? "0").replaceAll(".", ""));
const disponible = async () => pesos(await page.getByText("Disponible en pesos").locator("..").innerText());
async function esperar(fn, valor, que) {
  for (let i = 0; i < 40; i++) { if ((await fn()) === valor) return; await page.waitForTimeout(250); }
  throw new Error(`${que}: ${await fn()} (esperado ${valor})`);
}
await page.goto(`${B}/login`); await page.fill('input[name="email"]', "admin@ewah.local"); await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));

let base;
await paso("tratamientos sin medio configurado quedan por revisar", async () => {
  tratamiento("EFECTIVO", 120000);
  tratamiento("OTRO", 50000);
  await page.goto(`${B}/finanzas`);
  base = await disponible();
  await page.getByText(/2 tratamientos necesitan atención/).waitFor();
  await page.getByRole("link", { name: "Revisar" }).click();
  await page.waitForURL(/\/finanzas\/cobros/);
  await page.getByText("Medio de pago sin cuenta").waitFor();
  await page.getByText(/Lucía Recorrido/).first().waitFor();
  await page.screenshot({ path: `${S}/fc3-cobros-sin-medios.png`, fullPage: true });
});
await paso("cuenta de pasarela (Bold) para la tarjeta", async () => {
  await page.goto(`${B}/finanzas/configuracion?tab=cuentas`);
  await page.getByRole("button", { name: "Nueva cuenta" }).click();
  await elegir("#tipoCuenta", /Bold|pasarela/i);
  await page.fill("#nombreCuenta", "Bold por abonar");
  await dialogo().getByRole("button", { name: /Guardar|Crear/ }).click();
  await toast("Cuenta creada").waitFor();
});
await paso("asignar cuentas a los medios de pago", async () => {
  await page.goto(`${B}/finanzas/configuracion?tab=medios`);
  const fila = (medio) => ({ locator: () => page.getByLabel(`Destino de ${medio}`, { exact: true }) });
  await fila("Efectivo").locator("input").click();
  await page.getByRole("option", { name: /^Efectivo/ }).first().click();
  await toast("Efectivo: guardado").waitFor();
  await fila("Otro").locator("input").click();
  await page.getByRole("option", { name: /A crédito/ }).click();
  await toast("Otro: guardado").waitFor();
  await fila("Tarjeta crédito").locator("input").click();
  await page.getByRole("option", { name: "Bold por abonar" }).click();
  await toast("Tarjeta crédito: guardado").waitFor();
  await page.screenshot({ path: `${S}/fc3-medios.png`, fullPage: true });
});
await paso("poner al día registra el ingreso pendiente", async () => {
  await page.goto(`${B}/finanzas/cobros`);
  await page.getByText(/1 ingreso por \$\s?120\.000/).waitFor();
  await page.getByRole("button", { name: "Poner al día" }).click();
  await toast("Flujo de caja al día").waitFor();
  await page.goto(`${B}/finanzas`);
  await esperar(disponible, base + 120000, "disponible tras poner al día");
});
await paso("por cobrar: registrar el cobro del crédito", async () => {
  await page.getByText("Por cobrar a pacientes").waitFor();
  await page.goto(`${B}/finanzas/cobros`);
  await page.getByText("Por cobrar").first().waitFor();
  await page.getByRole("button", { name: "Registrar cobro" }).first().click();
  await dialogo().waitFor();
  if ((await page.locator("#montoCobro").inputValue()).replace(/\D/g, "") !== "50000") throw new Error("el valor no viene del tratamiento");
  await elegir("#cuentaCobro", /Bancolombia/);
  await dialogo().getByRole("button", { name: "Registrar cobro" }).click();
  await toast("Cobro registrado").waitFor();
  await page.getByText(/ya tienen su ingreso registrado/).waitFor();
  await page.goto(`${B}/finanzas`);
  await esperar(disponible, base + 170000, "disponible tras el cobro");
});
await paso("un tratamiento nuevo entra solo; con Bold queda por abonar", async () => {
  tratamiento("EFECTIVO", 80000);
  tratamiento("TARJETA_CREDITO", 100000);
  await page.goto(`${B}/finanzas`);
  await esperar(disponible, base + 250000, "disponible con el tratamiento nuevo");
  await esperar(async () => pesos(await page.getByText("Por abonar (pasarela)").locator("..").innerText()), 100000, "por abonar");
  await page.goto(`${B}/finanzas/movimientos`);
  await page.getByText("Pendiente de abono").first().waitFor();
  if ((await page.getByText("Tratamiento", { exact: true }).count()) < 3) throw new Error("faltan etiquetas de tratamiento");
  if (await page.getByText("Lucía").count()) throw new Error("el nombre del paciente no debe quedar en el movimiento");
});
await paso("anular el tratamiento anula su ingreso", async () => {
  const id = tratamiento("EFECTIVO", 30000);
  await page.goto(`${B}/finanzas`);
  await esperar(disponible, base + 280000, "disponible antes de anular");
  sql(`update tratamientos set anulado = true, anulado_motivo = 'Registrado por error', anulado_en = now() where id = '${id}'`);
  await page.reload();
  await esperar(disponible, base + 250000, "disponible tras anular el tratamiento");
});
await paso("anular a mano el ingreso de un tratamiento lo devuelve a Cobros", async () => {
  await page.goto(`${B}/finanzas/movimientos`);
  const fila = page.locator("li", { hasText: "Toxina" }).filter({ hasText: "80.000" }).filter({ hasNot: page.getByText("Anulado", { exact: true }) }).first();
  await fila.getByRole("button", { name: "Anular" }).click();
  await dialogo().getByText(/volverá a Cobros/).waitFor();
  await dialogo().locator("textarea").fill("Entró por el banco, no en efectivo");
  await dialogo().getByRole("button", { name: "Anular" }).click();
  await toast("Movimiento anulado").waitFor();
  await page.goto(`${B}/finanzas/cobros`);
  await page.getByText(/1 ingreso por \$\s?80\.000/).waitFor();
});
await paso("móvil 390 px (cobros y medios)", async () => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
  for (const ruta of ["/finanzas/cobros", "/finanzas/configuracion?tab=medios", "/finanzas"]) {
    await m.goto(`${B}${ruta}`); await m.waitForLoadState("networkidle");
    const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
    if (ancho > 390) throw new Error(`scroll horizontal ${ancho} en ${ruta}`);
    await m.screenshot({ path: `${S}/fc3-movil-${ruta.split(/[/?=]/).filter(Boolean).pop()}.png`, fullPage: true });
  }
});
await browser.close();
console.log("errores:", errores.length ? errores : "ninguno");
if (errores.length) process.exit(1);
