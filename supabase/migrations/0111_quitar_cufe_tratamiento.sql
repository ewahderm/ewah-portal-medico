-- ============================================================
-- 0111 · El tratamiento ya no tiene CUFE
-- ============================================================
-- La factura va en el cobro de la atención (0110). Se aplica DESPUÉS de
-- publicar el código que ya no lee tratamientos.cufe (0 filas con valor
-- al decidirlo, 2026-10-10).

create or replace function fn_tratamientos_solo_anular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otros int;
  v_sucesor boolean;
  v_cobro cobros_atencion%rowtype;
  v_en_cobro boolean := coalesce(current_setting('ewah.cobro', true), '') = 'si';
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
    or new.consultorio_id is distinct from old.consultorio_id
    or new.medio_pago_id is distinct from old.medio_pago_id
    or new.atencion_id is distinct from old.atencion_id
    or (not v_en_cobro and new.valor_cobrado is distinct from old.valor_cobrado)
  then
    raise exception 'Un tratamiento no se puede editar, solo anular. Para corregir un error, anúlalo y crea un registro nuevo.';
  end if;

  if old.anulado = true and new.anulado = false and not es_admin() then
    raise exception 'Solo un administrador puede revertir la anulación de un tratamiento.';
  end if;

  if new.anulado and not old.anulado and old.cobro_id is not null then
    select exists (
      select 1 from tratamientos s
      where s.corrige_a = old.id and not s.anulado and s.cobro_id = old.cobro_id
    ) into v_sucesor;
    if not v_sucesor then
      select count(*) into v_otros from tratamientos
      where cobro_id = old.cobro_id and id <> old.id and not anulado;
      if v_otros > 0 then
        raise exception 'Este tratamiento hace parte del cobro de la atención junto con otros: anula primero ese cobro para poder anularlo.';
      end if;
      update cobros_atencion
      set anulado = true,
          anulado_motivo = 'Tratamiento anulado: ' || coalesce(nullif(btrim(new.anulado_motivo), ''), 'sin motivo'),
          anulado_por = coalesce(new.anulado_por, auth.uid()), anulado_en = now()
      where id = old.cobro_id and not anulado;
    end if;
    new.cobro_id := null;
    return new;
  end if;

  if old.anulado and not new.anulado and old.cobro_id is null then
    select * into v_cobro from cobros_atencion where id = old.id and automatico and anulado;
    if found and not exists (
      select 1 from tratamientos x where x.cobro_id = v_cobro.id and x.id <> old.id
    ) then
      update cobros_atencion set anulado = false, anulado_motivo = null, anulado_por = null, anulado_en = null
      where id = v_cobro.id;
      new.cobro_id := v_cobro.id;
    end if;
    return new;
  end if;

  if not v_en_cobro and new.cobro_id is distinct from old.cobro_id then
    raise exception 'El cobro de un tratamiento se registra desde la atención.';
  end if;
  return new;
end;
$$;

revoke execute on function fn_tratamientos_solo_anular() from public, anon, authenticated;

alter table tratamientos drop column cufe;
