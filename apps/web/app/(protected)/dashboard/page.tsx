import { requireUsuario } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const usuario = await requireUsuario();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hola, {usuario.nombre}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Correo: {usuario.email}</p>
          <p>Rol: {usuario.roles?.nombre}</p>
        </CardContent>
      </Card>
    </div>
  );
}
