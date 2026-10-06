import { formatoMoneda } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ValorLegalRow = {
  id: string;
  anio: number;
  smlv: number | null;
  auxilio_transporte: number | null;
  norma: string | null;
};

// Solo lectura: valores_legales_pais es global y lo mantiene EWAH Tech
// (RLS: escritura solo super admin). Nómina y Prestaciones toman de aquí el
// valor del año de cada período — nunca un valor fijo en el código.
export function ValoresLegalesTable({ valores }: { valores: ValorLegalRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Año</TableHead>
          <TableHead>Salario mínimo</TableHead>
          <TableHead>Auxilio de transporte</TableHead>
          <TableHead className="hidden md:table-cell">Norma</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {valores.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium">{v.anio}</TableCell>
            <TableCell className="tabular-nums">{formatoMoneda(v.smlv === null ? null : Number(v.smlv))}</TableCell>
            <TableCell className="tabular-nums">
              {formatoMoneda(v.auxilio_transporte === null ? null : Number(v.auxilio_transporte))}
            </TableCell>
            <TableCell className="hidden max-w-md text-xs whitespace-normal text-muted-foreground md:table-cell">
              {v.norma ?? "—"}
            </TableCell>
          </TableRow>
        ))}
        {valores.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              No hay valores legales cargados para el país de operación de tu clínica.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
