"use client"

import * as React from "react"
import { CalendarDaysIcon } from "lucide-react"
import { cn } from "cn"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

function fechaValida(anio: number, mes: number, dia: number) {
  const fecha = new Date(0)
  fecha.setUTCHours(0, 0, 0, 0)
  fecha.setUTCFullYear(anio, mes - 1, dia)
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
}

export function parseDateInput(value: string): string | null {
  if (!value) return ""

  const iso = ISO_DATE.exec(value)
  if (iso) {
    const [, anio, mes, dia] = iso
    return fechaValida(Number(anio), Number(mes), Number(dia)) ? value : null
  }

  const display = DISPLAY_DATE.exec(value)
  if (!display) return null
  const [, dia, mes, anio] = display
  const y = Number(anio)
  const m = Number(mes)
  const d = Number(dia)
  if (!fechaValida(y, m, d)) return null

  return `${anio}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export function formatDateInput(value: string): string {
  if (!value) return ""
  const iso = parseDateInput(value)
  if (!iso) return value
  const [, anio, mes, dia] = ISO_DATE.exec(iso) ?? []
  return `${dia}/${mes}/${anio}`
}

function validarTextoFecha(value: string, min?: string, max?: string) {
  if (!value) return ""
  const fecha = parseDateInput(value)
  if (!fecha) return "Escribe una fecha válida en formato dd/mm/aaaa."
  if (min && fecha < min) return `La fecha debe ser igual o posterior a ${formatDateInput(min)}.`
  if (max && fecha > max) return `La fecha debe ser igual o anterior a ${formatDateInput(max)}.`
  return ""
}

type DateInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  onDateChange?: (value: string) => void
}

export function DateInput({
  className,
  id,
  name,
  form,
  value,
  defaultValue,
  min,
  max,
  required,
  disabled,
  readOnly,
  onChange,
  onDateChange,
  onBlur,
  "aria-label": ariaLabel,
  ...props
}: DateInputProps) {
  const initialValue = String(value ?? defaultValue ?? "")
  const controlledValue = value === undefined ? undefined : String(value)
  const [draft, setDraft] = React.useState(() => formatDateInput(initialValue))
  const [previousControlledValue, setPreviousControlledValue] = React.useState(controlledValue)
  const datePickerRef = React.useRef<HTMLInputElement>(null)
  const textInputRef = React.useRef<HTMLInputElement>(null)

  if (controlledValue !== undefined && controlledValue !== previousControlledValue) {
    setPreviousControlledValue(controlledValue)
    setDraft(formatDateInput(controlledValue))
  }

  React.useEffect(() => {
    textInputRef.current?.setCustomValidity(validarTextoFecha(draft, min, max))
  }, [draft, min, max])

  const isoValue = parseDateInput(draft) ?? ""

  function actualizarFecha(fecha: string) {
    const siguiente = parseDateInput(fecha)
    const valor = siguiente ?? ""
    setDraft(formatDateInput(valor))
    textInputRef.current?.setCustomValidity("")
    onDateChange?.(valor)
  }

  return (
    <span className="relative block w-full">
      <input
        {...props}
        ref={textInputRef}
        id={id}
        type="text"
        data-slot="input"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        value={draft}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-invalid={ariaValue(props["aria-invalid"]) || !!validarTextoFecha(draft, min, max) || undefined}
        className={cn(className, "pr-9")}
        onChange={(event) => {
          const siguiente = event.currentTarget.value
          setDraft(siguiente)
          event.currentTarget.setCustomValidity(validarTextoFecha(siguiente, min, max))
          const fecha = parseDateInput(siguiente)
          if (fecha !== null) onDateChange?.(fecha)
          onChange?.(event)
        }}
        onBlur={(event) => {
          const fecha = parseDateInput(event.currentTarget.value)
          if (fecha) setDraft(formatDateInput(fecha))
          onBlur?.(event)
        }}
      />
      <input
        ref={datePickerRef}
        type="date"
        value={isoValue}
        form={form}
        min={min}
        max={max}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-9 top-1/2 size-px -translate-y-1/2 opacity-0"
        onChange={(event) => {
          actualizarFecha(event.currentTarget.value)
          onChange?.(event)
        }}
      />
      <button
        type="button"
        disabled={disabled || readOnly}
        aria-label={ariaLabel ? `Abrir calendario: ${ariaLabel}` : "Abrir calendario"}
        title="Abrir calendario"
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onClick={() => {
          const picker = datePickerRef.current
          if (!picker) return
          if (typeof picker.showPicker === "function") picker.showPicker()
          else picker.focus()
        }}
      >
        <CalendarDaysIcon aria-hidden="true" className="size-4" />
      </button>
      {name ? <input type="hidden" name={name} value={isoValue} disabled={disabled} /> : null}
    </span>
  )
}

function ariaValue(value: React.AriaAttributes["aria-invalid"]) {
  return value === true || value === "true"
}
