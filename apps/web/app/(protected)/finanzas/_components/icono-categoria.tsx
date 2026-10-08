import {
  ArmchairIcon,
  ArrowLeftRightIcon,
  Building2Icon,
  CalculatorIcon,
  CoinsIcon,
  CreditCardIcon,
  EllipsisIcon,
  FileSpreadsheetIcon,
  FuelIcon,
  HandCoinsIcon,
  HeartPulseIcon,
  LandmarkIcon,
  MonitorSmartphoneIcon,
  PackageIcon,
  PiggyBankIcon,
  ReceiptIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StampIcon,
  StethoscopeIcon,
  TagIcon,
  Undo2Icon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";

// Íconos de las categorías (columna `icono` de fin_categorias). Un mapa
// fijo en vez de cargar todo lucide dinámicamente.
const ICONOS: Record<string, LucideIcon> = {
  armchair: ArmchairIcon,
  "arrow-left-right": ArrowLeftRightIcon,
  "building-2": Building2Icon,
  calculator: CalculatorIcon,
  coins: CoinsIcon,
  "credit-card": CreditCardIcon,
  ellipsis: EllipsisIcon,
  "file-spreadsheet": FileSpreadsheetIcon,
  fuel: FuelIcon,
  "hand-coins": HandCoinsIcon,
  "heart-pulse": HeartPulseIcon,
  landmark: LandmarkIcon,
  "monitor-smartphone": MonitorSmartphoneIcon,
  package: PackageIcon,
  "piggy-bank": PiggyBankIcon,
  receipt: ReceiptIcon,
  scale: ScaleIcon,
  "shield-check": ShieldCheckIcon,
  sparkles: SparklesIcon,
  stamp: StampIcon,
  stethoscope: StethoscopeIcon,
  tag: TagIcon,
  "undo-2": Undo2Icon,
  users: UsersIcon,
  zap: ZapIcon,
};

export function IconoCategoria({ icono, className }: { icono: string; className?: string }) {
  const Icono = ICONOS[icono] ?? TagIcon;
  return <Icono className={className} aria-hidden />;
}
