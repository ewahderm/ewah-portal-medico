import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Te enviamos un enlace de confirmación. Ábrelo para activar tu cuenta y empezar a
          usar EWAH Tech.
        </CardContent>
      </Card>
    </div>
  );
}
