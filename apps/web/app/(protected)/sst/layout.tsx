import { HardHatIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst } from "@/lib/sst/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SstNav } from "./_components/sst-nav";

// Esqueleto del módulo: título + subnavegación. Cada página vuelve a
// verificar VIEW (layout y página se renderizan en paralelo).
export default async function SstLayout({ children }: { children: React.ReactNode }) {
  await requireUsuario();
  const acceso = await getAccesoSst();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver el SG-SST.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <HardHatIcon className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">SG-SST</h1>
          <p className="text-sm text-muted-foreground">
            Seguridad y salud en el trabajo: Decreto 1072 de 2015 y estándares mínimos de la Resolución 0312 de 2019.
          </p>
        </div>
      </div>
      <SstNav />
      <div className="animate-in fade-in duration-200 motion-reduce:animate-none">{children}</div>
    </div>
  );
}
