-- EWAH Tech Platform — Cambiar el plan de la propia clínica (modo prueba)
-- Aplicar con: npx supabase db push --linked
--
-- Sin pasarela de pago todavía (ver 0032/lib/suscripcion), el usuario
-- necesita poder cambiar el plan de su propia clínica para probar el
-- gating de Anexos/Inventario/Campañas sin pedirme que corra SQL cada vez.
-- Restringido a administrador y a la PROPIA clínica — nunca a otra
-- (`clinica_actual()`, no un id recibido del cliente). security definer
-- porque `clinicas` no tiene ninguna policy de UPDATE para authenticated
-- (a propósito, ver 0001) — esta función es la única puerta, y valida
-- es_admin() ella misma antes de tocar la fila.

create or replace function fn_cambiar_plan_propia_clinica(p_plan_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_clinica_id uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede cambiar el plan de la clínica.';
  end if;

  v_clinica_id := clinica_actual();
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;

  select id into v_plan_id from planes where codigo = p_plan_codigo;
  if v_plan_id is null then
    raise exception 'Plan inválido.';
  end if;

  update clinicas set plan_id = v_plan_id where id = v_clinica_id;
end;
$$;
