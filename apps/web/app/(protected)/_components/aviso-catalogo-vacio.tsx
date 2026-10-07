import Link from "next/link";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Una clínica nueva no trae tipos de tratamiento ni consultorios: sin este
// aviso el formulario muestra una lista vacía y la persona no sabe por qué
// no puede agendar. Dice qué falta y lleva directo a Parámetros.
export function AvisoCatalogoVacio({ children }: { children: React.ReactNode }) {
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription>
        {children}{" "}
        <Link href="/parametros" className="font-medium underline underline-offset-4">
          Ir a Parámetros
        </Link>
      </AlertDescription>
    </Alert>
  );
}
