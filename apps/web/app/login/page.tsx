import Link from "next/link";
import { AuthHero } from "@/components/auth-hero";
import { EwahLogo } from "@/components/ewah-logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <AuthHero />

      <div className="flex flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-12">
        <EwahLogo variant="dark" className="lg:hidden" />

        <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
          <h2 className="text-2xl font-bold tracking-tight">Bienvenido</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresa tus credenciales para continuar
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿Tu clínica no tiene cuenta todavía?{" "}
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
              Regístrala
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
