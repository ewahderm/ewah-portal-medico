"use client";

import { useEffect, useState, useTransition } from "react";
import { SearchIcon } from "lucide-react";
import { buscarCups, activarCups, desactivarCups, type CupsResultado } from "@/lib/parametros/cups";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exigirExito } from "@/lib/forms/resultado";

// ~10,000 códigos — nunca se listan todos de una. Sin texto de búsqueda
// se muestran los que la clínica ya activó (lo primero que alguien quiere
// ver al volver a esta pestaña); al escribir, busca en el catálogo
// completo por código o descripción (server-side, debounced).
export function CupsTab({ inicial }: { inicial: CupsResultado[] }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<CupsResultado[]>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [estados, setEstados] = useState(() => new Map(inicial.map((v) => [v.id, v.activoClinica])));

  useEffect(() => {
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const data = await buscarCups(query);
        setResultados(data);
        setEstados((prev) => {
          const next = new Map(prev);
          for (const d of data) {
            if (!next.has(d.id)) next.set(d.id, d.activoClinica);
          }
          return next;
        });
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleToggle(id: string, next: boolean) {
    setEstados((prev) => new Map(prev).set(id, next));
    setError(null);
    startTransition(async () => {
      try {
        if (next) exigirExito(await activarCups(id));
        else exigirExito(await desactivarCups(id));
      } catch (e) {
        setEstados((prev) => new Map(prev).set(id, !next));
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="relative">
        <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código o descripción..."
          className="pl-8"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {query
          ? `Resultados para "${query}" en el catálogo oficial completo.`
          : "CUPS activados por tu clínica."}{" "}
        Activa los que tu clínica realmente usa para que aparezcan al asociar un tipo de
        tratamiento — con ~10.000 códigos, nunca se ofrecen todos de una.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="hidden md:table-cell">Capítulo</TableHead>
            <TableHead className="text-right">Activo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resultados.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs whitespace-nowrap">{r.codigo}</TableCell>
              <TableCell>{r.descripcion}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {r.capitulo ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                <Switch
                  checked={estados.get(r.id) ?? r.activoClinica}
                  onCheckedChange={(checked) => handleToggle(r.id, checked)}
                />
              </TableCell>
            </TableRow>
          ))}
          {resultados.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {query ? "Sin resultados." : "Todavía no has activado ningún CUPS — búscalo arriba."}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
