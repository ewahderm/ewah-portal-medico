"use client";

import { useActionState } from "react";
import { signUpClinica } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpClinica, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="nombreClinica">Nombre de la clínica</Label>
        <Input id="nombreClinica" name="nombreClinica" placeholder="Clínica Ejemplo S.A.S." required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nit">NIT</Label>
        <Input id="nit" name="nit" placeholder="900123456" required />
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
        {pending ? "Creando cuenta..." : "Crear clínica"}
      </Button>
    </form>
  );
}
