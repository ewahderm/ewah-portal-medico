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

### Alta de usuarios y correo

Hay dos formas de dar de alta a alguien desde Usuarios → "Agregar usuario":

- **Con contraseña** (funciona siempre, sin configuración): el Administrador define una contraseña temporal y se la entrega a la persona. No envía correo, así que no depende de ningún servicio externo. Es el camino recomendado para pruebas y para clínicas pequeñas.
- **Invitar por correo**: le llega un enlace para definir su propia contraseña. Requiere configuración adicional, porque ese correo **no sale por Resend**: lo envía el servicio interno de Supabase, que en plan gratuito solo entrega a direcciones de miembros de tu organización y va limitado a ~2 correos/hora. Para habilitarlo de verdad:
  1. Verificar un dominio propio en Resend (registros DNS que Resend indica).
  2. Poner ese remitente en `RESEND_FROM_EMAIL` (mientras siga en `onboarding@resend.dev`, Resend solo entrega a tu propio correo — esto también afecta los correos de citas).
  3. En Supabase → Authentication → Emails → SMTP Settings, configurar el SMTP de Resend para que las invitaciones dejen de usar el servicio interno.

### Acceso a los despliegues de preview

Vercel protege por defecto los despliegues de rama (`*-git-<rama>-*.vercel.app`), así que alguien sin cuenta en el equipo de Vercel choca contra un login antes de ver la app. Para que otra persona pueda probar su rol: Vercel → Settings → Deployment Protection → Preview → *Disabled*. El acceso a los datos sigue protegido por el login de la plataforma y las políticas RLS.

## Documentación

Ver el Manual de Configuración de EWAH Tech (Supabase, Vercel, Cloudflare, Stripe, Resend, Redis, Gemini, EndlessMedical, Expo, Firebase, Apple, Google Play) para el detalle de cada servicio.
