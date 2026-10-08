import { BookOpenIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { GRUPOS, GUIAS, normalizar, textoDeGuia } from "@/lib/manual";
import { IndiceManual } from "./_components/indice-manual";

// Manual de usuario: guías por módulo con capturas del portal. Lo ve
// cualquier usuario con sesión (cada guía dice qué permiso o plan pide).
export default async function ManualPage() {
  await requireUsuario();
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BookOpenIcon className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Manual de EWAH</h1>
          <p className="text-sm text-muted-foreground">
            Guías paso a paso, con imágenes del portal, desde crear tu clínica hasta el cierre del mes. Empieza por “Primeros pasos”.
          </p>
        </div>
      </div>
      <IndiceManual
        grupos={GRUPOS}
        guias={GUIAS.map((g) => ({ slug: g.slug, titulo: g.titulo, resumen: g.resumen, grupo: g.grupo, icono: g.icono, texto: normalizar(textoDeGuia(g)) }))}
      />
    </div>
  );
}
