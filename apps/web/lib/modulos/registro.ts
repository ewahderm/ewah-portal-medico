import {
  UsersIcon,
  ClipboardListIcon,
  CalendarIcon,
  PackageIcon,
  MegaphoneIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Registro central de los módulos "de negocio" que aparecen en el launcher
 * del dashboard. NO incluye usuarios/parametros: son administrativos, ya
 * tienen su propio punto de acceso y no compiten por espacio en un launcher
 * pensado para el día a día clínico.
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
    codigo: "campanas",
    nombre: "Campañas",
    descripcion: "Mide el embudo de captación de pacientes.",
    href: "/campanas",
    icono: MegaphoneIcon,
  },
];
