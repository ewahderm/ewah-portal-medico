import Link from "next/link";
import { AuthHero } from "@/components/auth-hero";
import { EwahLogo } from "@/components/ewah-logo";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthHero />

      <div className="flex flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-12">
        <EwahLogo variant="dark" className="lg:hidden" />

        <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
          <h2 className="text-2xl font-bold tracking-tight">Registra tu clínica</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea la cuenta de administrador de tu clínica
          </p>

          <div className="mt-6">
            <SignupForm />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
