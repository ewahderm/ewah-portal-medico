import { ShieldCheckIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoHabilitacion } from "@/lib/habilitacion/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HabilitacionNav } from "./_components/habilitacion-nav";

// Esqueleto común del módulo: título + subnavegación. Cada página vuelve a
// verificar VIEW por su cuenta (layout y página se renderizan en paralelo:
// el chequeo del layout no protege los datos de la página);
// getAccesoHabilitacion está memoizado con cache() para no repetir las RPC.
export default async function HabilitacionLayout({ children }: { children: React.ReactNode }) {
  await requireUsuario();
  const acceso = await getAccesoHabilitacion();

  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver el módulo de Habilitación.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ShieldCheckIcon className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Habilitación</h1>
          <p className="text-sm text-muted-foreground">
            Inscripción en el REPS y cumplimiento de la Resolución 3100 de 2019, paso a paso.
          </p>
        </div>
      </div>

      <HabilitacionNav gestion={acceso.gestion} />

      <div className="animate-in fade-in duration-200 motion-reduce:animate-none">{children}</div>
    </div>
  );
}
