"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, TriangleAlertIcon } from "lucide-react";
import { contarDiasHabiles, crearSolicitud } from "@/lib/rrhh/solicitudes";
import { formatoDias, formatoHoras, horasEntre, TIPOS_SOLICITUD, validarSolicitud, type SaldosEmpleado, type TipoSolicitud } from "@/lib/rrhh/solicitudes-tipos";
import { opcionesHora } from "@/lib/citas/horarios";
import { ERROR_INESPERADO } from "@/lib/forms/resultado";
import { hoy } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const HORAS = opcionesHora();

// Nueva solicitud. Sin `empleados`, es para uno mismo (Mis solicitudes);
// con `empleados`, RRHH la registra a nombre de quien elija.
export function SolicitudDialog({
  empleados,
  saldos,
  tipoInicial = "vacaciones",
  textoBoton = "Nueva solicitud",
}: {
  empleados?: { id: string; nombre: string; laboral: boolean }[];
  saldos?: SaldosEmpleado | null;
  tipoInicial?: TipoSolicitud;
  textoBoton?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoSolicitud>(tipoInicial);
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFin, setHoraFin] = useState("09:00");
  const [motivo, setMotivo] = useState("");
  const [dias, setDias] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const empleadoElegido = empleados?.find((e) => e.id === empleadoId);
  const sinVacaciones = empleados ? empleadoElegido && !empleadoElegido.laboral : saldos ? !saldos.laboral : false;

  // Días hábiles según la clínica (domingos, festivos y, si aplica, sábados no cuentan).
  useEffect(() => {
    if (tipo !== "vacaciones" || !fechaInicio || !fechaFin || fechaFin < fechaInicio) return;
    let vigente = true;
    contarDiasHabiles(fechaInicio, fechaFin).then((n) => {
      if (vigente) setDias(n);
    });
    return () => {
      vigente = false;
    };
  }, [tipo, fechaInicio, fechaFin]);

  const diasMostrados = tipo === "vacaciones" && fechaInicio && fechaFin && fechaFin >= fechaInicio ? dias : null;
  const excede = saldos && diasMostrados !== null && diasMostrados > saldos.vacaciones.disponibles;

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    if (empleados && !empleadoId) return setError("Elige el empleado.");
    const entrada = { tipo, fechaInicio, fechaFin, fecha, horaInicio, horaFin, motivo };
    const invalido = validarSolicitud(entrada);
    if (invalido) return setError(invalido);
    setEnviando(true);
    setError(null);
    try {
      const r = await crearSolicitud({ ...entrada, empleadoId: empleados ? empleadoId : null });
      if (r.error) return setError(r.error);
      toast.add({ title: "Solicitud enviada", description: "Quien aprueba recibirá un aviso.", type: "success" });
      setOpen(false);
      router.refresh();
    } catch {
      setError(ERROR_INESPERADO);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTipo(tipoInicial);
          setError(null);
          setMotivo("");
          setDias(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <PlusIcon /> {textoBoton}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{empleados ? "Registrar una solicitud" : "Nueva solicitud"}</DialogTitle>
          <DialogDescription>
            {empleados
              ? "Para un empleado que no tiene usuario en la plataforma, o en su nombre. Queda pendiente hasta que alguien la apruebe."
              : "Queda pendiente hasta que el administrador o Recursos Humanos la apruebe. Te llegará un correo con la respuesta."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {empleados ? (
            <div className="space-y-1">
              <Label htmlFor="empleadoSolicitud">Empleado</Label>
              <Combobox
                id="empleadoSolicitud"
                items={empleados.map((e) => ({ value: e.id, label: e.nombre }))}
                value={empleadoId}
                onValueChange={(v) => setEmpleadoId(v ? String(v) : null)}
                placeholder="Elige el empleado"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Qué solicitas">
            {TIPOS_SOLICITUD.map((t) => (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={tipo === t.valor}
                onClick={() => setTipo(t.valor)}
                className={cn("rounded-lg border p-2.5 text-left text-sm transition-colors", tipo === t.valor ? "border-primary bg-accent" : "hover:bg-muted")}
              >
                <span className="block font-medium">{t.titulo}</span>
                <span className="block text-xs text-muted-foreground">{t.ayuda}</span>
              </button>
            ))}
          </div>

          {tipo === "vacaciones" ? (
            sinVacaciones ? (
              <Alert>
                <TriangleAlertIcon />
                <AlertDescription>Un contrato por prestación de servicios no genera vacaciones.</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="vacDesde">Desde</Label>
                    <Input id="vacDesde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="vacHasta">Hasta</Label>
                    <Input id="vacHasta" type="date" value={fechaFin} min={fechaInicio || undefined} onChange={(e) => setFechaFin(e.target.value)} required />
                  </div>
                </div>
                {diasMostrados !== null ? (
                  <p className="text-sm">
                    Son <span className="font-semibold">{formatoDias(diasMostrados)} hábiles</span>
                    <span className="text-muted-foreground"> (no cuentan domingos ni festivos).</span>
                    {saldos ? <span className="text-muted-foreground"> Tienes {formatoDias(saldos.vacaciones.disponibles)} disponibles.</span> : null}
                  </p>
                ) : null}
                {excede ? (
                  <Alert>
                    <TriangleAlertIcon />
                    <AlertDescription>
                      Pides más días de los que tienes acumulados. Igual puedes enviarla: quien aprueba verá que excede tu saldo y decidirá.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="permFecha">Día</Label>
                <Input id="permFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="permDesde">Desde</Label>
                <Combobox id="permDesde" items={HORAS} value={horaInicio} onValueChange={(v) => v && setHoraInicio(String(v))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="permHasta">Hasta</Label>
                <Combobox id="permHasta" items={HORAS} value={horaFin} onValueChange={(v) => v && setHoraFin(String(v))} />
              </div>
              {horaFin > horaInicio ? (
                <p className="text-sm sm:col-span-3">
                  Son <span className="font-semibold">{formatoHoras(horasEntre(horaInicio, horaFin))}</span>.
                  {tipo === "reposicion" && saldos ? <span className="text-muted-foreground"> Te quedan {formatoHoras(saldos.horas.pendientes)} por reponer.</span> : null}
                </p>
              ) : null}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="motivoSolicitud">{tipo === "permiso" ? "Motivo" : "Comentario (opcional)"}</Label>
            <Textarea
              id="motivoSolicitud"
              rows={2}
              maxLength={500}
              value={motivo}
              placeholder={tipo === "permiso" ? "Ej.: cita médica, diligencia bancaria…" : tipo === "reposicion" ? "Ej.: me quedé hasta las 8 p. m." : ""}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || (tipo === "vacaciones" && Boolean(sinVacaciones))}>
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
