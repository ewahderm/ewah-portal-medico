# EWAH Tech Platform

Plataforma SaaS médica — monorepo Turborepo con app web (Next.js) y app móvil (Expo, próximamente).

## Estructura

```
apps/
  web/      Next.js 16 — portal médico (Supabase, Stripe, IA)
  mobile/   Expo — app iOS/Android (se agrega en la fase móvil)
packages/   Código compartido entre apps (se agrega cuando haga falta)
```

## Requisitos

- Node.js 20+
- pnpm (`npm install -g pnpm`)

## Comandos

```bash
pnpm install       # instala dependencias de todo el monorepo
pnpm dev           # levanta apps/web en modo desarrollo
pnpm build         # build de producción de todas las apps
pnpm lint          # lint de todas las apps
```

## Variables de entorno

Cada app tiene su propio `.env.local` (ver `apps/web/.env.example` cuando se agregue). Nunca se commitean — están en `.gitignore`.

## Documentación

Ver el Manual de Configuración de EWAH Tech (Supabase, Vercel, Cloudflare, Stripe, Resend, Redis, Gemini, EndlessMedical, Expo, Firebase, Apple, Google Play) para el detalle de cada servicio.
