-- EWAH Tech Platform — Cierra el hueco de entitlement en Campañas
-- Aplicar con: npx supabase db push --linked
--
-- Hallazgo de la auditoría de seguridad de la Fase 2 (freemium): a
-- diferencia de Inventario y Anexos, las políticas de "campanas" nunca
-- ganaron el chequeo has_entitlement('campanas') al cablear el gating real
-- en 0029 — se quedaron solo con has_permission(). Como has_permission()
-- bypasea a cualquier administrador (nivel=1) sin mirar el plan, y
-- bootstrap_clinica() le da permiso RBAC de Campañas al rol Administrador
-- en TODAS las clínicas (incluida Gratis), un administrador de una clínica
-- Gratis podía crear/editar campañas invocando la server action
-- directamente, saltándose la pantalla de upsell de /campanas — exactamente
-- el hueco que 0028/0029 dijeron cerrar.

drop policy "campanas_insert_con_permiso" on campanas;
create policy "campanas_insert_con_permiso" on campanas
  for insert with check (
    clinica_id = clinica_actual()
    and has_permission('campanas', 'CREATE')
    and has_entitlement('campanas')
  );

drop policy "campanas_update_con_permiso" on campanas;
create policy "campanas_update_con_permiso" on campanas
  for update using (
    clinica_id = clinica_actual()
    and has_permission('campanas', 'EDIT')
    and has_entitlement('campanas')
  )
  with check (clinica_id = clinica_actual());
