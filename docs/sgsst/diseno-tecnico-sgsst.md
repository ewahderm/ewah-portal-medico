# Diseño técnico: módulo SG-SST (Decreto 1072 de 2015 · Res. 0312 de 2019)

Fecha: 2026-10-07. Estado: **F1 en construcción**. Las demás fases se diseñan aquí y se
construyen una a una, como en Habilitación.

## 0. Objetivo

Que una clínica, un consultorio o un profesional independiente sepa **qué le exige el SG-SST
según su tamaño y su riesgo**, y que lo gestione en EWAH:
- reportar incidentes y accidentes a tiempo;
- investigarlos;
- llevar los documentos y protocolos;
- autoevaluar los estándares mínimos cada año;
- recibir avisos de las fechas.

Las dos variables que deciden todo son el **número de trabajadores** y la **clase de riesgo**
de la actividad económica. Por eso F1 trata solo de ellas.

## 1. Estado de la verificación normativa

El entorno de desarrollo **no tiene acceso a las fuentes oficiales** (funcionpublica.gov.co,
mintrabajo.gov.co y secretariasenado.gov.co responden 403 desde el proxy). Una investigación
con fragmentos de búsqueda dejó tres grados de confianza:
- **[V]** verificado;
- **[M]** dato experto sin cotejar con el texto oficial;
- **[NV]** no verificado.

Regla del proyecto: **nada [M] ni [NV] se siembra como texto normativo ni bloquea al usuario**
hasta cotejarlo. En la interfaz se muestra como «por confirmar».

| Tema | Estado | Uso en el diseño |
|---|---|---|
| Esquema 7 / 21 / 60 estándares por tamaño y riesgo (Res. 0312, Arts. 3, 9 y 16) | [V] | F1 calcula el grupo |
| Umbrales: ≤10 trabajadores con riesgo I–III; 11–50 con riesgo I–III; >50 o riesgo IV–V | [M] (de amplio uso, sin texto oficial a la vista) | F1, con la cita a confirmar |
| Quién cuenta como trabajador: dependientes, contratistas, cooperados, en misión, estudiantes afiliados | [V] para el campo de aplicación; [NV] para la regla exacta de conteo | F1 cuenta todos; el usuario puede excluir contratistas con una justificación |
| Clase de riesgo según la tabla del Dec. 768/2022 (código de 7 dígitos, el primero es la clase) | [V] | F1 guarda el código completo |
| CIIU 8610 = clase III (3861001) | [V] | Ayuda en F1 |
| CIIU 8621–8699: clase III en la mayoría | [NV] | No se infiere: el usuario copia su código de la afiliación a la ARL |
| Independiente sin trabajadores: sin obligación de los estándares; sí afiliación, autocuidado y reglas del contratante (Dec. 723/2013) | [V]/[M] | F1 modo «independiente» |
| Vigía con menos de 10 trabajadores; COPASST con 10 o más; 1, 2, 3 o 4 representantes por parte | [M] | F1, a confirmar |
| Comité de Convivencia: **Res. 3461/2025 derogó la 652/2012**; de 6 a 19 trabajadores, 1+1 | [V] parcial | F1, a confirmar en los extremos |
| Evaluaciones médicas: **Res. 1843/2025 derogó la 2346/2007** | [V] | F6 |
| Registro de la autoevaluación en sgrl.mintrabajo.gov.co: 31 de julio de 2026 (Circular 027/2026) | [V] | F7: fecha anual parametrizable, no fija |
| Reporte de AT y EL a la ARL y la EPS en 2 días hábiles; AT grave o mortal a MinTrabajo en 2 días hábiles; investigación en 15 días | [M] (los plazos coinciden en todas las fuentes) | F3 |
| Indicadores del Art. 30 de la Res. 0312 (frecuencia, severidad, mortalidad, prevalencia, incidencia, ausentismo) | [M] alta | F7 |
| Texto literal de los 7, los 21 y los 60 ítems con sus pesos | [M] | **F2 queda bloqueada hasta tener el PDF oficial** |

**Para desbloquear F2:** habilitar esos dominios en la red del entorno, o dejar en
`scripts/sgsst/fuentes/` los PDF oficiales:
- Res. 0312/2019
- anexo del Dec. 768/2022
- Res. 1401/2007
- Res. 3461/2025
- Res. 1843/2025

## 2. Lo que ya existe y se reutiliza (no se duplica)

- **RRHH**
  - `empleados`: `categoria_contrato` laboral / servicios, ARL, activo.
  - `cargos.clase_riesgo_id` y `historial_cargos_empleado`: el cargo vigente.
  - `clinicas.clase_riesgo_id`, `arls` y `clases_riesgo` I–V.
- **`accidentes_trabajo`** (0048): se dejó sin prefijo a propósito para este módulo. F3 lo
  amplía (tipo de evento, gravedad, FURAT, MinTrabajo, investigación) y suma `sst` a sus
  políticas en vez de crear otra tabla.
- **`incapacidades_empleado`**: origen laboral o común. Alimenta severidad y ausentismo (F7).
- **`documentos_empleado`**: exámenes ocupacionales y vacunas (F6).
- **`documentos_normativos`** con la categoría `sgsst`, que ya existe con la Política SST: F4.
- **Medio Ambiente**: extintores, residuos y limpieza sirven de evidencia del plan de
  emergencias y del PGIRASA (como las proveedoras de F6 de Habilitación).
- **Patrones de Habilitación**:
  - catálogo de obligaciones con ocurrencias y semáforo;
  - cron diario con idempotencia;
  - `fn_hab_misma_clinica`, `fn_hab_forzar_autor` y append-only;
  - subida firmada al bucket con verificación de firma;
  - autoevaluación con foto inmutable.

## 3. Variables y grupo (F1)

**Trabajadores** se cuentan en la BD con `fn_sst_conteo_trabajadores()`, una función definer
que solo devuelve conteos, porque quien usa SST puede no tener permiso de RRHH:
- dependientes activos (contrato laboral);
- contratistas activos (prestación de servicios), incluidos por defecto;
- otros que RRHH no registra (cooperados, en misión, estudiantes afiliados): número manual en
  el perfil.

**Clase de riesgo** es la mayor de tres:
- la del código Dec. 768 del perfil (su primer dígito);
- la de la clínica (`clinicas.clase_riesgo_id`);
- la mayor de los cargos vigentes.

Es conservador a propósito: una sede de radiología en clase IV no puede quedar escondida
detrás de una clase III de la empresa. La pantalla muestra de dónde salió.

**Grupo** (función pura `lib/sst/grupo.ts`, con pruebas):

| Situación | Grupo |
|---|---|
| Modo independiente y 0 trabajadores | `independiente`: lista mínima, sin estándares de la Res. 0312 |
| Clase IV o V (cualquier tamaño) o más de 50 trabajadores | `60` |
| 11 a 50 y clase I–III | `21` |
| 1 a 10 y clase I–III | `7` |

Además indica:
- vigía (menos de 10) o COPASST (10 o más, con 1, 2, 3 o 4 representantes por parte);
- Comité de Convivencia (desde 6 trabajadores, por confirmar);
- perfil exigido al responsable del SG-SST.

Si la clase de riesgo no está definida, el grupo queda «sin calcular» y se pide el dato.

## 4. Fases

| Fase | Contenido | Depende de |
|---|---|---|
| **F1 · Cimientos** | Módulo `sst` (todos los planes, sub-feature `gestion` solo en Pro, igual que Habilitación). `sst_perfil`: modo, código Dec. 768, otros trabajadores, exclusión de contratistas con justificación, responsable con formación, licencia y curso de 50 h. Conteo definer. Pantalla «Perfil y diagnóstico» con el grupo y sus consecuencias. Menú, launcher y pruebas. | — |
| F2 · Estándares mínimos | Catálogo de los 7, 21 y 60 ítems con su texto y peso. Autoevaluación anual (cumple / no cumple / no aplica justificado y evidencia), calificación de la Res. 0312 (crítico, moderadamente aceptable, aceptable), plan de mejoramiento y foto inmutable del cierre. | PDF oficial |
| F3 · Incidentes y accidentes | Amplía `accidentes_trabajo`: incidente / AT / EL, gravedad, FURAT, reporte a ARL, EPS y MinTrabajo con plazos en días hábiles (festivos). Investigación en 15 días con equipo, causas inmediatas y básicas, y plan de acción con responsables. Accidente biológico (pinchazo) con seguimiento. RRHH conserva su vista. | F1 |
| F4 · Documentos y protocolos | Checklist de documentos obligatorios según el grupo (política, objetivos, plan anual, matriz legal, programa de capacitación, plan de emergencias, procedimientos), con versiones en `documentos_normativos` (`sgsst`) y conservación de 20 años. | F1 |
| F5 · Peligros y riesgos | Matriz simplificada GTC 45 con plantillas del sector salud (biológico, biomecánico, psicosocial, químico, radiación si hay rayos X) y medidas de control con seguimiento. | F1 |
| F6 · Personas | Capacitaciones e inducción, entregas de EPP, evaluaciones médicas (Res. 1843/2025: tipos y periodicidad) y vacunación, enlazadas a RRHH. | F1 |
| F7 · Comités, plan anual e indicadores | Vigía / COPASST y Convivencia (miembros, periodo de 2 años, actas). Plan anual de trabajo. Calendario de obligaciones con la fecha anual del registro en sgrl. Indicadores mensuales del Art. 30. | F3, F6 |
| F8 · Alertas y tablero | Cron diario (plazos de reporte de AT, investigaciones, exámenes, capacitaciones, comités, registro anual), insignia y tablero. | F2–F7 |
| F9 · Endurecimiento | Igual que F11 de Habilitación: matriz RLS, privilegios, IDOR y regresión en navegador. | todo |

## 5. Decisiones tomadas por defecto (se pueden cambiar)

1. **Plan**: el módulo se ve en todos los planes; perfil, diagnóstico y reporte de accidentes
   son gratis. Gestión documental, autoevaluación, matriz y alertas por correo son Pro
   (`gestion`), igual que Habilitación.
2. **Menú**: «Operación → SG-SST», junto a RRHH y Medio Ambiente.
3. **Contratistas**: cuentan para el tamaño por defecto. Excluirlos exige una justificación
   (rastro en la BD), igual que apartarse del perfil en las obligaciones de Habilitación.
4. **Clase de riesgo**: la mayor de las tres fuentes (§3).
