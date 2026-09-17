import { ShieldCheck } from "lucide-react";
import { EwahLogo } from "@/components/ewah-logo";

const FEATURES = [
  "Gestión completa de pacientes e historias clínicas",
  "Control de inventario, insumos y proveedores",
  "Módulos SGSST, RRHH y Activos integrados",
  "Reportes INVIMA y cumplimiento regulatorio",
];

export function AuthHero() {
  return (
    <div className="relative hidden overflow-hidden bg-[#0d1825] lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-12">
      {/* Glow decorativo — dirige la mirada hacia el centro sin competir con el texto */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 rounded-full bg-gradient-to-br from-[#00c9ec]/30 via-[#0097b7]/15 to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#00c9ec]/15 blur-3xl"
      />

      <div className="relative max-w-md">
        <EwahLogo variant="light" className="mb-8" />

        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-white/80 backdrop-blur-sm">
          <ShieldCheck className="size-3.5 text-[#00c9ec]" aria-hidden />
          SISTEMA MÉDICO
        </span>

        <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
          Gestión Clínica
          <br />
          <span className="bg-gradient-to-r from-[#00c9ec] to-[#67e8f9] bg-clip-text text-transparent">
            Inteligente
          </span>
        </h1>

        <p className="mt-5 text-base leading-relaxed text-white/60">
          Plataforma integral de administración médica diseñada para consultorios en
          Colombia. Pacientes, tratamientos, inventario, SGSST, RRHH y más.
        </p>

        <ul className="mt-8 space-y-3">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm text-white/75">
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#00c9ec]"
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
