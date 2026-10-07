# Spec: Clinic profile fields

## Objective

Let a clinic administrator maintain the clinic's legal name, commercial name,
and seven-digit economic activity code in Datos básicos de la clínica. The
economic activity is a clinic attribute, not a SG-SST profile attribute. Keep
one place to edit each name: the commercial name leaves the Brand dialog.

## Tech Stack

Next.js 16.3.5 App Router, React 19.2.8, TypeScript, Supabase PostgreSQL/RPC,
and the existing EWAH form components.

## Commands

From the repository root:

```powershell
Set-Location apps/web
npx --yes pnpm@12.4.2 test
npx --yes pnpm@12.4.2 lint
npx --yes pnpm@12.4.2 build
```

## Project Structure

- `apps/web/app/(protected)/parametros/` — Datos básicos form and clinic data loader.
- `apps/web/app/(protected)/suscripcion/` — Brand settings, retaining logo and contact/notification settings.
- `apps/web/app/(protected)/sst/` and `apps/web/lib/sst/` — SG-SST reads and profile form.
- `apps/web/lib/clinicas/` — authenticated server actions.
- `supabase/migrations/` — additive data migration, backfill, and clinic-scoped RPC.
- `apps/web/lib/sst/__tests__/` and nearby tests — behavior tests.

## Code Style

Follow the existing authenticated action and clinic-scoped RPC pattern:

```ts
const codigoActividad = campoOpcional(formData, "codigoActividad");
if (codigoActividad && !/^[1-5]\d{6}$/.test(codigoActividad)) {
  throw new Error("El código de actividad debe tener 7 dígitos.");
}
```

Use named form fields, validate at the server boundary, keep legal and
commercial names separate, and use a security-definer RPC constrained to the
current clinic and administrator permission. Do not grant direct table UPDATE.

## Testing Strategy

- Validate the public action/RPC behavior for valid and invalid names and
  activity codes.
- Verify migration backfill preserves every existing `sst_perfil.codigo_actividad`
  value before removing that source column.
- Verify non-admin users cannot update these clinic attributes and cannot target
  another clinic.
- Verify SG-SST continues calculating risk class from the clinic-level code.

Proposed test seams: clinic profile server action/RPC and the SG-SST diagnostic
input. Confirm these seams before adding tests.

## Boundaries

- Always: keep `nombre` (legal) and `nombre_comercial` distinct; trim optional
  commercial name to null; backfill before removing the old SST column; preserve
  tenant isolation and admin-only writes.
- Ask first: changing who may edit clinic identity fields or adding another
  identity field.
- Never: silently discard an existing activity code, allow non-admin updates,
  or leave two conflicting UI locations to edit the commercial name.

## Success Criteria

- Both clinic names are editable independently in Datos básicos.
- The commercial name is no longer editable in Brand settings; that screen still
  manages logo and contact/notification data.
- The seven-digit code is stored on `clinicas`, retains valid existing values,
  and is read by SG-SST without being duplicated on `sst_perfil`.
- Invalid activity codes and blank legal names are rejected server-side.

## Open Questions

- None in product scope.
