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

- [x] Catálogo de Países completo (~198 países, antes solo 25 + Otro) — reordenado alfabéticamente, "Otro" siempre al final — `supabase/migrations/0009_paises_completos.sql`
- [x] Módulo Agenda (Citas): citas con paciente+profesional+consultorio+tipo de tratamiento+horario. Choques de horario (mismo profesional o mismo consultorio) se advierten pero no bloquean el guardado (decisión explícita). Estados: agendada/confirmada/atendida/cancelada/no_asistio, más "bloqueo de horario" (vacaciones, almuerzo) en la misma tabla sin paciente asociado. Marcar una cita como "Atendida" abre el diálogo de Tratamientos pre-llenado y enlaza `citas.tratamiento_id` al guardar, evitando doble captura. "Consultorios" es el segundo catálogo *por clínica* de Parámetros. Hereda auditoría y el estándar de diálogos — `supabase/migrations/0010_citas.sql`, `apps/web/lib/citas/`, `apps/web/app/(protected)/citas/`.
- [x] Sedes (sucursales físicas): cada Consultorio pertenece a una Sede — necesario para Agenda y para el futuro Inventario (stock por sede). Sin relación profesional↔sede por ahora (cualquier profesional atiende en cualquier sede, decisión explícita) — `supabase/migrations/0011_sedes.sql`.
- [x] Vista de Agenda como calendario visual (día/semana/mes, como Google Calendar) con `react-big-calendar` + `date-fns` (localización es-CO, semana empieza lunes), revestido con la marca EWAH (colores por estado de cita, toolbar/eventos con tokens de `globals.css`) — `apps/web/app/(protected)/citas/agenda-calendario.tsx` + `agenda-calendario.css`. Filtros por Sede y Profesional (`filtros-agenda.tsx`) actualizan la URL y regeneran la consulta en el servidor. Click en una cita abre un diálogo de detalle con las mismas acciones de estado (Confirmar/Atender/Cancelar/No asistió) — `cita-detalle-dialog.tsx`.
- [x] Agendamiento más rápido: Hora inicio/Hora fin ahora son selects de intervalos de 15 minutos (`lib/citas/horarios.ts`), no un input nativo que obliga a desplazarse minuto a minuto. Hora fin se autocalcula como Hora inicio + 1 hora al elegir la hora de inicio (el usuario puede sobreescribirla). Click en un horario u día vacío del calendario abre "Nueva cita" pre-llenada con esa fecha/hora (`onSelectSlot` en `agenda-calendario.tsx`, `CitaDialog` ahora soporta apertura controlada además de su botón propio).
- [x] Bloqueo de día completo y multi-profesional: "Bloquear horario" ahora permite seleccionar uno o varios profesionales a la vez (checkboxes + atajo "Todos"/"Ninguno") y marcar "Todo el día" para saltarse la hora — un bloqueo de día completo no exige consultorio (columna `consultorio_id` ya no es obligatoria solo para bloqueos; una cita real sigue exigiéndolo). Nueva columna `todo_el_dia` — `supabase/migrations/0012_bloqueo_dia_completo.sql`.
- [x] Estándar de app: todo `<Select>` opcional ahora se puede volver a dejar en blanco después de elegir un valor (antes, una vez elegido, no había forma de volver a "sin selección" desde la UI) — centinela compartido `SIN_SELECCION` + helper `valorOpcionalSelect()` en `lib/forms/opcional.ts`. Aplicado en Pacientes (Género, Nacionalidad, País, Canal de captación, EPS) y en el Consultorio opcional de Bloquear horario. Usar este mismo patrón en cualquier Select opcional nuevo.
- [x] Tratamientos: campos del sistema anterior agregados — Sede y Medio de Pago (obligatorios, como en el legado) y CUFE (opcional, código de facturación electrónica DIAN). "Medios de pago" es el cuarto catálogo *por clínica* de Parámetros. El trigger de inmutabilidad de Tratamientos (0008) se actualizó para cubrir estas columnas nuevas — `supabase/migrations/0013_tratamiento_sede_medio_pago.sql`.
- [x] Módulo nuevo: Contactos de paciente (registro tipo CRM de llamadas/WhatsApp/email/presencial, con resultado y próxima acción) — append-only, reutiliza los permisos de Pacientes en vez de un módulo de RBAC nuevo — `supabase/migrations/0014_contactos_paciente.sql`, `apps/web/lib/contactos/`.
- [x] Vista de paciente con pestañas estilo CRM: `/pacientes/[id]` muestra Tratamientos, Citas y Contactos del paciente (lectura; Contactos además permite registrar uno nuevo), más una pestaña "Insumos" en modo "Próximamente" hasta que exista el módulo de Inventario. Se accede desde un botón "Ver" nuevo en la lista de Pacientes.

## En progreso / próximo

- [x] Migraciones `0004` a `0011` corridas en Supabase (confirmado por el usuario 2026-09-17)
- [ ] Correr `supabase/migrations/0012_bloqueo_dia_completo.sql`, `0013_tratamiento_sede_medio_pago.sql` y `0014_contactos_paciente.sql` en el SQL Editor (en ese orden)
- [ ] Configurar tus propias "Sedes", "Tipos de tratamiento", "Consultorios" y "Medios de pago" en `/parametros` si lo sembrado por defecto (Sede Principal, Consultorio 1, Botox/Ácido hialurónico/Limpieza facial/Peeling/Otro, Efectivo/Tarjeta débito/Tarjeta crédito/Transferencia/PSE/Otro) no coincide con la clínica real
- [ ] Probar `/parametros`, `/pacientes`, `/tratamientos` y `/citas` con sesión real ahora que las migraciones ya corrieron
- [ ] Confirmar que agregaste en Supabase → Authentication → URL Configuration → Redirect URLs: `https://ewah-portal-medico.vercel.app/**`, `https://*-ewah.vercel.app/**`, `http://localhost:3000/**`
- [ ] Configurar Resend como SMTP personalizado en Supabase Auth (dashboard) cuando haya dominio verificado — hoy usa el mailer por defecto de Supabase y Resend en modo sandbox (solo a tu propio correo)
- [ ] Actualizar las plantillas de email de Supabase (Confirm signup, Invite user, Reset password) para usar el formato `/auth/confirm?token_hash=...&type=...&next=...`
- [ ] Considerar generar una skill de proyecto para `run` (arranque del dev server + verificación visual) vía `/run-skill-generator`, ya que hubo que resolver arranque/puerto/parada y el método de navegador manualmente

### Nota: import de datos del legado — pausado a propósito

Google Drive ya está autorizado. El usuario compartió muestras reales (`Referencias - Usuario.csv`, `ControlPacientes - ConsumoInsumos.csv`) el 2026-09-17, pero decidió explícitamente seguir el roadmap original (Agenda/Citas) antes de construir Inventario e importar los datos del legado — no se retoma hasta que se llegue a ese punto del backlog.

**Hallazgo de seguridad:** la tabla `Usuario` del legado guarda contraseñas en texto plano. Esa columna nunca se importa ni se guarda en el repo — al migrar usuarios se reutiliza el flujo de invitación por correo ya existente (`inviteStaff`) para que cada quien cree su propia contraseña. Detalle completo y pendientes (mapeo de `IdRol` legado, qué cuentas migrar, tablas de Insumos/Lotes que faltan) en memoria (`import_datos_legado.md`), no en este archivo, para no dejar datos sensibles de referencia aquí.

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
- [ ] Agenda: integración con Google Calendar (Citas y BloqueoHorario ya están hechos, ver arriba)
- [ ] Inventario: Insumos, Lotes, Movimientos, Consumo — desbloquea el import pausado de `ControlPacientes - ConsumoInsumos` (ver memoria `import_datos_legado.md`)
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
