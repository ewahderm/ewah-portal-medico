"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

export type ComboboxOpcion = { value: string; label: string }

// Select con buscador: igual que <Select> (mismos value/defaultValue/
// onValueChange/name/required, para poder reemplazar uno por otro sin
// tocar la lógica de los formularios), pero el usuario puede escribir
// para filtrar la lista en vez de solo desplazarse por ella.
function Combobox({
  items,
  placeholder = "Selecciona...",
  emptyMessage = "Sin resultados.",
  className,
  id,
  ...rootProps
}: {
  items: ComboboxOpcion[]
  placeholder?: string
  emptyMessage?: string
  className?: string
  id?: string
} & Omit<ComboboxPrimitive.Root.Props<string>, "items" | "itemToStringLabel" | "children">) {
  const porValor = React.useMemo(() => new Map(items.map((o) => [o.value, o.label])), [items])

  return (
    <ComboboxPrimitive.Root
      items={items.map((o) => o.value)}
      itemToStringLabel={(valor) => (valor ? (porValor.get(valor) ?? "") : "")}
      {...rootProps}
    >
      <ComboboxPrimitive.InputGroup
        className={cn(
          "flex h-8 w-full items-center gap-1 rounded-lg border border-input bg-transparent py-1 pr-1 pl-2.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          className,
        )}
      >
        <ComboboxPrimitive.Input
          id={id}
          placeholder={placeholder}
          className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <ComboboxPrimitive.Trigger className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted">
          <ChevronDownIcon className="size-4" />
        </ComboboxPrimitive.Trigger>
      </ComboboxPrimitive.InputGroup>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={4} className="isolate z-50 outline-none">
          <ComboboxPrimitive.Popup className="max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <ComboboxPrimitive.Empty className="px-2 py-3 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="p-1">
              {(valor: string) => (
                <ComboboxPrimitive.Item
                  key={valor}
                  value={valor}
                  className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </ComboboxPrimitive.ItemIndicator>
                  <span>{porValor.get(valor) ?? valor}</span>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}

export { Combobox }
