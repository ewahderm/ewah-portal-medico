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

## En progreso / próximo

- [ ] Configurar Resend como SMTP personalizado en Supabase Auth (dashboard) cuando haya dominio verificado — hoy usa el mailer por defecto de Supabase y Resend en modo sandbox (solo a tu propio correo)
- [ ] Actualizar las plantillas de email de Supabase (Confirm signup, Invite user, Reset password) para usar el formato `/auth/confirm?token_hash=...&type=...&next=...`
- [ ] Considerar generar una skill de proyecto para `run` (arranque del dev server + verificación visual) vía `/run-skill-generator`, ya que hubo que resolver arranque/puerto/parada y el método de navegador manualmente

### Nota de proceso: cómo verificar visualmente en este entorno

`npx playwright install chromium` falla por red (timeout a `cdn.playwright.dev`). En vez de eso: `cd apps/web && npx playwright cli open --browser=chrome <url>` usa el Chrome/Edge ya instalado en Windows sin descargar nada. Comandos útiles: `goto`, `snapshot` (refs de elementos), `fill <ref> <valor>`, `click <ref>`, `console error`, `screenshot --filename=x.png`, `close`. Los artefactos quedan en `apps/web/.playwright-cli/` (gitignorado).

## Backlog (por módulo, ver docs/spec-ewah-app.md)

- [ ] Núcleo clínico: Pacientes, Tratamientos
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
