# EWAH Tech — Tareas

Ver `docs/spec-ewah-app.md` para la especificación funcional completa por módulo.
Reconstrucción módulo por módulo, con confirmación en cada decisión grande.

## Hecho

- [x] Monorepo Turborepo (`apps/web`, listo para `apps/mobile`)
- [x] Supabase: fundación multi-tenant (`clinicas`, `usuarios`, `roles`, `modulos`, `permisos`, RBAC) — `supabase/migrations/0001_sistema_rbac.sql`
- [x] EWAH S.A.S. sembrada como primera clínica (NIT 901759965) + primer usuario Administrador
- [x] Clientes Supabase para Next.js (`client.ts`, `server.ts`, `admin.ts`, `proxy.ts`)
- [x] shadcn/ui instalado en `apps/web`
- [x] Vitest (unit) + Playwright (e2e) configurados en `apps/web`
- [x] MCP: Sequential Thinking y Context7 (`.mcp.json`) — Superpowers descartado (marketplace de terceros, no verificado)
- [x] Módulo Sistema: login con bloqueo por 5 intentos fallidos, onboarding de clínica nueva (self-service SaaS), invitación de staff por email, gestión de roles con matriz de permisos por módulo — `supabase/migrations/0003_onboarding_clinica.sql`, `apps/web/lib/auth/`, `apps/web/lib/rbac/`, `apps/web/app/(protected)/usuarios/`
- [x] Verificación visual en navegador real (login, signup, flujo de error) vía `npx playwright cli --browser=chrome` usando el Chrome ya instalado en la máquina — no requiere descargar el Chromium de Playwright, que falla por red en este entorno. Ver nota de proceso más abajo.
- [x] Vercel: dos ambientes — Production (`main`, https://ewah-portal-medico.vercel.app) y Preview/staging (rama `staging`, URL estable `https://ewah-portal-medico-git-staging-ewah.vercel.app`). Variables de entorno correctas en ambos ambientes (incl. `SUPABASE_SERVICE_ROLE_KEY` que solo tenía Production desde la integración nativa de hace días). `lib/site-url.ts` arma la URL de invitación dinámicamente con `VERCEL_URL` en vez de depender de una env var fija por ambiente.
- [x] CLI de Vercel instalado y logueado (`vercel login`, `vercel link`) — se usa para todo lo de deploy/env vars ya que el MCP remoto de Vercel no logró autorizar el team `ewah` (ver nota abajo)
- [x] Rediseño de login/signup con identidad visual EWAH Tech (hero oscuro + card de acción), corregido bug de fuente (`--font-sans` circular en globals.css)
- [x] Sistema de diseño con la marca real EWAH Tech: paleta (Cyan Tech #00C9EC, Deep Navy #0D1825, Slate #363F4A) en `globals.css` (reemplaza los grises genéricos de shadcn), logo recreado en SVG (`components/ewah-logo.tsx`, wordmark + ícono de pulso) usado en login/signup/header de la app
- [x] Campo "Medio de Contacto" del paciente redefinido a "¿Cómo nos conoció?" (canal de captación/atribución de marketing: Google, redes sociales, recomendado...) en vez de medio de contacto preferido — `supabase/migrations/0006_canal_captacion.sql`
- [x] Módulo Parámetros (datos maestros / tablas de referencia): motor genérico reutilizable (registro + acciones + UI con tabs) + 5 catálogos globales para Pacientes (Tipos de Identificación, Géneros, Países, EPS, Medios de Contacto), con datos reales sembrados — `supabase/migrations/0004_parametros.sql`, `apps/web/lib/parametros/`, `apps/web/app/(protected)/parametros/`. Catálogos futuros por-clínica (Sede, Consultorio...) reusan la misma infraestructura, solo agregando `clinica_id` + `esGlobal: false` en el registro.
- [x] Módulo Pacientes: listar/buscar (búsqueda indexada con pg_trgm + unaccent, mejora sobre el escaneo en memoria del legado), crear, editar, desactivar (nunca se borra — retención de historia clínica). Sin columnas de Edad/RangoEdad en el paciente (decisión: se calculan y guardan como dato histórico inmutable en Tratamientos, para análisis por edad) — `supabase/migrations/0005_pacientes.sql`, `apps/web/lib/pacientes/`, `apps/web/app/(protected)/pacientes/`.

## En progreso / próximo

- [ ] Correr `supabase/migrations/0004_parametros.sql`, `0005_pacientes.sql` y `0006_canal_captacion.sql` en el SQL Editor (en ese orden)
- [ ] Probar `/parametros` y `/pacientes` con sesión real (no se pudo verificar en navegador más allá del login — no hay credenciales de prueba en este entorno)
- [ ] Confirmar que agregaste en Supabase → Authentication → URL Configuration → Redirect URLs: `https://ewah-portal-medico.vercel.app/**`, `https://*-ewah.vercel.app/**`, `http://localhost:3000/**`
- [ ] Configurar Resend como SMTP personalizado en Supabase Auth (dashboard) cuando haya dominio verificado — hoy usa el mailer por defecto de Supabase y Resend en modo sandbox (solo a tu propio correo)
- [ ] Actualizar las plantillas de email de Supabase (Confirm signup, Invite user, Reset password) para usar el formato `/auth/confirm?token_hash=...&type=...&next=...`
- [ ] Considerar generar una skill de proyecto para `run` (arranque del dev server + verificación visual) vía `/run-skill-generator`, ya que hubo que resolver arranque/puerto/parada y el método de navegador manualmente

### Nota: MCP de Vercel sin autorizar

`.mcp.json` declara el servidor oficial `https://mcp.vercel.com`, pero `list_teams`/`get_project` devuelven vacío/403 pese a varios intentos de reautorización — el team `ewah` no queda expuesto a la sesión OAuth aunque el CLI (`vercel login`/`vercel link`, autenticación por token, distinta al OAuth del MCP) sí lo ve perfecto. Se dejó en pausa; usar el CLI de Vercel (ya logueado como `ewahderm-9018`, proyecto linkeado en `apps/web/.vercel/project.json`) para cualquier tarea de deploy/env vars en vez de insistir con el MCP.

### Nota de proceso: cómo verificar visualmente en este entorno

`npx playwright install chromium` falla por red (timeout a `cdn.playwright.dev`). En vez de eso: `cd apps/web && npx playwright cli open --browser=chrome <url>` usa el Chrome/Edge ya instalado en Windows sin descargar nada. Comandos útiles: `goto`, `snapshot` (refs de elementos), `fill <ref> <valor>`, `click <ref>`, `console error`, `screenshot --filename=x.png`, `close`. Los artefactos quedan en `apps/web/.playwright-cli/` (gitignorado).

## Backlog (por módulo, ver docs/spec-ewah-app.md)

- [ ] Núcleo clínico: Tratamientos (Pacientes ya está hecho, ver arriba) — incluye calcular y guardar edad/rango de edad del paciente al momento de cada tratamiento
- [ ] Wizard de personalización de Parámetros por clínica (ya desbloqueado — Pacientes es el caso real que consume los catálogos) — cada clínica activa/desactiva valores del catálogo global (ej. de las 15 EPS o 26 países, solo marca las relevantes para ella) sin borrarlos del sistema, y puede agregar valores propios que no están en la lista global. Se integra al flujo de registro de clínica (`/signup` → onboarding) para configurar desde el inicio. Diseño: tabla de selección `clinica_catalogo_valores (clinica_id, tabla, valor_id, activo)` + extender los catálogos existentes para aceptar valores custom por clínica.
- [ ] Agenda: Citas, BloqueoHorario, integración Google Calendar
- [ ] Inventario: Insumos, Lotes, Movimientos, Consumo
- [ ] Financiero: Gastos, Cuentas por Pagar/Cobrar
- [ ] Activos fijos e Instalaciones
- [ ] Control ambiental
- [ ] SGSST
- [ ] RRHH
- [ ] Habilitación
- [ ] Actas corporativas
- [ ] Calendario regulatorio
- [ ] Marketing
- [ ] Reportes + reporte INVIMA
- [ ] Asistente IA (Gemini/Anthropic)
- [ ] Deploy: Vercel, Cloudflare, Stripe, Resend, Redis
- [ ] App móvil (Expo)
