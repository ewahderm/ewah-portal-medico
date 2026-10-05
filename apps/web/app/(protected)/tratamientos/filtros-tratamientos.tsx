import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { toItems, type Opcion } from "@/lib/forms/opciones";

/**
 * Filtro de búsqueda del historial de Tratamientos — un <form method="GET">
 * (mismo patrón que la búsqueda ?q= de Pacientes) en vez de estado de
 * cliente + server action (el patrón de Movimientos de Inventario): así se
 * mantiene consistente con la paginación por URL de esta pantalla (page,
 * el redirect de recuperación de rango) sin tener que reconstruir eso en
 * client-side. Al ser un form nativo sin JS, cada búsqueda es una
 * navegación completa — los Combobox no necesitan sincronizarse a mano,
 * siempre remontan con el valor correcto de la URL.
 */
export function FiltrosTratamientos({
  profesionales,
  sedes,
  pacientes,
  tiposTratamiento,
  valores,
}: {
  profesionales: Opcion[];
  sedes: Opcion[];
  pacientes: Opcion[];
  tiposTratamiento: Opcion[];
  valores: {
    profesionalId?: string;
    sedeId?: string;
    pacienteId?: string;
    tipoTratamientoId?: string;
    desde?: string;
    hasta?: string;
  };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <SearchIcon className="size-4 text-primary" /> Filtros de búsqueda
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form method="GET" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* ids con sufijo "Filtro": TratamientoDialog (que se abre sobre
                esta misma página) usa estos mismos nombres de campo para su
                propio formulario — sin el sufijo, dos elementos con el
                mismo id conviven en el DOM a la vez (HTML inválido) y
                rompen la asociación de <Label htmlFor>. El `name` NO lleva
                el sufijo: es el nombre real del query param que lee
                tratamientos/page.tsx vía searchParams. */}
            <div className="space-y-1.5">
              <Label htmlFor="profesionalIdFiltro">Profesional</Label>
              <Combobox
                id="profesionalIdFiltro"
                name="profesionalId"
                items={toItems(profesionales)}
                defaultValue={valores.profesionalId}
                placeholder="Buscar profesional..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sedeIdFiltro">Sede</Label>
              <Combobox
                id="sedeIdFiltro"
                name="sedeId"
                items={toItems(sedes)}
                defaultValue={valores.sedeId}
                placeholder="Buscar sede..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pacienteIdFiltro">Paciente</Label>
              <Combobox
                id="pacienteIdFiltro"
                name="pacienteId"
                items={toItems(pacientes)}
                defaultValue={valores.pacienteId}
                placeholder="Buscar paciente..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipoTratamientoIdFiltro">Tipo de tratamiento</Label>
              <Combobox
                id="tipoTratamientoIdFiltro"
                name="tipoTratamientoId"
                items={toItems(tiposTratamiento)}
                defaultValue={valores.tipoTratamientoId}
                placeholder="Buscar tipo..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="desde">Fecha desde</Label>
              <Input id="desde" name="desde" type="date" defaultValue={valores.desde} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hasta">Fecha hasta</Label>
              <Input id="hasta" name="hasta" type="date" defaultValue={valores.hasta} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            {/* <a> nativa a propósito, no <Link>: Link navega del lado del
                cliente y NO remonta los Combobox (estado no controlado), así
                que "Limpiar" dejaba el valor anterior visible aunque la
                tabla ya mostrara los resultados sin filtro. Con navegación
                dura, todo el árbol remonta y los Combobox arrancan vacíos,
                igual que "Buscar" (un <form method="GET"> nativo, que
                tampoco pasa por el router de Next). */}
            <Button variant="outline" nativeButton={false} render={<a href="/tratamientos" />}>
              <XIcon /> Limpiar
            </Button>
            <Button type="submit">
              <SearchIcon /> Buscar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
