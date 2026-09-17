import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Elige tu contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <SetPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
