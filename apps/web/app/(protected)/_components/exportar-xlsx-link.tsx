import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Enlace plano, no un botón con JS: el navegador maneja la descarga solo
// a partir del Content-Disposition que devuelve el Route Handler — no hace
// falta ningún estado de "descargando...".
export function ExportarXlsxLink({ href, label = "Exportar" }: { href: string; label?: string }) {
  return (
    <Button variant="outline" size="sm" nativeButton={false} render={<a href={href} />}>
      <DownloadIcon /> {label}
    </Button>
  );
}
