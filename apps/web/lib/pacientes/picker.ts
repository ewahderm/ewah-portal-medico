import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// PostgREST (el API de Supabase) impone un tope de 1000 filas por
// respuesta a nivel de servidor — un `.limit()` más alto desde el
// cliente no lo mueve, el servidor simplemente lo recorta igual. Con más
// de 1000 pacientes activos (esta clínica ya pasó esa marca: 1657 hoy),
// el combobox de "Nueva cita"/"Nuevo tratamiento" perdía en silencio a
// cualquier paciente que cayera después del corte. Se pagina con
// `.range()` hasta agotar los resultados, en vez de un solo `.select()`.
const TAMANO_PAGINA_INTERNO = 1000;

export type PacienteParaPicker = {
  id: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  tipo_identificacion_id: string | null;
  numero_identificacion: string | null;
  email: string | null;
  telefono1: string | null;
};

export async function getPacientesActivosParaPicker(
  supabase: Supabase,
): Promise<PacienteParaPicker[]> {
  const todos: PacienteParaPicker[] = [];
  let desde = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pacientes")
      .select(
        "id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, tipo_identificacion_id, numero_identificacion, email, telefono1",
      )
      .eq("activo", true)
      .order("primer_apellido")
      .range(desde, desde + TAMANO_PAGINA_INTERNO - 1);

    if (error || !data) break;
    todos.push(...data);
    if (data.length < TAMANO_PAGINA_INTERNO) break;
    desde += TAMANO_PAGINA_INTERNO;
  }

  return todos;
}
