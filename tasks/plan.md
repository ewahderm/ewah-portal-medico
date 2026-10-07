# Implementation Plan: Clinic analytics and experience

## Overview

Deliver the approved clinic profile changes, PGIRASA reporting, protected
analytics and regulatory reports, and an accessible navigation refresh. Keep
clinic data tenant-scoped and reuse the existing EWAH form, permission, and
export patterns.

## Architecture Decisions

- Store the seven-digit activity code on `clinicas`; backfill it from
  `sst_perfil` before removing the old field. Save clinic names and activity
  through a security-definer RPC limited to the current clinic and admin role.
- Keep legal and commercial names separate, and make Datos básicos their single
  editing location. Brand settings retain logo and contact/notification fields.
- Implement charts with typed native SVG and serve real country boundaries from
  a local, attributed Natural Earth-derived data file. Do not add runtime map
  tiles, tracking, or chart/map dependencies.
- Aggregate reports on the server using authenticated clinic scope. Gate each
  section by its source-module permissions; payroll commissions also require
  RRHH access. Do not pass patient-level data into charts.
- Calculate PGIRASA by site from complete calendar months. A month with no
  hazardous-waste records must have an explicit, auditable 0 kg declaration;
  otherwise the moving average is unavailable. Do not invent the separate
  weighted-average method or partial-month normalization absent from the
  cited rule.
- Preserve legacy `quimico` rows as hazardous but characteristic-unclassified;
  new records use the categories in Manual §5.1 and do not silently infer a
  chemical hazard characteristic.
- Use existing React `ViewTransition` and CSS, with graceful fallback and
  `prefers-reduced-motion`; retain a shared menu model across desktop and mobile.
- Do not add or apply remote Supabase migrations, push Git, or deploy to Vercel
  as part of this implementation without a separate explicit authorization.

## Task List

### Phase 1: Clinic profile foundation

- [ ] Task 1: Add clinic-owned activity code and scoped profile update RPC.
- [ ] Task 2: Edit clinic names and activity code in Datos básicos only.
- [ ] Task 3: Switch SG-SST to the clinic activity code and remove the old field.

### Phase 2: PGIRASA data and reporting

- [ ] Task 4: Add the PGIRASA waste taxonomy and audited zero-month declarations.
- [ ] Task 5: Calculate and present monthly totals and six-month per-site
  classifications.

### Checkpoint: Profile and PGIRASA

- [ ] Clinic fields migrate without data loss; SG-SST and form flows work.
- [ ] Waste classification passes all six-month, site, missing-month, category,
  and zero-month tests.
- [ ] Local migration tests confirm RLS and audit behavior.

### Phase 3: Reports

- [ ] Task 6: Add tenant-scoped report access and clinical aggregate queries.
- [ ] Task 7: Build the reports experience, charts, and real country map.
- [ ] Task 8: Add INVIMA export and payroll commission reports.

### Checkpoint: Reports

- [ ] All visual totals match the underlying authorized aggregates.
- [ ] INVIMA export and payroll commissions apply their own permissions and
  exclude invalid/annulled records.
- [ ] Country map and accessible country list show the same values.

### Phase 4: Navigation and transitions

- [ ] Task 9: Reorganize desktop/mobile navigation and add accessible route motion.

### Checkpoint: Complete

- [ ] Focused tests, full relevant test suite, lint, and build pass.
- [ ] Desktop/mobile, keyboard, and reduced-motion flows are verified.
- [ ] Supabase/Vercel/Git remote state remains unchanged pending authorization.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Clinic identity/activity fields cross a privileged database boundary | High | Admin-only RPC, own-clinic context, server validation, migration backfill test |
| Missing waste months can falsely lower a regulatory average | High | Explicit per-site zero declaration; block classification when month is unknown |
| Legacy chemical waste lacks a specific characteristic | Medium | Preserve it as unclassified; do not infer a subtype; keep historical kilograms visible |
| Table 5.1 does not represent every clinic-specific waste stream | Medium | Provide an explicit other-hazardous category and show the selected classification |
| Analytics exposes patient, payroll, or cross-clinic data | High | Server aggregation, minimal fields, clinic scope, and underlying-module permission checks |
| A local map asset has unclear licensing or increases initial bundle size | Medium | Use an attributed, locally served public-domain geography file; lazy-load map view |
| Header navigation becomes crowded | Medium | Keep direct Dashboard/Reportes links; switch to grouped drawer below a tested breakpoint |
| Experimental transitions behave differently across browsers | Low | Use documented React/Next support, reduced-motion CSS, and graceful no-animation fallback |

## Verification Commands

From `apps/web`:

```powershell
npx --yes pnpm@12.4.2 test
npx --yes pnpm@12.4.2 lint
npx --yes pnpm@12.4.2 build
```

Also run the repository's local database/migration tests for the new clinic,
report-access, and PGIRASA policies, plus focused Playwright viewport and
keyboard checks.

## Open Questions

- The official regulation requires weighted averages but does not provide a
  separate weighted-average formula or partial-month normalization in the
  cited text. Implement only the worked six-month moving-average method,
  distinguish it in the interface, and do not imply that the software replaces
  a compliance professional's PGIRASA judgment.
- Remote database application, Git push, and Vercel deployment require separate
  authorization after local verification.
