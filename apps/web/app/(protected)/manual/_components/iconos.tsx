import { createElement } from "react";
import {
  BookOpenIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarIcon,
  ChartNoAxesColumnIncreasingIcon,
  ClipboardListIcon,
  CreditCardIcon,
  DownloadIcon,
  HardHatIcon,
  HouseIcon,
  LeafIcon,
  MegaphoneIcon,
  PackageIcon,
  RocketIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

// Iconos que puede usar una guía (Guia.icono).
export const ICONOS: Record<string, LucideIcon> = {
  "book-open": BookOpenIcon,
  briefcase: BriefcaseIcon,
  building: Building2Icon,
  calendar: CalendarIcon,
  chart: ChartNoAxesColumnIncreasingIcon,
  clipboard: ClipboardListIcon,
  "credit-card": CreditCardIcon,
  download: DownloadIcon,
  "hard-hat": HardHatIcon,
  house: HouseIcon,
  leaf: LeafIcon,
  megaphone: MegaphoneIcon,
  package: PackageIcon,
  rocket: RocketIcon,
  settings: SettingsIcon,
  "shield-check": ShieldCheckIcon,
  stethoscope: StethoscopeIcon,
  "user-cog": UserCogIcon,
  users: UsersIcon,
  wallet: WalletIcon,
};

// Componente (no una variable creada en el render) para el icono de una guía.
export function IconoGuia({ nombre, className }: { nombre: string; className?: string }) {
  return createElement(ICONOS[nombre] ?? BookOpenIcon, { className });
}
