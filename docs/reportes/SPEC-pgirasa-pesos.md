# Spec: PGIRASA waste-weight reporting

## Objective

Extend Medio Ambiente > Residuos with the monthly waste consolidation required
for PGIRASA and a separate per-site six-month hazardous-waste moving average
for generator classification. Never treat missing measurements as zero.

The user confirmed the regulated six-month calculation plus a separate monthly
all-waste report, explicit 0 kg confirmations, per-site results, and a catalogue
aligned to the categories in the manual's monthly consolidation format.

The monthly report distinguishes non-hazardous waste (recoverable,
non-recoverable, organic), biological/infectious waste (biosanitary, anatomical,
sharps, animal), and other hazardous waste by characteristic (corrosive,
reactive, explosive, toxic, flammable). Radioactive and other hazardous streams
are also represented separately. The legacy generic chemical type remains
visible as unclassified historical data; do not infer its specific hazardous
characteristic or silently rewrite existing records.

## Regulatory Basis

- Joint Resolution 0591 of 2024, Manual §§ 3.5, 4.1.1.3.1.3, Table 2, and
  worked example § 5.2:
  <https://www.minsalud.gov.co/Normatividad_Nuevo/Resoluci%C3%B3n%20No%20591%20de%202024.pdf>
- Readable legal text:
  <https://normas.cra.gov.co/gestor/docs/resolucion_minsaludps_0591_2024.htm>
- Decree 1076 of 2015, Article 2.2.6.1.6.2:
  <https://normas.cra.gov.co/gestor/docs/decreto_1076_2015.htm#2.2.6.1.6.2>

The rule's worked example calculates a six-calendar-month moving average,
including the evaluated month: sum the six monthly hazardous-waste quantities
and divide by six. The period is kg/month. A completed month with no hazardous
waste must be explicitly confirmed as 0 kg. The generator category thresholds
must follow Table 2 exactly: micro < 10 kg/month, small 10 to < 100, medium
100 to < 1,000, and large >= 1,000. Exactly 10, 100, and 1,000 belong to the
next category. The official text does not define a separate weighted-average
formula or how to normalize partial months; do not invent either. The
classification uses completed monthly quantities and blocks when any month in
the six-month window is missing.

## Tech Stack

Next.js 16.3.5 App Router, React 19.2.8, TypeScript, Supabase PostgreSQL, and
existing Medio Ambiente forms and permissions.

## Commands

From the repository root:

```powershell
Set-Location apps/web
npx --yes pnpm@12.4.2 test
npx --yes pnpm@12.4.2 lint
npx --yes pnpm@12.4.2 build
```

## Project Structure

- `apps/web/app/(protected)/medio-ambiente/` — waste register, monthly
  confirmation, and monthly/six-month report UI.
- `apps/web/lib/medio-ambiente/` — server actions, queries, pure calculation,
  and tests.
- `supabase/migrations/` — append-only per-site monthly zero declarations and
  clinic-scoped RLS/audit controls.

## Code Style

Represent a missing month differently from a zero month:

```ts
type MonthlyHazardousWeight =
  | { status: "measured"; kilograms: number }
  | { status: "confirmed-zero"; kilograms: 0 }
  | { status: "missing" };
```

The calculation returns no classification when any one of the six months is
missing; it never substitutes zero for an unknown month.

## Testing Strategy

- Test six-month windows, exact month boundaries, inclusive category cutoffs,
  per-site isolation, explicit zero, and missing-month blocking against
  independently worked examples from the regulation.
- Test the explicit waste-category mapping, including the legacy unclassified
  chemical type, without converting it into an unsupported hazard characteristic.
- Verify a user's zero declaration cannot be used to write for another clinic
  or site, and prevent a declaration from contradicting existing hazardous
  weight entries.
- Verify monthly all-waste totals include all recorded categories and remain
  separate from the hazardous-only classification calculation.
- Validate audit history and the correction path for an erroneous zero
  declaration.

Proposed test seams: pure moving-average/classification function and the
authenticated monthly declaration action. Confirm these seams before adding
tests.

## Boundaries

- Always: calculate per site; include the selected completed month and previous
  five calendar months; require a weighed record or explicit zero confirmation
  for every month; distinguish hazardous-only classification from all-waste
  monthly totals; retain legacy chemical rows as unclassified; never infer a
  specific chemical characteristic; cite the rule in the interface.
- Ask first: changing the metric, waste categories, denominator, or period.
- Never: convert a missing month into zero, combine multiple sites for legal
  classification, or label an operational all-waste average as the legal
  generator classification.

## Success Criteria

- Each site has monthly category totals and the six-month hazardous moving
  average in kg/month.
- A missing site/month is labelled incomplete and produces no classification.
- An authorized user can explicitly confirm a month with no hazardous waste;
  that declaration is clinic/site-scoped and auditable.
- Hazardous and non-hazardous categories are not confused in the generator
  classification.
- Monthly categories align with Manual §5.1; historical generic chemical rows
  remain intact and visibly unclassified.
- The exact legal formula, thresholds, and inclusive boundaries are verified
  from the cited primary sources before implementation is considered complete.

## Open Questions

- The cited rules do not define a formula for a separate weighted average or
  treatment of partial months. The implementation will use the documented
  six-month moving average over completed months and will not label it as a
  distinct weighted average.
