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
- [x] Auditoría de cambios a datos clínicos: tabla genérica `auditoria` + trigger reutilizable `fn_auditoria()` (INSERT/UPDATE/DELETE, guarda quién/cuándo/valores anteriores y nuevos como jsonb), aplicado a `pacientes`; solo lectura para admins de la propia clínica. Requisito médico-legal de trazabilidad, no solo buena práctica — decidido antes de construir Tratamientos para no duplicar el patrón sin ella — `supabase/migrations/0007_auditoria.sql`.
- [x] Módulo Tratamientos (núcleo clínico): registro append-only — un tratamiento nunca se edita in-place (`fn_tratamientos_solo_anular` lo impide a nivel de base de datos), solo se anula con motivo y, si fue un error, se corrige creando un registro nuevo (`corrige_a`) desde el botón "Corregir". Edad del paciente al momento del tratamiento calculada automáticamente por trigger (`fn_calcular_edad_tratamiento`, nunca a mano). Incluye costo, notas clínicas y fotos antes/después (bucket privado de Storage `tratamiento-fotos` con aislamiento por clínica). "Tipos de tratamiento" es el primer catálogo *por clínica* de Parámetros (motor genérico extendido para soportar `clinica_id` además de catálogos globales). Hereda auditoría (0007) y el estándar de diálogos — `supabase/migrations/0008_tratamientos.sql`, `apps/web/lib/tratamientos/`, `apps/web/app/(protected)/tratamientos/`.

## En progreso / próximo

- [ ] Correr `supabase/migrations/0004_parametros.sql`, `0005_pacientes.sql`, `0006_canal_captacion.sql`, `0007_auditoria.sql` y `0008_tratamientos.sql` en el SQL Editor (en ese orden)
- [ ] Configurar tus propios "Tipos de tratamiento" en `/parametros` si los que se sembraron por defecto (Botox, Ácido hialurónico, Limpieza facial, Peeling, Otro) no coinciden con lo que ofrece la clínica
- [ ] Probar `/parametros` y `/pacientes` con sesión real (no se pudo verificar en navegador más allá del login — no hay credenciales de prueba en este entorno)
- [ ] Confirmar que agregaste en Supabase → Authentication → URL Configuration → Redirect URLs: `https://ewah-portal-medico.vercel.app/**`, `https://*-ewah.vercel.app/**`, `http://localhost:3000/**`
- [ ] Configurar Resend como SMTP personalizado en Supabase Auth (dashboard) cuando haya dominio verificado — hoy usa el mailer por defecto de Supabase y Resend en modo sandbox (solo a tu propio correo)
- [ ] Actualizar las plantillas de email de Supabase (Confirm signup, Invite user, Reset password) para usar el formato `/auth/confirm?token_hash=...&type=...&next=...`
- [ ] Considerar generar una skill de proyecto para `run` (arranque del dev server + verificación visual) vía `/run-skill-generator`, ya que hubo que resolver arranque/puerto/parada y el método de navegador manualmente

### Nota: MCP de Vercel sin autorizar

`.mcp.json` declara el servidor oficial `https://mcp.vercel.com`, pero `list_teams`/`get_project` devuelven vacío/403 pese a varios intentos de reautorización — el team `ewah` no queda expuesto a la sesión OAuth aunque el CLI (`vercel login`/`vercel link`, autenticación por token, distinta al OAuth del MCP) sí lo ve perfecto. Se dejó en pausa; usar el CLI de Vercel (ya logueado como `ewahderm-9018`, proyecto linkeado en `apps/web/.vercel/project.json`) para cualquier tarea de deploy/env vars en vez de insistir con el MCP.

### Nota de proceso: cómo verificar visualmente en este entorno

`npx playwright install chromium` falla por red (timeout a `cdn.playwright.dev`). En vez de eso: `cd apps/web && npx playwright cli open --browser=chrome <url>` usa el Chrome/Edge ya instalado en Windows sin descargar nada. Comandos útiles: `goto`, `snapshot` (refs de elementos), `fill <ref> <valor>`, `click <ref>`, `console error`, `screenshot --filename=x.png`, `close`. Los artefactos quedan en `apps/web/.playwright-cli/` (gitignorado).

## Deuda técnica identificada (revisión de buenas prácticas, 2026-09-17)

Revisadas antes de construir Tratamientos. Auditoría, historia clínica append-only y storage de fotos ya se resolvieron como parte del módulo Tratamientos (ver arriba). Queda en backlog, no se descartó:

- [ ] Pruebas automatizadas de aislamiento multi-tenant (RLS): hoy solo se verifica visualmente por navegador; no escala a medida que crecen los módulos.
- [ ] Separar Supabase de staging y producción — disparador: el día que entren datos reales de pacientes a producción (hoy comparten uno solo, decisión deliberada de "Un solo Supabase por ahora").
- [ ] Monitoreo de errores (Sentry o similar) antes de uso real en producción.

## Backlog (por módulo, ver docs/spec-ewah-app.md)

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
