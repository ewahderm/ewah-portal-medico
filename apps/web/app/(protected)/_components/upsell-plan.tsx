import { SparklesIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Pantalla de upsell reutilizable: se muestra en vez del contenido normal de
 * un módulo/feature cuando el rol SÍ tiene permiso pero el plan de la
 * clínica no incluye esa función (has_entitlement = false). Tono comercial,
 * nunca de error — por eso no usa <Alert variant="destructive">. Sin botón
 * de acción real todavía: no existe un flujo de "avisar al administrador".
 */
export function UpsellPlan({
  tituloModulo,
  mensaje,
}: {
  tituloModulo: string;
  mensaje: string;
}) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader className="items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <SparklesIcon className="size-6 text-primary" />
        </div>
        <CardTitle className="text-base font-semibold">{tituloModulo}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        <p>{mensaje}</p>
      </CardContent>
    </Card>
  );
}
