-- EWAH Tech Platform — Varios tratamientos por cita (invierte el enlace
-- cita↔tratamiento)
-- Aplicar con: npx supabase db push --linked
--
-- Problema real: hoy una cita solo puede enlazar a UN tratamiento
-- (citas.tratamiento_id, ver 0010) — 1:1, "de la cita hacia el
-- tratamiento". Un paciente puede llegar por un tratamiento agendado y
-- hacerse dos (o uno distinto al agendado) el mismo día — con el enlace
-- 1:1 el segundo "Atender" simplemente sobrescribiría el enlace del
-- primero (nada lo impide hoy, pero el dato queda mal: la cita pierde el
-- rastro del primer tratamiento).
--
-- Decisión: invertir la relación. En vez de citas.tratamiento_id,
-- agregamos tratamientos.cita_id (nullable) — no hace falta tabla
-- puente, es un 1:N simple vía FK inversa: una cita puede tener muchos
-- tratamientos, un tratamiento puede o no venir de una cita (el botón
-- "Nuevo tratamiento" del módulo principal, sin pasar por Agenda, sigue
-- siendo válido y no debe romperse).
--
-- Esto también deja el esquema listo para "ticket promedio por cita" más
-- adelante (sum(costo) from tratamientos where cita_id = X and anulado =
-- false, directo) — ese reporte NO se construye en esta migración, solo
-- se verifica que el esquema lo soporte.
--
-- Columna vieja citas.tratamiento_id — qué se encontró y qué se decidió:
-- se verificó contra la base real antes de escribir esto
-- (npx supabase db query --linked "select count(*) as total, count(*)
-- filter (where tratamiento_id is not null) as con_tratamiento from
-- citas") → de 3 citas existentes, 0 tienen tratamiento_id no nulo. No
-- hay nada que backfillear: se elimina directamente en esta misma
-- migración, sin paso de migración de datos.
--
-- Transición de estado de la cita (decisión, no requiere cambios de
-- esquema): al crear el PRIMER tratamiento enlazado a una cita,
-- citas.estado sigue pasando a 'atendida' (igual que hoy). Para el
-- segundo tratamiento y siguientes sobre la misma cita, NO hace falta
-- hacer nada distinto — el estado ya es 'atendida' y sigue significando
-- "esta cita ya se atendió", sin importar cuántos tratamientos termine
-- teniendo. No se agrega ningún estado nuevo.
--
-- Corregir un tratamiento (anular+crear vía editarTratamiento) — el
-- registro corregido SÍ debe heredar el mismo cita_id del original, para
-- que el ticket promedio de esa cita se siga calculando bien sin perder
-- el enlace por haber corregido un error. Esto es responsabilidad de la
-- capa de aplicación (ver reporte), no de un trigger: el resto de los
-- campos de "corregir" (sede_id, medio_pago_id, tipo_tratamiento_id...)
-- ya se pasan explícitos en el INSERT de editarTratamiento() en vez de
-- copiarse automáticamente por trigger, así que cita_id sigue el mismo
-- patrón por consistencia con el resto del módulo.

-- ============================================================
-- 1. Nuevo enlace: tratamientos.cita_id (nullable, 1 cita : N tratamientos)
-- ============================================================
alter table tratamientos add column cita_id uuid references citas(id);

-- Se va a consultar "todos los tratamientos de esta cita" seguido (para
-- listar en la UI y para sumar el ticket de la cita).
create index tratamientos_cita_id_idx on tratamientos(cita_id);

-- El trigger de inmutabilidad (0008, ya actualizado en 0013 y 0021) debe
-- conocer la columna nueva o se podría editar después de guardado sin
-- que el constraint lo note — mismo criterio que sede_id/medio_pago_id/
-- cufe: una vez que un tratamiento queda enlazado a una cita (al
-- crearse), ese enlace es parte del registro histórico y append-only
-- como todo lo demás en esta tabla.
create or replace function fn_tratamientos_solo_anular()
returns trigger
language plpgsql
as $$
begin
  if new.clinica_id is distinct from old.clinica_id
    or new.paciente_id is distinct from old.paciente_id
    or new.tipo_tratamiento_id is distinct from old.tipo_tratamiento_id
    or new.profesional_id is distinct from old.profesional_id
    or new.fecha is distinct from old.fecha
    or new.edad_paciente is distinct from old.edad_paciente
    or new.costo is distinct from old.costo
    or new.notas is distinct from old.notas
    or new.corrige_a is distinct from old.corrige_a
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.sede_id is distinct from old.sede_id
    or new.medio_pago_id is distinct from old.medio_pago_id
    or new.cufe is distinct from old.cufe
    or new.cita_id is distinct from old.cita_id
  then
    raise exception 'Un tratamiento no se puede editar, solo anular. Para corregir un error, anúlalo y crea un registro nuevo.';
  end if;

  if old.anulado = true and new.anulado = false and not es_admin() then
    raise exception 'Solo un administrador puede revertir la anulación de un tratamiento.';
  end if;

  return new;
end;
$$;

-- RLS: no hace falta ninguna política nueva. tratamientos.cita_id vive
-- dentro de la misma fila que ya protegen tratamientos_select_propia_
-- clinica / _insert_con_permiso / _anular_con_permiso (0008) — esas
-- políticas filtran por clinica_id/has_permission a nivel de fila, no
-- de columna, así que ya cubren la columna nueva sin tocarlas.

-- ============================================================
-- 2. Retirar el enlace viejo citas.tratamiento_id (1 tratamiento por cita)
-- ============================================================
-- Sin datos que migrar (verificado arriba: 0 de 3 citas lo tenían no
-- nulo). El siguiente agente de backend debe actualizar
-- crearTratamiento() en lib/tratamientos/actions.ts para escribir
-- tratamientos.cita_id en el INSERT en vez de hacer un UPDATE aparte a
-- citas.tratamiento_id — el UPDATE a citas.estado='atendida' se
-- mantiene igual, solo deja de escribir tratamiento_id porque la
-- columna ya no existe.
alter table citas drop column tratamiento_id;
