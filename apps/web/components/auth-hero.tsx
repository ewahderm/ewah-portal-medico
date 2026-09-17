import { ShieldCheck } from "lucide-react";

const FEATURES = [
  "Gestión completa de pacientes e historias clínicas",
  "Control de inventario, insumos y proveedores",
  "Módulos SGSST, RRHH y Activos integrados",
  "Reportes INVIMA y cumplimiento regulatorio",
];

export function AuthHero() {
  return (
    <div className="relative hidden overflow-hidden bg-[#0a0714] lg:flex lg:flex-col lg:justify-center lg:px-16 lg:py-12">
      {/* Glow decorativo — dirige la mirada hacia el centro sin competir con el texto */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 rounded-full bg-gradient-to-br from-violet-600/40 via-fuchsia-600/20 to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl"
      />

      <div className="relative max-w-md">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-white/80 backdrop-blur-sm">
          <ShieldCheck className="size-3.5 text-violet-300" aria-hidden />
          SISTEMA MÉDICO
        </span>

        <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
          EWAH Tech
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            Gestión Clínica Inteligente
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
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400"
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
