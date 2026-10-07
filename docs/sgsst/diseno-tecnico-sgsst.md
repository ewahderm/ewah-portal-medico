# Diseño técnico: módulo SG-SST (Decreto 1072 de 2015 · Res. 0312 de 2019)

Fecha: 2026-10-07. Estado: **F1 a F9 construidas** (migraciones 0072 a 0079; ver §6). Los
textos de los estándares (F2) siguen pendientes de cotejo con el PDF oficial.

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
| Texto literal de los 7, los 21 y los 60 ítems con sus pesos | [M] | F2 se construyó con redacción propia (`verificado = false`); falta cotejar |

**Para cotejar F2:** habilitar esos dominios en la red del entorno, o dejar en
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
   (`gestion`), igual que Habilitación. **Excepción (F8):** los avisos de reporte a la ARL y
   de investigación de eventos llegan también al plan Gratis: son plazos legales de días.
2. **Menú**: «Operación → SG-SST», junto a RRHH y Medio Ambiente.
3. **Contratistas**: cuentan para el tamaño por defecto. Excluirlos exige una justificación
   (rastro en la BD), igual que apartarse del perfil en las obligaciones de Habilitación.
4. **Clase de riesgo**: la mayor de las tres fuentes (§3).

## 6. Estado de construcción (2026-10-07)

| Fase | Migración | Pruebas de BD | Recorrido en navegador |
|---|---|---|---|
| F1 · Cimientos | 0072 | `bd-local/sst1-*` | `scripts/sgsst/recorrido-sst1.mjs` |
| F2 · Estándares | 0078 | `bd-local/sst8-*` | `recorrido-sst2.mjs` |
| F3 · Eventos | 0073 | `bd-local/sst3-*` | `recorrido-sst3.mjs` |
| F4 · Documentos | 0074 | `bd-local/sst4-*` | `recorrido-sst4.mjs` |
| F5 · Peligros | 0075 | `bd-local/sst5-*` | `recorrido-sst5.mjs` |
| F6 · Personas | 0076 | `bd-local/sst6-*` | `recorrido-sst6.mjs` |
| F7 · Plan, comités e indicadores | 0077 | `bd-local/sst7-*` | `recorrido-sst7.mjs` |
| F8 · Alertas y tablero | 0079 | `bd-local/sst9-*` | `recorrido-sst8.mjs` |
| F9 · Endurecimiento | — | `bd-local/sst10-*` | `scripts/sgsst/regresion.sh` (F1→F8 desde BD limpia) |

**F2 · Estándares mínimos.** Catálogo global de 60 ítems (`sst_estandares`) con ciclo,
peso y a qué grupo de 7 y 21 pertenece; la migración verifica 60 ítems, 100 puntos, 7 y 21.
La autoevaluación es una por año y la crea `fn_sst_iniciar_autoevaluacion` (definer: los
ítems los pone la BD según el grupo; no hay políticas de insert). «No aplica» exige
justificación. Al cerrar (APPROVE) la BD calcula puntaje = Σ peso de cumple y no aplica ÷
Σ peso del grupo × 100 y el nivel (< 60 crítico; 60–85 moderadamente aceptable; > 85
aceptable); desde ahí nada cambia. Plan de mejoramiento con `sst_acciones` origen
`autoevaluacion`. **Por confirmar:** la redacción de cada ítem y si para los grupos de 7 y
21 la norma usa pesos propios (hoy se normaliza sobre los pesos de la tabla de 60).

**F8 · Alertas.** `fn_sst_alertas_pendientes` (solo service role) con idempotencia por
(objeto, umbral) en `sst_alertas_enviadas`: reporte ARL/EPS (1 y 0 días), investigación (5 y
0), y con gestión: acciones (7 y 0), examen periódico según el profesiograma (30 y 0),
actividades del plan del mes (7 y 0), licencia del responsable (60/30/0), fin del periodo
de cada comité (60/30/0), autoevaluación del año antes del 31 de diciembre (60/30/7) y
registro anual con la fecha de `sst_fechas_anuales` (30/7/0; 2026-07-31 por la Circular
027/2026, a cotejar). El aviso de la ARL salió de las alertas de RRHH (lo cubre SG-SST con
festivos). Insignia del menú: accidentes por reportar + investigaciones y acciones vencidas.
Tablero «Pendientes» en Diagnóstico (`lib/sst/tablero.ts`).

**F9 · Endurecimiento.** `sst10-pruebas.sql`: las 15 tablas por clínica con RLS, ninguna
fila ajena visible ni modificable desde otra clínica, nada sin permiso de SST ni para anon,
lista cerrada de RPC definer para `authenticated` (`fn_sst_conteo_trabajadores`,
`fn_sst_estado_personas`, `fn_sst_indicadores`, `fn_sst_iniciar_autoevaluacion`, todas
validan sesión y permiso), funciones de trigger sin EXECUTE, bucket `sst` privado con tope
de 10 MB y 6 formatos, sin modificar ni borrar archivos por la API, y autoría forzada. Las
acciones de servidor usan el cliente de sesión (RLS); el cliente admin solo lo usa el cron.
