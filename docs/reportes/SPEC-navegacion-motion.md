# Spec: Navigation and motion

## Objective

Make protected navigation easier to scan and consistent between desktop and
mobile. Add an explicit Dashboard destination, integrate Reportes, distinguish
clinical work, operations, compliance, and administration, and keep EWAH
platform tools separate. Use motion to explain navigation, never as decoration.

## UX Findings and Proposed Information Architecture

The current header puts Campañas in Operación, Habilitación in Administración,
and omits a direct Dashboard label. Desktop groups are dropdowns; mobile
repeats all sections in a drawer. Current active links lack `aria-current`;
desktop menu triggers suppress their default focus outline; mobile menu
animations do not opt out for reduced motion.

Proposed groups:

- Direct links: Dashboard, Reportes.
- Atención: Agenda, Pacientes, Tratamientos.
- Operación: Inventario, Recursos Humanos.
- Relación con pacientes: Campañas.
- Cumplimiento: Medio Ambiente, Habilitación, SG-SST.
- Administración: Usuarios, Parámetros, Suscripción, permission-gated Exportar.
- Plataforma EWAH: only for superadmins.

At tablet/mobile widths, use the existing drawer with these same groups. At wide
desktop widths, keep the grouped dropdown model and direct links; use the drawer
below the breakpoint where the full header no longer fits.

## Tech Stack

Next.js 16.3.5 App Router, React 19.2.8, existing Base UI navigation primitives,
Tailwind CSS, React `ViewTransition` where supported, and CSS reduced-motion
fallbacks. Do not install an animation library.

## Commands

From the repository root:

```powershell
Set-Location apps/web
npx --yes pnpm@12.4.2 test
npx --yes pnpm@12.4.2 lint
npx --yes pnpm@12.4.2 build
```

## Project Structure

- `apps/web/app/(protected)/layout.tsx` — consistent permission-filtered
  navigation items and groups.
- `apps/web/app/(protected)/_components/nav-group.tsx` — desktop groups.
- `apps/web/app/(protected)/_components/mobile-nav.tsx` — mobile drawer.
- `apps/web/app/globals.css` — transition styles and reduced-motion handling.
- `apps/web/node_modules/next/dist/docs/` — version-specific Next.js guidance,
  consulted before changes.

## Code Style

Use semantic navigation and indicate the current destination:

```tsx
<Link href={item.href} aria-current={activo ? "page" : undefined}>
  {item.label}
</Link>
```

Keep one shared group definition for desktop and mobile; do not fork labels or
permission rules by viewport.

## Testing Strategy

- Verify navigation labels, groups, permissions, active route state, and
  keyboard focus.
- Verify the drawer can be operated on touch and keyboard.
- Check page transitions in supported Chromium and graceful fallback where
  native transitions are unsupported.
- Verify `prefers-reduced-motion` disables nonessential movement.

Proposed test seams: rendered nav groups/current route semantics and a
Playwright viewport/keyboard flow. Confirm these seams before adding tests.

## Boundaries

- Always: preserve permission filtering, shared group definitions, semantic
  landmarks, visible focus, minimum touch target sizing, and reduced-motion
  support.
- Ask first: replacing top navigation with a permanent sidebar or changing
  access to modules.
- Never: animate every component on page load, remove keyboard focus
  indication, or require view-transition browser support for navigation.

## Success Criteria

- Desktop and mobile use the same reviewed groups and labels.
- Dashboard and Reportes have clearly discoverable destinations.
- Active links expose `aria-current="page"` and keyboard focus remains visible.
- Menus and route transitions respect reduced-motion settings and degrade
  gracefully.
- Navigation does not overflow at supported desktop, tablet, and mobile sizes.

## Open Questions

- Confirm the documented test seams before test-first implementation.
