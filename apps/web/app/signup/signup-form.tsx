"use client";

import { useActionState, useState } from "react";
import { Building2Icon, UserRoundIcon } from "lucide-react";
import { signUpClinica } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Pura diferencia de copy en el formulario — por debajo, un consultorio
// independiente crea exactamente el mismo tipo de cuenta que una clínica
// (mismo bootstrap_clinica, mismos campos, incluido el NIT: en Colombia
// todo profesional independiente tiene uno derivado de su cédula). Nada de
// esto se guarda; es solo para que las etiquetas tengan sentido según quién
// se está registrando.
type TipoCuenta = "clinica" | "independiente";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpClinica, null);
  const [tipo, setTipo] = useState<TipoCuenta>("clinica");
  const esIndependiente = tipo === "independiente";

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label>Tipo de cuenta</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={esIndependiente ? "outline" : "default"}
            className="flex-1"
            onClick={() => setTipo("clinica")}
          >
            <Building2Icon /> Clínica
          </Button>
          <Button
            type="button"
            size="sm"
            variant={esIndependiente ? "default" : "outline"}
            className="flex-1"
            onClick={() => setTipo("independiente")}
          >
            <UserRoundIcon /> Consultorio independiente
          </Button>
        </div>
        {esIndependiente ? (
          <p className="text-xs text-muted-foreground">
            Podrás invitar asistentes más adelante, desde Usuarios.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombreClinica">
          {esIndependiente ? "Nombre de tu consultorio" : "Nombre de la clínica"}
        </Label>
        <Input
          id="nombreClinica"
          name="nombreClinica"
          placeholder={esIndependiente ? "Consultorio Dr. Ejemplo" : "Clínica Ejemplo S.A.S."}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nit">NIT</Label>
        <Input id="nit" name="nit" placeholder="900123456" required />
        {esIndependiente ? (
          <p className="text-xs text-muted-foreground">
            Si no tienes NIT de empresa, usa el que te corresponde como persona natural (el
            derivado de tu cédula).
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombreAdmin">Tu nombre</Label>
        <Input id="nombreAdmin" name="nombreAdmin" placeholder="Nombre completo" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Tu correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="usuario@ejemplo.com"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Mínimo 8 caracteres"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-gradient-to-r from-[#00c9ec] to-[#0097b7] text-[#0d1825] font-semibold hover:from-[#1fd3f0] hover:to-[#00a9cc]"
        disabled={pending}
      >
        {pending ? "Creando cuenta..." : esIndependiente ? "Crear consultorio" : "Crear clínica"}
      </Button>
    </form>
  );
}
