"use client"

import * as React from "react"
import { cn } from "cn"
import "./table-tarjetas.css"

// Copia el texto de cada encabezado a las celdas de su columna (data-label),
// teniendo en cuenta colSpan. La hoja table-tarjetas.css lo muestra como
// etiqueta cuando, en celular, cada fila se dibuja como tarjeta.
function etiquetarCeldas(tabla: HTMLTableElement) {
  const filaEncabezado = tabla.tHead?.rows[tabla.tHead.rows.length - 1]
  if (!filaEncabezado) return
  const titulos: string[] = []
  for (const th of Array.from(filaEncabezado.cells)) {
    for (let i = 0; i < th.colSpan; i++) titulos.push((th.textContent ?? "").trim())
  }
  for (const cuerpo of [...Array.from(tabla.tBodies), ...(tabla.tFoot ? [tabla.tFoot] : [])]) {
    for (const fila of Array.from(cuerpo.rows)) {
      let columna = 0
      for (const celda of Array.from(fila.cells)) {
        const titulo = celda.colSpan > 1 ? "" : (titulos[columna] ?? "")
        if (celda.dataset.label !== titulo) celda.dataset.label = titulo
        columna += celda.colSpan
      }
    }
  }
}

function Table({
  className,
  tarjetas = true,
  ...props
}: React.ComponentProps<"table"> & {
  /** En celular, cada fila como tarjeta (por defecto). false para tablas que
   * deben conservar la cuadrícula (por ejemplo, una matriz de casillas). */
  tarjetas?: boolean
}) {
  const ref = React.useRef<HTMLTableElement>(null)

  React.useEffect(() => {
    const tabla = ref.current
    if (!tarjetas || !tabla) return
    etiquetarCeldas(tabla)
    // Las filas cambian al filtrar, paginar o refrescar: se vuelven a etiquetar.
    const observador = new MutationObserver(() => etiquetarCeldas(tabla))
    observador.observe(tabla, { childList: true, subtree: true, characterData: true })
    return () => observador.disconnect()
  }, [tarjetas])

  return (
    <div
      data-slot="table-container"
      data-tarjetas={tarjetas ? "" : undefined}
      className="relative w-full overflow-x-auto"
    >
      <table
        ref={ref}
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
