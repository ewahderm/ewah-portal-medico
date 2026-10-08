import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { GUIAS, getGuia, guiasVecinas } from "@/lib/manual";
import { Button } from "@/components/ui/button";
import { BloqueManual } from "../_components/bloque-manual";
import { IconoGuia } from "../_components/iconos";

export function generateStaticParams() {
  return GUIAS.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guia = getGuia((await params).slug);
  return { title: guia ? `${guia.titulo} · Manual de EWAH` : "Manual de EWAH" };
}

export default async function GuiaPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUsuario();
  const { slug } = await params;
  const guia = getGuia(slug);
  if (!guia) notFound();
  const { anterior, siguiente } = guiasVecinas(slug);

  return (
    <div className="space-y-6">
      <Link href="/manual" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Manual
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <IconoGuia nombre={guia.icono} className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{guia.grupo}</p>
            <h1 className="text-2xl font-semibold">{guia.titulo}</h1>
            <p className="text-sm text-muted-foreground">{guia.resumen}</p>
          </div>
        </div>
        {guia.ruta ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={guia.ruta} />}>
            Ir al módulo <ExternalLinkIcon />
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="En esta guía" className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">En esta guía</p>
          <ol className="space-y-1 border-l text-sm">
            {guia.secciones.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-muted-foreground hover:border-primary hover:text-foreground">
                  {s.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-3xl min-w-0 space-y-10">
          {guia.secciones.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 space-y-4">
              <h2 className="text-lg font-semibold">{s.titulo}</h2>
              {s.bloques.map((b, i) => (
                <BloqueManual key={i} bloque={b} />
              ))}
            </section>
          ))}
          <div className="flex flex-col gap-2 border-t pt-6 sm:flex-row sm:justify-between">
            {anterior ? (
              <Link href={`/manual/${anterior.slug}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <ArrowLeftIcon className="size-4" /> {anterior.titulo}
              </Link>
            ) : (
              <span />
            )}
            {siguiente ? (
              <Link href={`/manual/${siguiente.slug}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                {siguiente.titulo} <ArrowRightIcon className="size-4" />
              </Link>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
