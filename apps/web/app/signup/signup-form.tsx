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
        <Input id="nombreClinica" name="nombreClinica" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nit">NIT</Label>
        <Input id="nit" name="nit" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombreAdmin">Tu nombre</Label>
        <Input id="nombreAdmin" name="nombreAdmin" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Tu correo</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando cuenta..." : "Crear clínica"}
      </Button>
    </form>
  );
}
