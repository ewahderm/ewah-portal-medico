"use client"

import * as React from "react"
import { cn } from "cn"

// Input de archivo con el botón nativo restyleado vía el pseudo-selector
// file: de Tailwind — un <input type="file"> sin esto se ve como texto
// gris diminuto sin ningún afordance de botón, que es justo lo que se
// reportó como "no intuitivo". Mismo tratamiento en todos los diálogos
// que piden subir un archivo (RRHH, Tratamientos, Marca, Importar).
function FileInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="file"
      data-slot="file-input"
      className={cn(
        "block w-full text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90",
        className,
      )}
      {...props}
    />
  )
}

export { FileInput }
