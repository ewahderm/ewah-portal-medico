// URL base del sitio para armar links (invitación, confirmación, etc).
// Prioridad: SITE_URL explícita > la que Vercel inyecta sola por deployment
// (distinta en cada Preview) > localhost. Así no hay que mantener a mano
// una URL fija por ambiente en Vercel.
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
