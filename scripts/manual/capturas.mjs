// Capturas del manual de usuario (apps/web/public/manual/*.jpg) en un
// navegador real sobre el Supabase LOCAL con los datos de semilla.sql.
// Se corre con scripts/manual/capturas.sh (levanta next dev). Cada captura
// es la ventana de 1280×800 (mismo tamaño en todo el manual).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const DESTINO = process.argv[2];
const B = "http://localhost:3000";
mkdirSync(DESTINO, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const opciones = { viewport: { width: 1280, height: 800 }, locale: "es-CO", timezoneId: "America/Bogota", deviceScaleFactor: 1 };
const fallas = [];

async function foto(page, archivo) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  // Sin el indicador de Next ni avisos efímeros en la imagen.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} [data-sonner-toaster],[data-slot=toast-viewport]{display:none!important}" }).catch(() => {});
  await page.screenshot({ path: join(DESTINO, archivo), type: "jpeg", quality: 82 });
  console.log(`OK ${archivo}`);
}
async function paso(archivo, f) {
  try {
    await f();
  } catch (e) {
    fallas.push(`${archivo}: ${String(e).split("\n")[0]}`);
    console.log(`FALLA ${archivo}: ${String(e).split("\n")[0]}`);
  }
}
const cerrar = async (page) => {
  for (let i = 0; i < 3 && (await page.locator("[data-slot=dialog-content]").count()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  if (await page.locator("[data-slot=dialog-content]").count()) {
    await page.locator("[data-slot=dialog-content]").last().getByRole("button", { name: /Close|Cerrar/ }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
};

// Sin sesión: registro e inicio de sesión.
const anon = await (await browser.newContext(opciones)).newPage();
await paso("registro.jpg", async () => {
  await anon.goto(`${B}/signup`);
  await anon.getByText("Crea tu cuenta").waitFor();
  await anon.getByLabel(/Nombre de la clínica/).fill("Clínica Dermatológica Bella Piel");
  await anon.getByLabel(/NIT/).fill("901234567-8");
  await anon.getByLabel(/Tu nombre/).fill("María Fernanda Ríos");
  await anon.getByLabel(/Tu correo/).fill("maria@bellapiel.co");
  await foto(anon, "registro.jpg");
});
await paso("login.jpg", async () => {
  await anon.goto(`${B}/login`);
  await anon.getByText("Bienvenido").waitFor();
  await foto(anon, "login.jpg");
});

// Con sesión de administrador.
const ctx = await browser.newContext(opciones);
const page = await ctx.newPage();
await page.goto(`${B}/login`);
await page.fill('input[name="email"]', "admin@ewah.local");
await page.fill('input[name="password"]', "Prueba-local-123!");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

const ir = async (ruta) => {
  await page.goto(`${B}${ruta}`);
  await page.waitForLoadState("networkidle").catch(() => {});
};
// Las pestañas pueden ser role=tab o botones: se busca por su texto exacto.
const tab = async (nombre) => {
  const porRol = page.getByRole("tab", { name: nombre, exact: true });
  if (await porRol.count()) await porRol.first().click();
  else await page.getByText(nombre, { exact: true }).first().click();
  await page.waitForTimeout(600);
};

await paso("dashboard.jpg", async () => {
  await ir("/dashboard");
  await foto(page, "dashboard.jpg");
});

// Parámetros.
await paso("parametros.jpg", async () => {
  await ir("/parametros");
  await page.getByRole("heading", { name: "Parámetros" }).waitFor();
  await foto(page, "parametros.jpg");
});
await paso("parametros-datos-basicos.jpg", async () => {
  await page.getByRole("button", { name: "Datos básicos de la clínica" }).click();
  await page.locator("[data-slot=dialog-content]").waitFor();
  await foto(page, "parametros-datos-basicos.jpg");
  await cerrar(page);
});
await paso("parametros-tratamientos.jpg", async () => {
  await tab("Tratamientos");
  await tab("Tipos de tratamiento");
  await foto(page, "parametros-tratamientos.jpg");
});

// Usuarios.
await paso("usuarios.jpg", async () => {
  await ir("/usuarios");
  await page.getByText("Usuarios y roles").first().waitFor();
  await foto(page, "usuarios.jpg");
});
await paso("usuarios-permisos.jpg", async () => {
  await page.getByRole("button", { name: "Editar permisos" }).first().click();
  await page.locator("[data-slot=dialog-content]").waitFor();
  await foto(page, "usuarios-permisos.jpg");
  await cerrar(page);
});

// Pacientes.
await paso("pacientes.jpg", async () => {
  await ir("/pacientes");
  await page.getByText("Valentina").first().waitFor();
  await foto(page, "pacientes.jpg");
});
await paso("paciente-nuevo.jpg", async () => {
  await page.getByRole("button", { name: "Nuevo paciente" }).click();
  await page.locator("[data-slot=dialog-content]").waitFor();
  await foto(page, "paciente-nuevo.jpg");
  await cerrar(page);
});
await paso("paciente-ficha.jpg", async () => {
  await page.locator("tr", { hasText: "Valentina" }).getByText("Ver", { exact: true }).first().click();
  await page.waitForURL(/\/pacientes\/[0-9a-f-]{36}/);
  await tab("Atenciones");
  await foto(page, "paciente-ficha.jpg");
});
await paso("atencion.jpg", async () => {
  await page.getByRole("button", { name: "Ver detalle" }).first().click();
  const d = page.locator("[data-slot=dialog-content]");
  await d.getByText("Toxina botulínica (Botox)").first().waitFor();
  await d.getByText(/Paciente tolera bien/).first().waitFor();
  await foto(page, "atencion.jpg");
});
await paso("tratamiento-insumos.jpg", async () => {
  await page.locator("[data-slot=dialog-content]").getByRole("button", { name: /Insumos/ }).first().click();
  await page.getByText("Insumos usados en este tratamiento").waitFor();
  await page.getByText("Frente y entrecejo").first().waitFor();
  await page.getByRole("button", { name: "Registrar consumo" }).waitFor();
  await foto(page, "tratamiento-insumos.jpg");
  await cerrar(page);
  await cerrar(page);
});

// Agenda.
await paso("agenda.jpg", async () => {
  await ir("/citas");
  await page.getByText("Agenda").first().waitFor();
  await page.waitForTimeout(800);
  await foto(page, "agenda.jpg");
});
await paso("cita-detalle.jpg", async () => {
  await page.locator(".fc-event, [data-cita], [role=button]", { hasText: /Valentina|Claudia|Juan|Mariana|Ana|Sofía|Carlos|Daniela|Isabela/ }).first().click();
  await page.locator("[data-slot=dialog-content]").waitFor();
  await foto(page, "cita-detalle.jpg");
  await cerrar(page);
});
await paso("cita-nueva.jpg", async () => {
  await page.getByRole("button", { name: "Nueva cita" }).click();
  await page.locator("[data-slot=dialog-content]").waitFor();
  await foto(page, "cita-nueva.jpg");
  await cerrar(page);
});

// Tratamientos.
await paso("tratamientos.jpg", async () => {
  await ir("/tratamientos");
  await page.getByText("Historial").first().waitFor();
  await foto(page, "tratamientos.jpg");
});
await paso("tratamiento-nuevo.jpg", async () => {
  await page.getByRole("button", { name: "Nuevo tratamiento" }).click();
  await page.locator("[data-slot=dialog-content]").waitFor();
  await foto(page, "tratamiento-nuevo.jpg");
  await cerrar(page);
});

// Inventario.
await paso("inventario.jpg", async () => {
  await ir("/inventario");
  await page.getByText("Lotes activos").first().waitFor();
  await foto(page, "inventario.jpg");
});
await paso("inventario-recepcion.jpg", async () => {
  await tab("Recepción de lotes");
  await foto(page, "inventario-recepcion.jpg");
});
await paso("inventario-movimientos.jpg", async () => {
  await tab("Movimientos");
  await page.waitForTimeout(800);
  await foto(page, "inventario-movimientos.jpg");
});

// Recursos humanos.
await paso("rrhh.jpg", async () => {
  await ir("/rrhh");
  await page.getByText(/Empleados \(/).first().waitFor();
  await foto(page, "rrhh.jpg");
});
await paso("rrhh-empleado.jpg", async () => {
  await page.locator("tr", { hasText: "Paola Andrea Suárez" }).getByRole("link").first().click();
  await page.waitForURL(/\/rrhh\/[0-9a-f-]{36}/);
  await foto(page, "rrhh-empleado.jpg");
});

// Flujo de caja.
await paso("finanzas.jpg", async () => {
  await ir("/finanzas");
  await page.getByText("Disponible en pesos").waitFor();
  await foto(page, "finanzas.jpg");
});
await paso("finanzas-registrar.jpg", async () => {
  await page.getByRole("button", { name: "Salió plata" }).first().click();
  const d = page.locator("[data-slot=dialog-content]").last();
  await d.locator("input[id^=monto-]").fill("2.500.000");
  await d.getByRole("radiogroup", { name: "Categoría", exact: true }).getByRole("radio", { name: /Arrendamiento/ }).click();
  await foto(page, "finanzas-registrar.jpg");
  await cerrar(page);
});
for (const [archivo, ruta, espera] of [
  ["finanzas-movimientos.jpg", "/finanzas/movimientos", "Movimientos"],
  ["finanzas-medios.jpg", "/finanzas/configuracion?tab=medios", "Medios de pago"],
  ["finanzas-cobros.jpg", "/finanzas/cobros", "Cobros"],
  ["finanzas-bold.jpg", "/finanzas/bold", "Liquidaciones"],
  ["finanzas-socios.jpg", "/finanzas/socios", "La clínica les debe"],
  ["finanzas-informe.jpg", `/finanzas/informe?desde=${new Date().getFullYear()}-02&hasta=${new Date().toISOString().slice(0, 7)}`, "Actividades de operación"],
  ["finanzas-cierre.jpg", "/finanzas/cierre", "Meses cerrados"],
  ["campanas.jpg", "/campanas", "Campañas"],
  ["reportes.jpg", "/reportes", "Tratamientos registrados"],
  ["habilitacion.jpg", "/habilitacion", "Habilitación"],
  ["habilitacion-autoevaluacion.jpg", "/habilitacion/autoevaluacion", "Habilitación"],
  ["sst.jpg", "/sst", "SG-SST"],
  ["sst-eventos.jpg", "/sst/eventos", "SG-SST"],
  ["suscripcion.jpg", "/suscripcion", "Tu plan actual"],
  ["exportar.jpg", "/exportar", "Exportar datos"],
]) {
  await paso(archivo, async () => {
    await ir(ruta);
    await page.getByText(espera).first().waitFor();
    await foto(page, archivo);
  });
}
await paso("medio-ambiente.jpg", async () => {
  await ir("/medio-ambiente");
  await tab("Neveras");
  await foto(page, "medio-ambiente.jpg");
});
await paso("medio-ambiente-residuos.jpg", async () => {
  await tab("Residuos");
  await foto(page, "medio-ambiente-residuos.jpg");
});

await browser.close();
console.log(fallas.length ? `Fallaron ${fallas.length}:\n${fallas.join("\n")}` : "Todas las capturas listas.");
if (fallas.length) process.exit(1);
