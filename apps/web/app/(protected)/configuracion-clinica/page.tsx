import { esAdministrador, requireUsuario } from "@/lib/auth/session";
import { leerConfiguracion } from "@/lib/configuracion/estado";
import { resumirConfiguracion } from "@/lib/configuracion/lista";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AsistenteConfiguracion } from "./asistente-configuracion";

// Asistente de configuración: paso a paso por módulo (?paso=N) y, sin paso,
// la lista de lo que falta con qué afecta cada cosa. Solo administradores.
export default async function ConfiguracionClinicaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireUsuario();
  if (!esAdministrador(usuario)) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Solo un administrador de la clínica puede configurarla.</AlertDescription>
      </Alert>
    );
  }
  const { modulos } = await leerConfiguracion(usuario.clinica_id);
  const q = await searchParams;
  const n = typeof q.paso === "string" ? Number.parseInt(q.paso, 10) : 0;
  const paso = Number.isInteger(n) && n >= 1 && n <= modulos.length ? n : 0;
  return <AsistenteConfiguracion modulos={modulos} resumen={resumirConfiguracion(modulos)} paso={paso} />;
}
