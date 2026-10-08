import { WalletIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoFinanzas } from "@/lib/finanzas/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FinanzasNav } from "./_components/finanzas-nav";

// Esqueleto del módulo: título + subnavegación. Cada página vuelve a
// verificar VIEW (layout y página se renderizan en paralelo).
export default async function FinanzasLayout({ children }: { children: React.ReactNode }) {
  await requireUsuario();
  const acceso = await getAccesoFinanzas();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver el flujo de caja.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <WalletIcon className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Flujo de caja</h1>
          <p className="text-sm text-muted-foreground">Cuánta plata hay, cuánta entra, cuánta sale y en qué.</p>
        </div>
      </div>
      <FinanzasNav />
      <div className="animate-in fade-in duration-200 motion-reduce:animate-none">{children}</div>
    </div>
  );
}
