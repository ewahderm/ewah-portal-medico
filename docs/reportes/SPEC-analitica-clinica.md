# Spec: Clinic analytics

## Objective

Provide a permission-gated Reportes area for clinic administrators and staff
authorized to view operational analytics. Help users understand clinic
production and recorded treatment value by date, treatment, professional,
payment method, and patient country of residence. Country totals must appear
on an actual geographic map, not only in a table.

`tratamientos.costo` is the available monetary field. Present it as recorded
treatment value, exclude annulled treatments, and state that it is not
independent confirmation of cash collected.

## Tech Stack

Next.js 16.3.5 App Router, React 19.2.8, TypeScript, Supabase, existing EWAH
design tokens, native SVG charts, and a locally bundled map dataset. No chart
or map package, hosted tile service, or external analytics service is required.

## Commands

From the repository root:

```powershell
Set-Location apps/web
npx --yes pnpm@12.4.2 test
npx --yes pnpm@12.4.2 lint
npx --yes pnpm@12.4.2 build
```

## Project Structure

- `apps/web/app/(protected)/reportes/` — server page and responsive report tabs.
- `apps/web/app/(protected)/reportes/_components/` — visualizations, geographic
  map, filters, and export controls.
- `apps/web/lib/reportes/` — tenant-scoped aggregation, date filtering, and
  export logic.
- `supabase/migrations/` — report permission and aggregate query functions where
  server-side aggregation is required.
- `apps/web/public/` — locally served map geometry with its source and license.

## Code Style

Keep visualization input aggregated, typed, and small:

```ts
type CountryValue = {
  isoCode: string | null;
  countryName: string;
  treatmentValue: number;
};
```

The server supplies aggregates; client chart code formats and displays them
without receiving patient names, contact data, or identifiers.

## Testing Strategy

- Test aggregation against known treatment/patient-country examples, including
  annulled treatments, null country, null monetary value, and selected periods.
- Verify reports require the report permission and every query is constrained
  to the authenticated clinic.
- Verify country map highlights correspond to the underlying country aggregates
  and a sorted accessible list remains available without hover.
- Check keyboard navigation, narrow viewport layout, and reduced-motion behavior.

Proposed test seams: the pure aggregation functions and the server report
loader/authorization check. Confirm these seams before adding tests.

## Boundaries

- Always: enforce tenant scope on the server; use each underlying module's
  permission for its sensitive report; do not expose patient-level data in
  aggregates; show unknown country separately; label amounts as recorded
  treatment value rather than collected revenue.
- Ask first: adding dependencies, external map/analytics services, new personal
  data collection, or changing report access roles.
- Never: use client-supplied clinic IDs as authorization, present an unverified
  amount as collected revenue, or make the map the sole accessible
  representation.

## Success Criteria

- Reportes is a distinct protected route with date filters and reports for
  production, leading treatments, country totals/map, monthly trends and
  period pivots, and financial summaries supported by existing data.
- The country visualization is an actual world map, driven by the same
  aggregates as its accessible country list.
- Invalid or missing residence country is included in an explicit
  “Sin país informado” aggregate, not silently dropped.
- Cancelled treatments do not contribute to counts or value.
- The map and charts load without contacting a third-party map or analytics
  service; the map source/license is recorded.
- At mobile widths, filters, tabs, charts, and map remain operable without
  horizontal page overflow.

## Open Questions

- Confirm the documented test seams before test-first implementation.
