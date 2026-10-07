# Implementation tasks

## Task 1: Adding clinic-owned activity code and profile RPC

**Description:** Add the clinic-level activity code, backfill it from the
current SG-SST profile, and create an admin-only RPC to save the legal name,
commercial name, and activity code for the current clinic.

**Acceptance criteria:**
- [ ] Existing activity codes are preserved by the migration.
- [ ] Legal name is required; commercial name is independently nullable; the
  activity code is either empty or seven valid digits.
- [ ] The RPC cannot update another clinic and is not directly callable by
  anonymous users.

**Verification:** Local migration test for backfill, validation, and
cross-clinic/admin authorization.

**Dependencies:** None.

**Files likely touched:**
- `supabase/migrations/0080_perfil_clinica.sql`
- `scripts/habilitacion/bd-local/` (focused clinic-profile SQL test)

**Estimated scope:** Small.

## Task 2: Editing clinic identity in Datos básicos

**Description:** Load and edit both names and activity code in Datos básicos;
remove the second commercial-name editor from Brand settings while retaining
logo and contact/notification controls.

**Acceptance criteria:**
- [ ] The legal and commercial names appear as separate inputs in Datos básicos.
- [ ] The activity code is editable there with server-side validation.
- [ ] Brand settings no longer edits the commercial name and continues to save
  logo/contact data.

**Verification:** Focused component/action tests for save, validation, refresh,
and removal of the duplicate editing location.

**Dependencies:** Task 1.

**Files likely touched:**
- `apps/web/app/(protected)/parametros/page.tsx`
- `apps/web/app/(protected)/parametros/datos-basicos-clinica-dialog.tsx`
- `apps/web/app/(protected)/suscripcion/page.tsx`
- `apps/web/app/(protected)/suscripcion/marca-dialog.tsx`
- `apps/web/lib/clinicas/actions.ts`

**Estimated scope:** Medium.

## Task 3: Moving SG-SST activity-code reads to the clinic

**Description:** Remove the activity code from SG-SST editing and read the
clinic-level value for the existing standards/risk diagnostic.

**Acceptance criteria:**
- [ ] SG-SST profile no longer writes or requests `sst_perfil.codigo_actividad`.
- [ ] The risk-class diagnostic receives the same seven-digit code from
  `clinicas`.
- [ ] The migration removes the old column only after backfill and application
  code has moved to the new source.

**Verification:** Existing SG-SST group/diagnostic tests plus focused
clinic-profile-to-SG-SST integration test.

**Dependencies:** Task 1, Task 2.

**Files likely touched:**
- `apps/web/app/(protected)/sst/perfil-form.tsx`
- `apps/web/lib/sst/perfil.ts`
- `apps/web/lib/sst/consultas.ts`
- `apps/web/lib/sst/diagnostico.ts`
- `supabase/migrations/0080_perfil_clinica.sql`

**Estimated scope:** Medium.

## Task 4: Adding PGIRASA categories and zero-month declarations

**Description:** Extend waste categories to the manual's monthly format,
preserve generic historical chemical rows without inferring a characteristic,
and support audited per-site/month declarations of no hazardous waste.

**Acceptance criteria:**
- [ ] New options distinguish non-hazardous, biological/infectious, and
  hazardous chemical-characteristic streams, with radioactive and other
  hazardous choices.
- [ ] Existing waste rows remain intact; generic chemical history is visibly
  unclassified but remains hazardous for the legacy total.
- [ ] A zero declaration is unique per clinic/site/month, authenticated,
  auditable, and conflicts with hazardous measurements are rejected.

**Verification:** Migration/RLS test, category validation tests, and zero-month
authorization/conflict/correction tests.

**Dependencies:** None.

**Files likely touched:**
- `supabase/migrations/0081_pgirasa_residuos.sql`
- `apps/web/lib/medio-ambiente/constantes.ts`
- `apps/web/lib/medio-ambiente/actions.ts`
- `apps/web/app/(protected)/medio-ambiente/nuevo-residuo-dialog.tsx`
- focused SQL/action tests

**Estimated scope:** Medium.

## Task 5: Calculating and presenting PGIRASA totals

**Description:** Implement the monthly all-waste consolidation and the
six-calendar-month hazardous moving average and category per site, then expose
missing month and zero-confirmation states in Medio Ambiente.

**Acceptance criteria:**
- [ ] Each moving-average point is the arithmetic mean of six consecutive
  monthly hazardous quantities, including the evaluated completed month.
- [ ] Exactly 10, 100, and 1,000 kg/month fall into the next category.
- [ ] Any month lacking a hazardous weighing or explicit zero declaration
  displays “incompleto” and no classification.
- [ ] Monthly all-waste category totals remain distinct from hazardous-only
  classification.

**Verification:** Pure calculation tests use the official worked example and
boundary values; manual check covers per-site selection and incomplete periods.

**Dependencies:** Task 4.

**Files likely touched:**
- `apps/web/lib/medio-ambiente/pgirasa.ts`
- `apps/web/lib/medio-ambiente/pgirasa.test.ts`
- `apps/web/app/(protected)/medio-ambiente/pgirasa-report-tab.tsx`
- `apps/web/app/(protected)/medio-ambiente/medio-ambiente-tabs.tsx`
- `apps/web/lib/medio-ambiente/actions.ts`

**Estimated scope:** Medium.

## Task 6: Adding tenant-scoped report access and clinical aggregates

**Description:** Register the Reportes route permission and implement server
aggregates for non-annulled treatments, patient residence, treatment values,
payment type, and reporting periods.

**Acceptance criteria:**
- [ ] Reportes is permission-gated and available according to the clinic's
  assigned module permissions.
- [ ] Queries use authenticated clinic scope and return only the aggregates
  required by the visualizations.
- [ ] Annulled treatments and missing/null values are handled explicitly.

**Verification:** Local database RLS/RPC tests across two clinics and focused
aggregation tests.

**Dependencies:** None.

**Files likely touched:**
- `supabase/migrations/0082_reportes.sql`
- `apps/web/lib/reportes/consultas.ts`
- `apps/web/lib/reportes/calculos.ts`
- `apps/web/lib/reportes/calculos.test.ts`

**Estimated scope:** Medium.

## Task 7: Building analytics charts and country map

**Description:** Build the responsive Reportes page, filters, production,
treatment, monthly trend/pivot, financial summary, and country-of-residence
choropleth map plus accessible ranked list.

**Acceptance criteria:**
- [ ] The map uses genuine country boundaries and the same data as its
  accessible ranked list.
- [ ] Value is labelled as recorded non-annulled treatment value, not confirmed
  collection.
- [ ] “Sin país informado” remains visible as an aggregate.
- [ ] Charts use the approved EWAH tokens, animate meaningfully, and honor
  reduced motion.

**Verification:** Component/data tests; Playwright desktop/mobile and keyboard
checks; visual review at 390px and 1280px widths.

**Dependencies:** Task 6.

**Files likely touched:**
- `apps/web/app/(protected)/reportes/page.tsx`
- `apps/web/app/(protected)/reportes/reportes-tabs.tsx`
- `apps/web/app/(protected)/reportes/_components/produccion-chart.tsx`
- `apps/web/app/(protected)/reportes/_components/mapa-ventas.tsx`
- `apps/web/public/maps/` (attributed local map geometry)

**Estimated scope:** Medium.

## Task 8: Adding INVIMA and payroll reports

**Description:** Add an XLSX export of the clinic's INVIMA-reportable inventory
and a payroll report of non-annulled commissions grouped by employee and
period.

**Acceptance criteria:**
- [ ] INVIMA export includes only eligible data from the authorized clinic.
- [ ] Payroll commissions are grouped by employee and pay period and exclude
  annulled receipts.
- [ ] Inventory and RRHH permissions are checked independently before queries
  and exports.

**Verification:** Export builder tests and unauthorized/cross-clinic tests.

**Dependencies:** Task 6, Task 7.

**Files likely touched:**
- `apps/web/app/(protected)/reportes/_components/invima-report.tsx`
- `apps/web/app/(protected)/reportes/_components/comisiones-report.tsx`
- `apps/web/lib/reportes/invima.ts`
- `apps/web/lib/reportes/nomina.ts`
- focused report/export tests

**Estimated scope:** Medium.

## Task 9: Reorganizing navigation and adding page transitions

**Description:** Add direct Dashboard and Reportes links, align desktop and
mobile groups to the approved UX model, improve active/focus states, and add
restrained route transitions with reduced-motion support.

**Acceptance criteria:**
- [ ] Both viewports share labels, permission filtering, and group ordering.
- [ ] Current destination exposes `aria-current="page"` and keyboard focus is
  visible.
- [ ] Menu and route motion is disabled when reduced motion is requested and
  navigation still works without browser View Transition support.
- [ ] The menu fits wide desktop and uses the drawer below the verified
  breakpoint.

**Verification:** Existing navigation component tests plus Playwright viewport,
keyboard, and reduced-motion checks.

**Dependencies:** Task 7.

**Files likely touched:**
- `apps/web/app/(protected)/layout.tsx`
- `apps/web/app/(protected)/_components/nav-group.tsx`
- `apps/web/app/(protected)/_components/mobile-nav.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/(protected)/_components/page-transition.tsx`

**Estimated scope:** Medium.

## Task 10: Verifying integrated analytics and profile flows

**Description:** Run focused and broad validation across clinic identity,
SG-SST, PGIRASA, analytics, exports, navigation, accessibility, and production
build constraints.

**Acceptance criteria:**
- [ ] All relevant tests, lint, and build pass.
- [ ] No query or report can expose another clinic's records or unauthorized
  payroll values.
- [ ] Desktop/mobile and reduced-motion flows behave correctly.
- [ ] Only local code and migrations are changed; no remote system is modified.

**Verification:** `npx --yes pnpm@12.4.2 test`, `lint`, `build` from `apps/web`,
local DB tests, and Playwright smoke tests.

**Dependencies:** Tasks 1–9.

**Files likely touched:** Test files and only implementation files requiring
fixes from validation.

**Estimated scope:** Medium.
