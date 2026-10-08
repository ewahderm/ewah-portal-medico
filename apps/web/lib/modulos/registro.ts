import {
  UsersIcon,
  ClipboardListIcon,
  CalendarIcon,
  PackageIcon,
  MegaphoneIcon,
  LeafIcon,
  BriefcaseIcon,
  ShieldCheckIcon,
  HardHatIcon,
  ChartNoAxesColumnIncreasingIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Registro central de los módulos "de negocio" que aparecen en el launcher
 * del dashboard. NO incluye usuarios/parametros/suscripción: son
 * administrativos, ya tienen su propio punto de acceso y no compiten por
 * espacio en un launcher pensado para el día a día clínico/operativo.
 *
 * Todo módulo nuevo que no sea puramente administrativo (clínico u
 * operativo, como RRHH o un futuro SG-SST/Habilitación) debe agregarse
 * aquí al construirse — es el único lugar que alimenta tanto el launcher
 * del dashboard como el filtro por permiso/entitlement, así que un módulo
 * ausente de este arreglo simplemente no aparece en la pantalla principal.
 *
 * `requiereFeature` queda disponible para el día en que una tarjeta del
 * launcher necesite reflejar el estado de una sub-feature específica (hoy
 * ningún módulo del launcher lo necesita — el gating por plan del launcher
 * es siempre a nivel de módulo completo, ver dashboard/page.tsx).
 */
export type ModuloRegistro = {
  codigo: string;
  nombre: string;
  descripcion: string;
  href: string;
  icono: LucideIcon;
  requiereFeature?: string;
};

export const REGISTRO_MODULOS: ModuloRegistro[] = [
  {
    codigo: "reportes",
    nombre: "Reportes",
    descripcion: "Tendencias, tratamientos y valor registrado en un solo lugar.",
    href: "/reportes",
    icono: ChartNoAxesColumnIncreasingIcon,
  },
  {
    codigo: "pacientes",
    nombre: "Pacientes",
    descripcion: "Historial clínico y datos de contacto de cada paciente.",
    href: "/pacientes",
    icono: UsersIcon,
  },
  {
    codigo: "tratamientos",
    nombre: "Tratamientos",
    descripcion: "Registra procedimientos, fotos e insumos aplicados.",
    href: "/tratamientos",
    icono: ClipboardListIcon,
  },
  {
    codigo: "citas",
    nombre: "Agenda",
    descripcion: "Calendario de citas y disponibilidad por sede.",
    href: "/citas",
    icono: CalendarIcon,
  },
  {
    codigo: "inventario",
    nombre: "Inventario",
    descripcion: "Control de stock, lotes y costeo de insumos.",
    href: "/inventario",
    icono: PackageIcon,
  },
  {
    codigo: "finanzas",
    nombre: "Flujo de caja",
    descripcion: "Saldos de tus cuentas, lo que entra, lo que sale y en qué.",
    href: "/finanzas",
    icono: WalletIcon,
  },
  {
    codigo: "campanas",
    nombre: "Campañas",
    descripcion: "Mide el embudo de captación de pacientes.",
    href: "/campanas",
    icono: MegaphoneIcon,
  },
  // Es administrativo (incluido en todos los planes) pero, a diferencia de
  // Usuarios/Parámetros/Suscripción, SÍ es trabajo operativo del día a día
  // (temperatura, residuos, limpieza) — por eso sí compite por espacio en
  // este launcher, aunque nunca muestre la insignia "Pro" (has_entitlement
  // siempre es true para este módulo).
  {
    codigo: "medio_ambiente",
    nombre: "Medio Ambiente",
    descripcion: "Temperatura, cadena de frío, residuos, extintores y limpieza.",
    href: "/medio-ambiente",
    icono: LeafIcon,
  },
  {
    codigo: "rrhh",
    nombre: "Recursos Humanos",
    descripcion: "Empleados, documentación, nómina y honorarios.",
    href: "/rrhh",
    icono: BriefcaseIcon,
  },
  // Activo en todos los planes (es_administrativo, 0061): la tarjeta nunca
  // muestra "Pro"; el upsell de la parte de gestión ocurre dentro del módulo.
  {
    codigo: "habilitacion",
    nombre: "Habilitación",
    descripcion: "Inscripción REPS, autoevaluación y calendario regulatorio.",
    href: "/habilitacion",
    icono: ShieldCheckIcon,
  },
  {
    codigo: "sst",
    nombre: "SG-SST",
    descripcion: "Seguridad y salud en el trabajo: estándares mínimos, accidentes y documentos.",
    href: "/sst",
    icono: HardHatIcon,
  },
];
