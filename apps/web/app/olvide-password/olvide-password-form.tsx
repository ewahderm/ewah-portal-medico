"use client";

import { useActionState } from "react";
import { MailCheckIcon } from "lucide-react";
import { solicitarRestablecerPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function OlvidePasswordForm() {
  const [state, formAction, pending] = useActionState(solicitarRestablecerPassword, null);

  if (state && "enviado" in state) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <MailCheckIcon className="size-8 text-primary" />
        <p className="text-sm text-muted-foreground">
          Si ese correo tiene una cuenta activa, te acabamos de enviar un enlace para elegir una
          contraseña nueva. Revisa también la carpeta de spam.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="usuario@ejemplo.com"
          required
          autoComplete="email"
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-gradient-to-r from-[#00c9ec] to-[#0097b7] text-[#0d1825] font-semibold hover:from-[#1fd3f0] hover:to-[#00a9cc]"
        disabled={pending}
      >
        {pending ? "Enviando..." : "Enviar enlace de recuperación"}
      </Button>
    </form>
  );
}
