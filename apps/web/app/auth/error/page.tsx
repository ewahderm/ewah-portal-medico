import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>El enlace no es válido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Puede haber expirado o ya haberse usado. Pide un enlace nuevo.</p>
          <Link href="/login" className="underline">
            Volver a inicio de sesión
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
