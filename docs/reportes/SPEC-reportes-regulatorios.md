# Spec: Regulatory and payroll reports

## Objective

Add two reports to the shared Reportes destination:

1. An INVIMA report of inventory items marked for regulatory reporting, with
   Excel export.
2. Payroll commissions grouped by employee and pay period, using the
   commission amounts already stored in payroll. This is not a new commission
   calculation per clinical professional.

## Tech Stack

Next.js 16.3.5 App Router, React 19.2.8, TypeScript, Supabase, and the existing
XLSX/export helpers.

## Commands

From the repository root:

```powershell
Set-Location apps/web
npx --yes pnpm@12.4.2 test
npx --yes pnpm@12.4.2 lint
npx --yes pnpm@12.4.2 build
```

## Project Structure

- `apps/web/app/(protected)/reportes/` — report tabs and export links.
- `apps/web/lib/reportes/` — queries and export data builders.
- Existing `insumos` and `comprobantes_nomina` tables — report sources.
- `supabase/migrations/` — only if additional access control/aggregate queries
  are required.

## Code Style

Keep amounts and their source meaning explicit:

```ts
type PayrollCommissionRow = {
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  commissionAmount: number;
};
```

Use tenant-scoped server queries and existing spreadsheet utilities; exclude
annulled payroll receipts.

## Testing Strategy

- Verify INVIMA export rows are exactly the clinic's eligible regulatory items.
- Verify commission totals by employee/period and exclusion of annulled receipts.
- Verify required permissions and clinic scoping at server seams.

Proposed test seams: report data builders and export route authorization.
Confirm these seams before adding tests.

## Boundaries

- Always: gate INVIMA rows with inventory permissions and payroll commissions
  with RRHH/payroll permissions; exclude annulled records; label commissions as
  payroll values recorded by period.
- Ask first: calculating commissions from treatment revenue, adding commission
  rates, or connecting payroll employees to clinical professionals.
- Never: imply that payroll commissions are per-treatment commissions or reveal
  payroll amounts to users lacking existing payroll access.

## Success Criteria

- The INVIMA report is exportable as XLSX and follows existing inventory
  regulatory-report fields.
- Commissions are grouped by employee and payroll period from existing
  non-annulled receipts.
- Unauthorized users cannot query or export either dataset.

## Open Questions

- Confirm the documented test seams before test-first implementation.
