"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { AlertCircleIcon, Globe2Icon, LoaderCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatoMoneda } from "@/lib/format";
import { formatoFecha } from "@/lib/medio-ambiente/fecha-local";
import { obtenerAnaliticaClinica } from "@/lib/reportes/actions";
import { exigirExito } from "@/lib/forms/resultado";
import type { AnaliticaClinica, ValorPorGrupo } from "@/lib/reportes/analitica";
import { etiquetaMes, formatoEntero } from "@/lib/reportes/formato";

type Props = {
  fechaInicial: string;
  fechaFinal: string;
  initialData: AnaliticaClinica;
};

type EntidadMapa = {
  type: "Feature";
  properties?: Record<string, string | number | null>;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  } | null;
};

type ColeccionMapa = { type: "FeatureCollection"; features: EntidadMapa[] };

type PaisAgregado = AnaliticaClinica["paises"][number];

function errorMensaje(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo actualizar el reporte.";
}

function tituloPeriodo(desde: string, hasta: string) {
  return `${formatoFecha(desde)} — ${formatoFecha(hasta)}`;
}

function normalizarIso(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length !== 2 || valor === "-9" || valor === "-99") return null;
  return valor.toUpperCase();
}

function extraerIso(entidad: EntidadMapa): string | null {
  const propiedades = entidad.properties ?? {};
  for (const clave of ["iso2", "ISO_A2_EH", "ISO_A2", "iso_a2_eh", "iso_a2", "ADM0_A3", "adm0_a3"]) {
    const iso = normalizarIso(propiedades[clave]);
    if (iso) return iso;
  }
  return null;
}

function proyectarAnillo(anillo: number[][]): string {
  return anillo
    .filter((punto) => Number.isFinite(punto[0]) && Number.isFinite(punto[1]))
    .map(([longitud, latitud], index) => {
      const x = ((longitud + 180) / 360) * 720;
      const y = ((90 - Math.max(-90, Math.min(90, latitud))) / 180) * 340 + 10;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("") + "Z";
}

function trazoEntidad(entidad: EntidadMapa): string {
  if (!entidad.geometry) return "";
  const poligonos = entidad.geometry.type === "Polygon"
    ? [entidad.geometry.coordinates as number[][][]]
    : entidad.geometry.coordinates as number[][][][];
  return poligonos.flatMap((poligono) => poligono.map(proyectarAnillo)).join("");
}

// Relleno con los colores de marca mezclados con transparente: el fondo del
// mapa (bg-muted) se ve a través, así funciona igual en tema claro y oscuro.
function intensidad(valor: number, maximo: number): string {
  if (valor <= 0 || maximo <= 0) return "color-mix(in oklab, var(--ewah-slate) 16%, transparent)";
  const porcentaje = 22 + 73 * Math.sqrt(valor / maximo);
  return `color-mix(in oklab, var(--ewah-cyan) ${porcentaje.toFixed(1)}%, transparent)`;
}

function PaisMapa({ paises }: { paises: PaisAgregado[] }) {
  const [geo, setGeo] = useState<ColeccionMapa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<PaisAgregado | null>(null);
  const agregados = useMemo(() => new Map(paises.map((pais) => [pais.codigoIso, pais])), [paises]);
  const maximo = useMemo(() => Math.max(0, ...paises.map((pais) => pais.cantidad)), [paises]);
  const geometria = useMemo(() => geo?.features.flatMap((entidad, index) => {
    const iso = extraerIso(entidad);
    const pais = iso ? agregados.get(iso) : undefined;
    const d = trazoEntidad(entidad);
    return d ? [{ d, iso, pais, index }] : [];
  }) ?? [], [geo, agregados]);

  useEffect(() => {
    let vigente = true;
    fetch("/world-countries.json", { cache: "force-cache" })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error(`No se pudo cargar el mapa (HTTP ${respuesta.status}).`);
        return respuesta.json() as Promise<ColeccionMapa>;
      })
      .then((coleccion) => {
        if (vigente && coleccion.type === "FeatureCollection" && Array.isArray(coleccion.features)) {
          setGeo(coleccion);
        } else if (vigente) {
          throw new Error("El archivo del mapa tiene un formato inesperado.");
        }
      })
      .catch((motivo: unknown) => {
        if (vigente) setError(errorMensaje(motivo));
      });
    return () => {
      vigente = false;
    };
  }, []);

  // Si cambia el periodo, la selección anterior puede no existir: se busca
  // por clave en los datos actuales y, si no está, se toma el primero.
  const seleccionado = (seleccion && paises.find((pais) => pais.clave === seleccion.clave)) ?? paises[0] ?? null;

  return (
    <Card className="reporte-reveal min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2Icon className="size-4 text-accent-foreground" aria-hidden="true" />
          País de residencia
        </CardTitle>
        <CardDescription>Distribución de tratamientos registrados por país del paciente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !geo ? (
          <div className="flex h-52 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            Cargando mapa...
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-muted/50 p-2">
            <svg
              viewBox="0 0 720 360"
              className="h-auto max-h-[390px] w-full text-foreground"
              role="img"
              aria-label="Mapa mundial de tratamientos registrados por país de residencia. El listado de abajo tiene las mismas cifras."
            >
              <defs>
                <pattern id="reporte-oceano" width="14" height="14" patternUnits="userSpaceOnUse">
                  <path d="M14 0H0V14" fill="none" stroke="currentColor" strokeOpacity=".06" strokeWidth=".5" />
                </pattern>
              </defs>
              <rect width="720" height="360" fill="url(#reporte-oceano)" />
              {geometria.map(({ d, iso, pais, index }) => {
                const activo = !!pais && pais.clave === seleccionado?.clave;
                return (
                  <path
                    key={`${iso ?? "pais"}-${index}`}
                    d={d}
                    fill={intensidad(pais?.cantidad ?? 0, maximo)}
                    stroke={activo ? "var(--foreground)" : "var(--card)"}
                    strokeWidth={activo ? "1.2" : ".6"}
                    fillRule="evenodd"
                    className="transition-[fill,opacity] duration-500 hover:opacity-75 motion-reduce:transition-none"
                    onPointerEnter={() => pais && setSeleccion(pais)}
                    onClick={() => pais && setSeleccion(pais)}
                  >
                    <title>{pais ? `${pais.nombre}: ${formatoEntero(pais.cantidad)} tratamientos` : "Sin tratamientos registrados en este periodo"}</title>
                  </path>
                );
              })}
            </svg>
          </div>
        )}
        {seleccionado ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2" aria-live="polite">
            <span className="font-medium">{seleccionado.nombre}</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatoEntero(seleccionado.cantidad)} tratamientos · {formatoMoneda(seleccionado.valorRegistrado)}
            </span>
          </div>
        ) : null}
        <ul className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2" aria-label="Tratamientos por país">
          {paises.map((pais) => (
            <li key={pais.clave ?? pais.nombre}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSeleccion(pais)}
                aria-pressed={seleccionado?.clave === pais.clave}
                className="w-full justify-between gap-3 font-normal aria-pressed:bg-muted"
              >
                <span className="truncate">{pais.nombre}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatoEntero(pais.cantidad)}</span>
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="h-3 w-10 rounded-sm"
            style={{
              background: "linear-gradient(to right, color-mix(in oklab, var(--ewah-cyan) 22%, transparent), var(--ewah-cyan))",
            }}
            aria-hidden="true"
          />
          Más intenso = más tratamientos.
        </div>
      </CardContent>
    </Card>
  );
}

function TendenciaLineal({
  titulo,
  idGradiente,
  datos,
  valor,
  formato,
}: {
  titulo: string;
  idGradiente: string;
  datos: AnaliticaClinica["tendencia"];
  valor: (dato: AnaliticaClinica["tendencia"][number]) => number;
  formato: (valor: number) => string;
}) {
  const maximo = Math.max(1, ...datos.map(valor));
  const puntos = datos.map((dato, index) => {
    const x = datos.length < 2 ? 360 : 24 + (index * 672) / (datos.length - 1);
    const y = 148 - (valor(dato) / maximo) * 122;
    return [x, y] as const;
  });
  const trazo = puntos.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const mesPrimero = datos[0] ? etiquetaMes(datos[0].mes) : "";
  const mesUltimo = datos.at(-1) ? etiquetaMes(datos.at(-1)!.mes) : "";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {datos.length ? `${formato(valor(datos.at(-1)!))} último mes` : "Sin datos"}
        </p>
      </div>
      {datos.length ? (
        <>
          <svg
            viewBox="0 0 720 170"
            className="h-36 w-full overflow-visible"
            role="img"
            aria-label={`${titulo} por mes: ${datos.map((dato) => `${etiquetaMes(dato.mes)}, ${formato(valor(dato))}`).join("; ")}`}
          >
            {[26, 86, 148].map((y) => <line key={y} x1="20" x2="700" y1={y} y2={y} stroke="currentColor" strokeOpacity=".1" strokeDasharray="3 5" />)}
            <defs>
              <linearGradient id={idGradiente} x1="0" x2="0" y1="0" y2="1">
                <stop stopColor="var(--ewah-cyan)" />
                <stop offset="1" stopColor="var(--ewah-cyan)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${trazo} L${puntos.at(-1)?.[0] ?? 0},148 L${puntos[0]?.[0] ?? 0},148 Z`} fill={`url(#${idGradiente})`} opacity=".16" />
            <path
              d={trazo}
              pathLength={1}
              fill="none"
              stroke="var(--ewah-cyan-dark)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="reporte-trace"
            />
            {puntos.map(([x, y], index) => (
              <circle key={datos[index].mes} cx={x} cy={y} r="3.5" fill="var(--ewah-cyan-dark)">
                <title>{`${etiquetaMes(datos[index].mes)}: ${formato(valor(datos[index]))}`}</title>
              </circle>
            ))}
          </svg>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{mesPrimero}</span>
            <span>{mesUltimo}</span>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">No hay datos para este periodo.</p>
      )}
    </div>
  );
}

function Ranking({ titulo, descripcion, grupos }: { titulo: string; descripcion: string; grupos: ValorPorGrupo[] }) {
  const maximo = Math.max(1, ...grupos.map((grupo) => grupo.cantidad));
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        {grupos.length ? (
          <ol className="space-y-4">
            {grupos.map((grupo, index) => (
              <li key={`${grupo.clave ?? grupo.nombre}-${index}`} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{grupo.nombre}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatoEntero(grupo.cantidad)} · {formatoMoneda(grupo.valorRegistrado)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="reporte-bar h-full rounded-full bg-primary transition-[width] duration-700 motion-reduce:transition-none"
                    style={{ width: `${(grupo.cantidad / maximo) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No hay datos para este periodo.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AnaliticaDashboard({ fechaInicial, fechaFinal, initialData }: Props) {
  const [desde, setDesde] = useState(fechaInicial);
  const [hasta, setHasta] = useState(fechaFinal);
  const [analitica, setAnalitica] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, startTransition] = useTransition();
  const [fechasAplicadas, setFechasAplicadas] = useState({ desde: fechaInicial, hasta: fechaFinal });

  function actualizarReporte(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const resultado = exigirExito(await obtenerAnaliticaClinica(desde, hasta));
        setAnalitica(resultado);
        setFechasAplicadas({ desde, hasta });
      } catch (motivo) {
        setError(errorMensaje(motivo));
      }
    });
  }

  const ultimoMes = analitica.tendencia.at(-1)?.cantidad ?? 0;
  const paisesRepresentados = new Set(analitica.paises.flatMap((pais) => pais.codigoIso ? [pais.codigoIso] : [])).size;

  return (
    <div className="space-y-5">
      <form
        onSubmit={actualizarReporte}
        className="reporte-reveal flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-sm font-medium">Periodo de análisis</p>
          <p className="text-xs text-muted-foreground">Hasta 10 años, incluidos el primer y el último día</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-auto">
          <div className="space-y-1">
            <Label htmlFor="analitica-desde">Desde</Label>
            <Input id="analitica-desde" type="date" value={desde} onDateChange={setDesde} required className="min-w-0 sm:w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="analitica-hasta">Hasta</Label>
            <Input id="analitica-hasta" type="date" value={hasta} onDateChange={setHasta} required className="min-w-0 sm:w-40" />
          </div>
        </div>
        <Button type="submit" disabled={actualizando}>
          {actualizando ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" /> : null}
          {actualizando ? "Actualizando..." : "Actualizar"}
        </Button>
      </form>
      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Periodo aplicado: {tituloPeriodo(fechasAplicadas.desde, fechasAplicadas.hasta)}
      </p>
      <section className="rounded-xl border bg-card px-4 py-2" aria-label="Resumen del periodo">
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="space-y-1 py-3 sm:pr-4">
            <p className="text-sm text-muted-foreground">Tratamientos registrados</p>
            <p className="text-2xl font-semibold tabular-nums">{formatoEntero(analitica.resumen.cantidad)}</p>
            <p className="text-xs text-muted-foreground">No incluye los anulados</p>
          </div>
          <div className="space-y-1 py-3 sm:px-4">
            <p className="text-sm text-muted-foreground">Valor registrado</p>
            <p className="break-words text-2xl font-semibold tabular-nums">{formatoMoneda(analitica.resumen.valorRegistrado)}</p>
            <p className="text-xs text-muted-foreground">{formatoEntero(analitica.resumen.cantidadConValor)} tratamientos con valor informado</p>
          </div>
          <div className="space-y-1 py-3 sm:pl-4">
            <p className="text-sm text-muted-foreground">Países con actividad</p>
            <p className="text-2xl font-semibold tabular-nums">{formatoEntero(paisesRepresentados)}</p>
            <p className="text-xs text-muted-foreground">{formatoEntero(ultimoMes)} tratamientos en el último mes del periodo</p>
          </div>
        </div>
      </section>
      <Alert>
        <AlertDescription>
          El valor es el costo registrado en cada tratamiento; no confirma que se haya cobrado. Los
          tratamientos sin costo cuentan en la cantidad, pero no suman valor.
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <PaisMapa paises={analitica.paises} />
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Tendencia mensual</CardTitle>
            <CardDescription>Actividad y valor de los tratamientos incluidos en el periodo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <TendenciaLineal
              titulo="Tratamientos registrados"
              idGradiente="reporte-tendencia-cantidad"
              datos={analitica.tendencia}
              valor={(dato) => dato.cantidad}
              formato={formatoEntero}
            />
            <div className="border-t pt-5">
              <TendenciaLineal
                titulo="Valor registrado"
                idGradiente="reporte-tendencia-valor"
                datos={analitica.tendencia}
                valor={(dato) => dato.valorRegistrado}
                formato={formatoMoneda}
              />
            </div>
            {analitica.tendencia.length ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Ver datos por mes</summary>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Tratamientos</TableHead>
                      <TableHead className="text-right">Valor registrado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analitica.tendencia.map((dato) => (
                      <TableRow key={dato.mes}>
                        <TableCell>{etiquetaMes(dato.mes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatoEntero(dato.cantidad)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatoMoneda(dato.valorRegistrado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <section className="grid gap-4 xl:grid-cols-3" aria-label="Desglose de actividad">
        <Ranking titulo="Tratamientos" descripcion="Tipos con mayor actividad." grupos={analitica.tratamientos} />
        <Ranking titulo="Profesionales" descripcion="Actividad asociada a cada profesional." grupos={analitica.profesionales} />
        <Ranking titulo="Medios de pago" descripcion="Medios registrados en los tratamientos." grupos={analitica.mediosPago} />
      </section>
    </div>
  );
}
