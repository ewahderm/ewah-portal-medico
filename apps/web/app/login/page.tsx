import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>EWAH Tech</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />
          <p className="text-center text-sm text-muted-foreground">
            ¿Tu clínica no tiene cuenta todavía?{" "}
            <Link href="/signup" className="underline">
              Regístrala
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
