import QRCode from "qrcode";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UpsellPlan } from "../../_components/upsell-plan";
import { PrintButton } from "./print-button";

type LoteEtiqueta = {
  id: string;
  numero_lote: string | null;
  fecha_vencimiento: string | null;
  insumos: { nombre: string } | null;
  sedes: { nombre: string } | null;
};

// El QR solo lleva el id del lote — nunca datos del paciente/clínica — la
// pantalla de escaneo (/inventario/escanear) hace la búsqueda real, ya
// protegida por RLS. El texto legible bajo el código es lo que de verdad
// importa para alguien mirando el sticker sin escanearlo.
async function qrSvg(loteId: string) {
  return QRCode.toString(loteId, { type: "svg", margin: 0, width: 80 });
}

export default async function EtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "inventario",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const { data: tieneEntitlement } = await supabase.rpc("has_entitlement", {
    modulo_code: "inventario",
  });

  if (!tieneEntitlement) {
    return (
      <UpsellPlan
        tituloModulo="Inventario"
        mensaje="El control de stock y costeo de insumos no está activo en tu clínica todavía. El registro de qué se aplicó a cada paciente (en Tratamientos) sigue funcionando normal — eso nunca se bloquea. Esta función se activa con el plan Pro. Pídele a tu administrador que la habilite."
      />
    );
  }

  const { ids } = await searchParams;
  const idsLista = (ids ?? "").split(",").filter(Boolean);

  if (idsLista.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No se indicó ningún lote para imprimir.</AlertDescription>
      </Alert>
    );
  }

  const { data: lotesData } = await supabase
    .from("lotes")
    .select("id, numero_lote, fecha_vencimiento, insumos(nombre), sedes(nombre)")
    .in("id", idsLista);

  const lotes = (lotesData ?? []) as unknown as LoteEtiqueta[];
  const etiquetas = await Promise.all(
    lotes.map(async (lote) => ({ lote, svg: await qrSvg(lote.id) })),
  );

  return (
    <div className="space-y-4">
      {/* Solo visible en pantalla — al imprimir, @page ya define el tamaño
          de la etiqueta y este bloque no aporta nada al sticker físico. */}
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold">Etiquetas de inventario</h1>
        <p className="text-sm text-muted-foreground">
          {etiquetas.length} etiqueta{etiquetas.length === 1 ? "" : "s"} lista
          {etiquetas.length === 1 ? "" : "s"} para imprimir.
        </p>
        <div className="mt-3">
          <PrintButton />
        </div>
      </div>

      <style>{`
        @page { size: 50mm 30mm; margin: 2mm; }
        @media print {
          .etiqueta { page-break-after: always; }
          .etiqueta:last-child { page-break-after: auto; }
        }
      `}</style>

      {etiquetas.map(({ lote, svg }) => (
        <div
          key={lote.id}
          className="etiqueta flex items-center gap-2 border p-2 print:border-0 print:p-0"
          style={{ width: "50mm", height: "30mm" }}
        >
          <div className="shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="min-w-0 space-y-0.5 text-[7pt] leading-tight">
            <p className="truncate font-semibold">{lote.insumos?.nombre ?? "—"}</p>
            <p className="truncate text-muted-foreground">Lote: {lote.numero_lote ?? "—"}</p>
            {lote.fecha_vencimiento ? (
              <p className="truncate text-muted-foreground">Vence: {lote.fecha_vencimiento}</p>
            ) : null}
            <p className="truncate text-muted-foreground">{lote.sedes?.nombre ?? "—"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
