"use client";

import { useState } from "react";
import { MIN_JUSTIFICACION_NO_APLICA, MAX_JUSTIFICACION } from "@/lib/habilitacion/constantes";
import type { FilaCriterio } from "@/lib/habilitacion/tipos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// HU-4.2 AC1: "No aplica" exige una justificación escrita. Muchos
// criterios de 11.1 nombran dentro del texto los servicios a los que aplican
// ("servicios de urgencias, atención del parto…"); la norma deja esa
// identificación al prestador, por eso se pide el porqué.
export function NoAplicaDialog({
  fila,
  onCerrar,
  onConfirmar,
}: {
  sedeId: string;
  fila: FilaCriterio;
  onCerrar: () => void;
  onConfirmar: (justificacion: string) => void;
}) {
  const [texto, setTexto] = useState(fila.estado === "no_aplica" ? (fila.justificacion ?? "") : "");
  const largo = texto.trim().length;
  const valido = largo >= MIN_JUSTIFICACION_NO_APLICA;

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Por qué no aplica {fila.codigo}?</DialogTitle>
          <DialogDescription className="line-clamp-4">{fila.texto_literal}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) onConfirmar(texto.trim());
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="justificacion">Justificación</Label>
            <Textarea
              id="justificacion"
              autoFocus
              rows={4}
              maxLength={MAX_JUSTIFICACION}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej.: El criterio es para servicios de urgencias y en esta sede solo prestamos consulta externa."
              aria-describedby="justificacion-ayuda"
            />
            <p id="justificacion-ayuda" className="text-xs text-muted-foreground">
              {valido
                ? "Queda en el historial con tu nombre y la fecha."
                : `Escribe al menos ${MIN_JUSTIFICACION_NO_APLICA} caracteres (llevas ${largo}).`}
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valido}>
              Marcar «No aplica»
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
