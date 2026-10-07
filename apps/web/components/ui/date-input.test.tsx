import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DateInput, formatDateInput, parseDateInput } from "@/components/ui/date-input"

describe("parseDateInput", () => {
  it("converts dd/mm/yyyy to ISO without swapping day and month", () => {
    expect(parseDateInput("22/11/2028")).toBe("2028-11-22")
    expect(parseDateInput("3/4/2028")).toBe("2028-04-03")
  })

  it("accepts only real calendar dates and valid ISO dates", () => {
    expect(parseDateInput("29/02/2028")).toBe("2028-02-29")
    expect(parseDateInput("29/02/2027")).toBeNull()
    expect(parseDateInput("31/04/2028")).toBeNull()
    expect(parseDateInput("2028-11-22")).toBe("2028-11-22")
  })

  it("formats stored ISO dates for Colombian users", () => {
    expect(formatDateInput("2028-11-22")).toBe("22/11/2028")
    expect(formatDateInput("")).toBe("")
  })
})

describe("DateInput", () => {
  it("displays dd/mm/yyyy and submits the ISO value", () => {
    render(
      <form aria-label="Formulario">
        <DateInput id="fecha" name="fecha" defaultValue="2028-11-22" />
      </form>,
    )

    expect(screen.getByRole("textbox")).toHaveValue("22/11/2028")
    const form = screen.getByRole("form", { name: "Formulario" }) as HTMLFormElement
    expect(new FormData(form).get("fecha")).toBe("2028-11-22")
  })

  it("keeps controlled values in ISO format for application logic", () => {
    const onDateChange = vi.fn()
    render(<DateInput aria-label="Fecha" value="2028-11-22" onDateChange={onDateChange} />)

    fireEvent.change(screen.getByRole("textbox", { name: "Fecha" }), { target: { value: "23/11/2028" } })

    expect(onDateChange).toHaveBeenCalledWith("2028-11-23")
    expect(screen.getByRole("textbox", { name: "Fecha" })).toHaveValue("23/11/2028")
  })

  it("updates the display when the controlled value changes externally", () => {
    const { rerender } = render(<DateInput aria-label="Fecha" value="2028-11-22" />)
    rerender(<DateInput aria-label="Fecha" value="2028-12-01" />)

    expect(screen.getByRole("textbox", { name: "Fecha" })).toHaveValue("01/12/2028")
  })

  it("rejects invalid dates and dates outside min/max", () => {
    render(<DateInput aria-label="Fecha" min="2028-01-01" max="2028-12-31" />)
    const input = screen.getByRole("textbox", { name: "Fecha" })

    fireEvent.change(input, { target: { value: "31/02/2028" } })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("placeholder", "dd/mm/aaaa")

    fireEvent.change(input, { target: { value: "31/12/2027" } })
    expect(input).toHaveAttribute("aria-invalid", "true")

    fireEvent.change(input, { target: { value: "01/01/2028" } })
    expect(input).not.toHaveAttribute("aria-invalid", "true")
  })
})
