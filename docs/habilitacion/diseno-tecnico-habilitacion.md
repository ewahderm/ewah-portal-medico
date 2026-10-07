# Diseño técnico: módulo de Habilitación (Res. 3100/2019)

Autor: `lider-tecnico` · Fecha: 2026-10-06 · Insumo: `requerimiento-habilitacion.md` (director-proyecto) + decisiones ya tomadas por el usuario (D1–D6 resueltas, ver §0).
Destinatarios: `planeacion` (secuencia), `arquitectura-backend` (SQL final), `arquitectura-frontend` (componentes), `ciberseguridad` y `aseguramiento-calidad` (criterios de aceptación).

Este documento fija **la barra técnica**: forma de los datos, garantías de seguridad e integridad, técnica de frontend y criterio de "terminado". No es el SQL final; los nombres de columnas sí son vinculantes salvo que arquitectura-backend justifique un cambio por escrito.

---

## 0. Punto de partida verificado (no asumido)

| Hecho | Cómo se verificó | Consecuencia de diseño |
|---|---|---|
| Última migración: `0060_tipos_extintor_informacion.sql` | `ls supabase/migrations` | Las nuevas empiezan en **0061**. Reservar números por fase (ver §7) para que fases paralelas no choquen. |
| `clinica_servicios_habilitados` tiene **1 fila** (no 0): clínica de prueba "IPS ACME", servicio "Medicina General", código `ddfaee333`, creada hoy 20:23 UTC, **sin sede** (esa clínica tiene 0 sedes). `tipos_tratamiento.servicio_habilitado_id`: 0 filas. | Consulta de solo lectura con service role (count + select) | La premisa "ninguna clínica tiene filas" ya no es exacta. **No cambia la decisión**: la fila no pertenece a ninguna práctica que se reorganiza (Cuidado intermedio/intensivo, terapias, Obstetricia, SPA). Pero obliga a que `sede_id` nazca **nullable** y a que la migración del catálogo lleve una **aserción de seguridad** (DO-block que aborta si alguna práctica que se divide/mueve tiene filas). |
| Los 52 `practica_medica_id` de `mapeo-servicios.json` existen en producción | Cruce de ids contra `practicas_medicas` | El mapeo se puede sembrar por uuid real. |
| `criterios.json`: 3.975 criterios, 708 bloques, 42 entradas de servicio (11.3.7 aparece 2 veces: `11.3.7` = Res. 1410/2022 y `11.3.7-2019`), ids sin duplicados, 131 con `nota_vigencia`, 2.803 hijos de 577 padres, 1 de confianza baja. `padre` es el número local, no el id: el id del padre se deriva como `<numeral>.<EST>.<padre>`. | Script node sobre el JSON | La siembra deriva `padre_id`; valida que el padre exista y esté en el mismo bloque. |
| Remisión a 11.1 por texto ("criterios que le sean aplicables de todos los servicios"): el regex simple encuentra 538; director reportó 547. Remisión a otro servicio por regex simple: 18; director reportó 41. | Script node | Las remisiones **no** se detectan por regex en tiempo de ejecución: se **curan una vez** en archivos JSON versionados (`curaduria/remisiones.json`) y el script de siembra falla si un criterio candidato queda sin clasificar. |
| Prototipo del algoritmo §1.6 para el caso EWAH (11.2.2 mediana, intramural, edificación exclusiva): **465 criterios** (389 de 11.1, 16 de 11.2.2, 60 de 11.2.1 por remisión en TH/IN/DO/PP), 70 encabezados, 6 autorresueltos por remisión a 11.1. | Script node de prueba (ver §2.4) | Cuadra con la estimación del director (~450). Este número es la **prueba de aceptación** del motor de aplicabilidad. |
| Bloque HC de 11.2.2 omite `intramural`. La auditoría automática "encabezado_literal vs aplica_modalidad" sobre los 708 bloques encuentra además 4 coincidencias en 11.4.1/11.4.2 TH ("telemonitoreo – prestador remisor en … domiciliaria"), que son **falsos positivos** (bloques de telemedicina para pacientes en domicilio). | Script node | La corrección de 11.2.2 HC va en `curaduria/correcciones-bloques.json`; los 4 falsos positivos quedan en una lista blanca explícita para que la auditoría del script pase en verde de forma reproducible. |
| `fn_auditoria()` exige columnas `id` y `clinica_id` | Lectura de 0007 | Las tablas **globales** (sin `clinica_id`) no pueden usar ese trigger; su trazabilidad es la propia migración versionada. |
| `has_permission()` deja pasar a admin (nivel 1) sin mirar el plan; `has_entitlement()` no | Lectura de 0001/0020/0028 | Toda política de escritura de "gestión" debe combinar **ambas** funciones (§1.8). |
| `documentos_normativos` y el bucket `documentos-rrhh` solo admiten `has_permission('rrhh', …)` | Lectura de 0048 y `lib/rrhh/protocolos.ts` (ruta `<clinica>/normativos/...`) | Para usarlos como evidencia hay que ampliar sus políticas a `habilitacion` **solo** para la categoría/carpeta de habilitación (§6). |
| El protocolo de RRHH hoy se puede **borrar** (admin, borra archivo y fila) | `lib/rrhh/protocolos.ts:57-72` | Conflicto con "nada se borra" en habilitación: los tipos con `categoria='habilitacion'` quedan sin delete (§6). |
| Next 16.3.5 / React 19.2.8: `<ViewTransition>` documentado en `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`, sin configuración en App Router | Lectura del doc local | Disponible, pero **no es requisito** de esta entrega (ver §5.7). `tw-animate-css` ya instalado cubre lo necesario. |
| Dependencias ya instaladas útiles: `react-big-calendar`, `date-fns` 4, `pdf-lib`, `xlsx` 0.18.5, `tw-animate-css` | `apps/web/package.json` | **Cero dependencias nuevas** en todo el módulo. La lista larga de criterios se resuelve con CSS (`content-visibility`), no con una librería de virtualización. |

Decisiones del usuario que este diseño implementa (no se reabren): **D1** ampliar la fila de `clinica_servicios_habilitados` (por sede); **D2** ajustar `practicas_medicas` (dividir intermedio/intensivo en adulto/pediátrico/neonatal, mover 4 terapias a Apoyo diagnóstico, Obstetricia y SPA con elección de numeral); **D3** quimioterapia = texto 2022 + criterios 2019 referenciados; **D4** derogados por la Res. 914/2025 con insignia y salida automática el 2027-01-03; **D5** fecha límite literal con aviso de día no hábil; **D6** RIPS "Aplica — confirma con tu asesor", desactivable con justificación; **pago** con vista limitada en Gratis; corrección de los 3 hallazgos de datos (11.2.2 HC, 41 remisiones, 547 autorresueltos).

Convención de nombres: todas las tablas del módulo llevan prefijo **`hab_`** (son ~22 tablas de un solo módulo; el prefijo las agrupa en el panel de Supabase y evita choques con nombres genéricos ya existentes como `documentos_normativos`). Excepciones deliberadas: columnas nuevas en tablas existentes (`clinica_servicios_habilitados`, `sedes`, `practicas_medicas`) y la tabla global reutilizable `festivos` (no es exclusiva de habilitación: RRHH ya aproxima días hábiles sin festivos en `lib/rrhh/alertas.ts`).

---

## 1. Esquema de base de datos

### 1.1 Mapa general y cardinalidades

```
GLOBAL (catálogo normativo, EWAH lo mantiene; lectura: authenticated; escritura: solo es_super_admin(), en la práctica solo por migración)
hab_normas 1───N hab_servicios_norma 1───N hab_bloques 1───N hab_criterios (self: padre_id)
                        │                                   │
hab_estandares (7) 1────┴──────────────N hab_bloques        ├──N hab_criterio_remisiones N──1 hab_servicios_norma (destino)
practicas_medicas N───M hab_servicios_norma  (vía hab_mapeo_practica_servicio)
hab_normas 1──N hab_documentos_catalogo (37) · 1──N hab_obligaciones_catalogo (~19) 1──N hab_obligacion_vencimientos
hab_normas 1──N hab_novedades_catalogo (40) · hab_tipos_prestador (4) · festivos (país, fecha)

POR CLÍNICA (RLS clinica_id = clinica_actual())
clinicas 1──1 hab_perfil_prestador
sedes (+3 columnas de edificación)
clinica_servicios_habilitados (ampliada: 1 fila = práctica × sede × numeral)  1──N hab_servicio_personal N──1 empleados
hab_documentos_clinica 1──N hab_documento_versiones (append-only, Storage)
hab_tramite_hitos (append-only + anulación) · hab_suficiencia_patrimonial (append-only + anulación)
(sede, criterio) 1──N hab_evaluaciones (append-only, el vigente es el último)
(sede, criterio) 1──N hab_evidencias (append-only, se "retiran", no se borran)
(sede, criterio) 1──1 hab_criterio_asignaciones (mutable, auditada)
hab_evaluaciones 1──N hab_planes_mejora
hab_autoevaluaciones 1──N hab_autoevaluacion_detalle (instantánea inmutable)
hab_obligaciones_catalogo 1──N hab_obligaciones_clinica (config, 1 por clínica×obligación) · 1──N hab_obligacion_ocurrencias
hab_novedades_reportadas (append-only + anulación) · hab_alertas_enviadas (solo service role)
```

**Clave de evaluación = (clinica_id, sede_id, criterio_id).** Esta es la decisión estructural más importante del módulo: como cada criterio pertenece a exactamente un servicio de la norma, `criterio_id` ya identifica el servicio. Con eso se resuelven gratis tres requisitos que de otro modo exigirían lógica:
- **HU-4.3** (11.1 se evalúa una vez por sede, no por servicio): los criterios de 11.1 solo existen una vez por sede.
- **§4 paso 6** (dedupe: dos prácticas del catálogo que mapean a 11.2.1 en la misma sede): ambas llegan al mismo `(sede, criterio)`.
- **Remisiones** (11.2.2 → 11.2.1): el criterio de 11.2.1 que entra por remisión es el **mismo** `(sede, criterio)` que se evaluaría si la clínica declarara 11.2.1 directamente. La norma exige lo mismo en el mismo sitio; evaluarlo dos veces sería un error.

Nunca se usa `clinica_servicios_habilitados.id` como clave de evaluación: esa fila puede cerrarse, cambiar de numeral (Obstetricia) o duplicarse por práctica, y la evaluación debe sobrevivir a eso.

### 1.2 Catálogos GLOBALES

Política común a todas (salvo nota): `enable row level security`; `select to authenticated using (true)`; `for all using (es_super_admin()) with check (es_super_admin())` (mismo patrón que `valores_legales_pais`, 0048). Sin `fn_auditoria` (no tienen `clinica_id`). Trigger `set_updated_at` donde haya `updated_at`. **Nunca** se edita el texto de un criterio en una tabla viva desde la UI: no hay pantalla de edición de catálogo en esta entrega; las correcciones entran por migración con comentario del porqué.

#### `hab_normas` (versión de norma) — ~1 fila hoy
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | **uuid determinista** (v5 sobre `codigo`, ver §2) |
| codigo | text | no | unique. `RES3100_2019_COMPILADA_2026-10` |
| nombre | text | no | |
| url_fuente, url_compilada | text | sí | |
| fecha_consulta | date | no | 2026-10-06 |
| vigente_desde | date | no | |
| vigente_hasta | date | sí | null = vigente. Índice parcial único `where vigente_hasta is null` → **solo una norma vigente a la vez** |
| notas | text | sí | |

La clínica siempre evalúa contra la norma vigente a la fecha; las instantáneas guardan `norma_id`.

#### `hab_estandares` — 7 filas
`codigo text PK` (`talento_humano`…), `sigla text unique` (TH, IN, DO, MD, PP, HC, IT), `nombre`, `numeral_manual` (8.3.1.x), `definicion_literal`, `pagina int`, `orden int`. El orden es el de la norma (TH, IN, DO, MD, PP, HC, IT), que coincide con el pedido de UX.

#### `hab_grupos_servicio` — 5 filas
`numeral text PK` (11.2…11.6), `nombre`, `descripcion_literal`, `orden`.

#### `hab_servicios_norma` — 42 filas
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | determinista sobre `norma.codigo + clave` |
| norma_id | uuid FK hab_normas | no | |
| clave | text | no | `11.1`, `11.2.2`, `11.3.7`, `11.3.7-2019`. unique(norma_id, clave) |
| numeral | text | no | `11.3.7` para ambas variantes de quimioterapia |
| grupo_numeral | text FK hab_grupos_servicio | sí | null en 11.1 |
| padre_clave | text | sí | `11.3.4` para 11.3.4.1/11.3.4.2 |
| nombre, nombre_en_pdf | text | no | |
| descripcion_literal, estructura_literal | text | sí | |
| pagina_inicio | int | no | |
| complejidades | text[] | no | subconjunto de `{baja,mediana,alta,no_aplica}` (check con `<@`) |
| modalidades | text[] | no | vocabulario cerrado §1.2.1 |
| telemedicina_categorias | text[] | no | default `{}` |
| es_transversal | boolean | no | true solo en 11.1 |
| solo_por_remision | boolean | no | true en `11.3.7-2019` (D3): no se declara, solo entra por remisión desde 11.3.7 crit. 8–10 |
| seleccionable | boolean | no | false en 11.1, 11.3.4 (contenedor) y 11.3.7-2019 |
| orden | int | no | |

##### 1.2.1 Vocabularios cerrados (checks en BD + constantes en `lib/habilitacion/constantes.ts`)
- Complejidad: `baja | mediana | alta | no_aplica`.
- Modalidad: `intramural | extramural | extramural_unidad_movil | extramural_jornada_salud | extramural_domiciliaria | telemedicina`. `extramural` (genérico) solo es declarable donde la norma no lo subdivide (11.6.2, 11.6.3).
- Categoría de telemedicina: `interactiva | no_interactiva | telexperticia | telemonitoreo`. Rol: `prestador_remisor | prestador_referencia`.
- Uso de edificación: `exclusivo_salud | mixto`.

Se implementan como `text` + `check` (no enum de Postgres): agregar un valor a un enum de PG es una migración más rígida y el proyecto ya usa `text check (…)` en todos lados (0048).

#### `hab_bloques` — 708 filas
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | determinista sobre `servicio.clave + estandar + orden` |
| servicio_norma_id | uuid FK | no | índice |
| estandar_codigo | text FK hab_estandares | no | |
| orden | int | no | orden dentro del servicio |
| encabezado_literal | text | sí | texto exacto del encabezado (se muestra; es la "cita") |
| subtitulo | text | sí | |
| aplica_complejidad | text[] | sí | null = no restringe |
| aplica_modalidad | text[] | sí | **se guarda EXPANDIDO**: si la fuente dice `extramural` (sin sub-modalidad), la siembra guarda `{extramural, extramural_unidad_movil, extramural_jornada_salud, extramural_domiciliaria}`. Así el filtro SQL es un simple `&&` y no hay caso especial en tiempo de ejecución. El literal sigue intacto en `encabezado_literal`. |
| aplica_telemedicina_categoria | text[] | sí | |
| aplica_telemedicina_rol | text[] | sí | |
| aplica_tipo_edificacion | text | sí | `exclusivo_salud` \| `mixto` \| null (null = ambos o no filtra). **Normalizado en la siembra** desde `subtitulo` de 11.1 IN (hallazgo 2 del director). |
| correccion_curada | text | sí | si la siembra corrigió el bloque (p. ej. 11.2.2 HC + `intramural`), aquí queda el porqué y la fuente. Se muestra a super admin, no al cliente. |

Índice: `(servicio_norma_id, estandar_codigo)`.

#### `hab_criterios` — 3.975 filas (+1 por el texto nuevo de 11.2.1.DO.23.6 desde 2027)
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | **determinista** v5 sobre `norma.codigo + codigo + coalesce(vigente_desde,'')`. Estable entre entornos (staging = producción) y entre regeneraciones del seed. |
| norma_id | uuid FK | no | |
| codigo | text | no | id estable de la fuente: `11.1.TH.4.1`, `11.3.7-2019.DO.10.1.4` |
| bloque_id | uuid FK hab_bloques | no | |
| servicio_norma_id | uuid FK | no | **denormalizado** desde el bloque (consulta y FK de evaluaciones más simples). Trigger de siembra no hace falta: lo pone el script y un `check` vía FK compuesta no es necesario; la validación está en el script (§2). |
| estandar_codigo | text FK | no | denormalizado igual |
| numero | text | no | `4.1` |
| padre_id | uuid FK hab_criterios | sí | derivado de `padre` |
| nivel | smallint | no | 0 raíz, 1 hijo… |
| orden | int | no | orden de lectura dentro del servicio (posición en el JSON) |
| texto_literal | text | no | |
| pagina | int | no | |
| confianza | text check (alta, baja) | no | |
| motivo_confianza_baja | text | sí | |
| fuente_texto | text | no | `compilacion_supersalud` / `pdf_ocr` / `imagen` |
| nota_vigencia | text | sí | se muestra como insignia |
| vigente_desde | date | sí | null = desde la norma |
| vigente_hasta | date | sí | **2027-01-03** para los 44 derogados por la Res. 914/2025 (D4) |
| es_encabezado | boolean | no | true si tiene hijos (derivado en la siembra). No se evalúa a mano. |
| remite_a_11_1 | boolean | no | true en los 547 "cumple con los criterios aplicables de todos los servicios". Se **autorresuelve** (no se evalúa a mano). |
| tiene_remision | boolean | no | true si existe fila en `hab_criterio_remisiones` (atajo para el motor) |

Unique: `(norma_id, codigo, vigente_desde) nulls not distinct` (PG ≥ 15; Supabase lo soporta). Esto permite que 11.2.1.DO.23.6 tenga **dos filas**: la actual (`vigente_hasta = 2027-01-03`) y la nueva (`vigente_desde = 2027-01-03`) con el texto de la Res. 914/2025. Son criterios distintos para evaluación: el 3-ene-2027 el nuevo aparece "Pendiente", que es lo correcto (texto nuevo, hay que reevaluarlo). El texto nuevo **no está en `criterios.json`**: es tarea de curaduría (copiarlo de `n_0914_2025.htm`, art. 13) en F0.

Índices: `(servicio_norma_id, estandar_codigo, orden)`, `(bloque_id)`, `(padre_id)`. Búsqueda de texto: en esta entrega el filtro "buscar" se hace en cliente sobre los ~450 aplicables (ya cargados), así que **no** hace falta índice trigram; si en el futuro hay búsqueda global sobre los 3.975, se agrega `pg_trgm` + `f_unaccent` (ya existe, 0005) como en pacientes.

#### `hab_criterio_remisiones` — ~41 filas curadas + 3 de quimioterapia
Solo remisiones **a otro servicio, otra complejidad u otra versión**. La remisión a 11.1 NO va aquí (es el booleano `remite_a_11_1`, el destino es implícito: mismo estándar, 11.1, misma sede).
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | |
| criterio_id | uuid FK hab_criterios | no | origen |
| tipo | text check (`a_otro_servicio`, `a_otra_complejidad`, `a_version_anterior`) | no | `a_version_anterior` = 11.3.7 crit. 8–10 → 11.3.7-2019 (D3) |
| servicio_destino_id | uuid FK hab_servicios_norma | no | |
| complejidad_destino | text | sí | null = la del destino si tiene una sola; si tiene varias, la misma del origen |
| estandar_destino | text FK | sí | null = **mismo estándar del origen** (regla del director: "solo del mismo estándar que remite") |
| criterios_destino | text[] | sí | si la remisión es a criterios puntuales (quimioterapia: "los criterios X a Y de 2019"); null = todo el bloque que coincida |
| nota_curaduria | text | no | quién la curó, contra qué página |

Unique `(criterio_id, servicio_destino_id, coalesce(estandar_destino,''))`.

#### `hab_mapeo_practica_servicio` — ~55 filas
`practica_medica_id uuid FK practicas_medicas` + `servicio_norma_id uuid FK` (PK compuesta), `requiere_eleccion boolean` (true en Obstetricia → {11.4.1, 11.6.4} y SPA → {11.4.12, 11.4.10}; también recomiendo Unidad de quemados → {11.4.9, 11.4.7}, ver §8), `nota text`, `confianza text check (alta, inferida)` — las inferencias de 11.2.1 (enfermería, nutrición, psicología, optometría) quedan `inferida` y la UI muestra la nota.

Regla: si una práctica tiene **una** fila de mapeo, el numeral se asigna solo; si tiene varias, `requiere_eleccion` debe ser true en todas (lo valida el script de siembra) y la clínica elige.

#### `practicas_medicas` (existente) — ajuste D2
Migración con **aserción previa** (DO-block: si existe cualquier fila en `clinica_servicios_habilitados` o `tipos_tratamiento` que apunte a las prácticas que se dividen o mueven, `raise exception` y no se aplica nada).
- "Cuidado Intermedio (Adultos, Pediátrico, Neonatal)": se **renombra** a "Cuidado Intermedio Adulto" (conserva su uuid) y se insertan "Cuidado Intermedio Pediátrico" y "Cuidado Intermedio Neonatal". Igual con Cuidado Intensivo (UCI Adultos / Pediátrica / Neonatal). Los uuids nuevos son deterministas (v5) para que el mapeo de §2 sea reproducible.
- Fisioterapia, Fonoaudiología, Terapia ocupacional, Terapia respiratoria: `codigo` (grupo) pasa de `Consulta Externa` a `Apoyo Diagnóstico` y se reubica `orden` dentro de ese grupo.
- Columna nueva `seleccionable boolean not null default true` no hace falta: todas siguen siendo seleccionables.

#### `hab_tipos_prestador` — 4 filas
`codigo text PK` (`ips`, `profesional_independiente`, `transporte_especial`, `objeto_social_diferente`), `nombre`, `definicion`, `condiciones text[]`, `fuente_norma`, `fuente_articulo`, `fuente_pagina`, `fuente_url`, `orden`. (Se separa de `roles_actor_reps` de 0052, que es el rol RIPS con códigos 3/4/5 y no distingue transporte especial ni OSD. La UI de Perfil **sugiere** el tipo a partir de `clinicas.rol_actor_id` cuando existe.)

#### `hab_documentos_catalogo` — 37 filas
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | determinista sobre `codigo` |
| norma_id | uuid FK | no | |
| codigo | text | no | `certificado_existencia_representacion_legal`… unique(norma_id, codigo) |
| nombre_corto, descripcion_literal | text | no | |
| explicacion_sencilla | text | sí | |
| aplica_a | text[] | no | tipos de prestador; `{}` para los 2 no verificados (póliza, RUT del PI) → nunca aparecen como requisito |
| obligatorio | boolean | no | |
| condicion_texto | text | sí | la condición tal como la dice la norma (se muestra) |
| condiciones | text[] | no | **códigos de regla cerrados** (AND), default `{}`. Ver lista abajo. |
| seccion | text check (`radicar`, `evidencia_visita`) | no | AC4 de HU-3.1 |
| por_sede | boolean | no | RETIE, licencia de construcción, seguridad de edificación, vulnerabilidad: uno por sede |
| tiene_vencimiento | boolean | no | |
| regla_vigencia | text check (`max_30_dias_radicacion`) | sí | certificado de existencia (HU-3.2) |
| uno_por_servicio | boolean | no | declaración de autoevaluación (art. 7.1.4) |
| fuente_norma, fuente_articulo, fuente_pagina, fuente_url | text | | |
| verificado | boolean | no | |
| orden | int | no | |

**Códigos de condición** (lista cerrada, check `condiciones <@ array[...]`; se evalúan en un helper puro de TS, §3.3): `persona_juridica`, `persona_natural`, `entidad_publica`, `esal`, `cooperacion_internacional`, `sedes_otros_departamentos`, `edificacion_pre_1996_12_02`, `edificacion_pre_2005_05`, `edificacion_post_1996_mixta`, `edificacion_pre_2010_con_urgencias_cirugia_uci`, `telemedicina`, `telemedicina_remisor`, `radiaciones_ionizantes`, `vehiculos`, `ips_nueva`. Se elige **lista cerrada en vez de un jsonb con un mini-lenguaje**: cada regla tiene un evaluador probado; un DSL genérico sería superficie de error sin beneficio (son 37 documentos que cambian una vez cada varios años).

#### `hab_obligaciones_catalogo` — 17 + 3 propias del prestador
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | determinista |
| norma_id | uuid FK | no | (la versión de norma "de referencia" del catálogo; las obligaciones citan su propia norma abajo) |
| codigo | text | no | `FT001`, `reps-autoevaluacion`, `telemedicina-mensual`, `grupo-supersalud-anual`, `subsanacion-visita`, `novedad-cierre-temporal`… unique |
| nombre, descripcion_corta | text | no | |
| entidad | text check (`secretaria_salud`, `supersalud`, `minsalud`, `ins`, `propia`) | no | |
| plataforma_nombre, plataforma_url | text | sí | |
| norma_nombre, norma_numero, norma_articulo, norma_url, url_instructivo | text | sí | |
| enlace_verificado_el | date | sí | AC4 HU-5.1 |
| url_responde | boolean | sí | |
| periodicidad | text check (`mensual`,`trimestral`,`semestral`,`anual`,`eventual`,`vencimiento_reps`,`manual`) | no | |
| aplica_a_tipos | text[] | no | |
| aplica_a_grupos | text[] | sí | null = todos los grupos (o no aplica grupo) |
| condiciones | text[] | no | mismos códigos cerrados + `upgd`, `revisor_fiscal`, `pedt`, `factura_servicios_salud` |
| activacion_default | text check (`auto`, `por_confirmar`, `informativa`) | no | `por_confirmar`: ST002 y SIVIGILA (no generan alerta roja hasta que el usuario la active, AC2 HU-5.1). `informativa`: capacidad instalada diaria (§7 del requerimiento). RIPS: `auto` con `requiere_confirmacion_asesor = true`. |
| requiere_confirmacion_asesor | boolean | no | D6: insignia "Aplica — confirma con tu asesor" |
| dias_aviso_default | int[] | no | `{30,15,7,1,0}`; `reps-autoevaluacion`: `{90,60,30,15,7,1,0}` |
| verificado | boolean | no | |
| notas | text | sí | |

#### `hab_obligacion_vencimientos` — reglas de fecha estructuradas (~80 filas)
Una fila = "una ocurrencia por año". Este modelo cubre **todas** las reglas de `reportes.json` sin código especial (verificado a mano):
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| obligacion_id | uuid FK | |
| aplica_a_grupos | text[] null | para reglas distintas por grupo (FT001: C1 mensual; C2–D3 semestral) |
| aplica_a_tipos | text[] null | |
| mes_corte | smallint 1–12 | |
| dia_corte | smallint null | null = último día del mes |
| meses_despues | smallint | |
| dia_limite | smallint 1–31 | |
| etiqueta_periodo | text | `"corte 30-jun"` |

Ejemplos verificados: FT001 C2–D3 → (6, null, 1, 20) y (12, null, 2, 20); "20 días calendario después del último día del mes" = día 20 del mes siguiente para **todos** los meses (31-ene+20 = 20-feb; 28-feb+20 = 20-mar), y para el cierre de diciembre la regla especial (20-feb) es simplemente `meses_despues=2`; Res. 256 (30 días tras el trimestre) = (3,null,1,30),(6,null,1,30),(9,null,1,30),(12,null,1,30) — 31-mar+30 = 30-abr ✓; Res. 202 = día 25 del segundo mes → `meses_despues=2, dia_limite=25`; FP001–FP005 → (12, null, 4, 10); datos generales nRVCC → (6,null,1,20),(12,null,1,20). Si `dia_limite` excede el mes, se usa el último día del mes (no ocurre hoy, pero el generador lo maneja).

Las obligaciones `vencimiento_reps`, `eventual` y `manual` no tienen filas aquí: su fecha sale del perfil (vencimiento REPS), de un hito (subsanación: 8 días hábiles) o de una novedad (cierre temporal + 11 meses).

#### `hab_novedades_catalogo` — 40 filas
`id` determinista, `norma_id`, `codigo` unique, `categoria text check (prestador, sede, servicio, capacidad)`, `nombre`, `definicion_literal`, `fuente_*`, `efecto text check (null, 'sugerir_alta_servicio', 'alerta_cierre_temporal')`, `orden`.

#### `festivos` — global, país-agnóstico
`id uuid`, `pais_id uuid FK paises`, `fecha date`, `nombre text`, `fuente text`; unique `(pais_id, fecha)`. Se siembran 2026–2028 de Colombia (Ley 51/1983 + fechas móviles de Pascua) **calculados por el script y cotejados** contra una fuente oficial en F0 (tarea de datos; si no se coteja, `fuente='calculado'` y se marca riesgo). Lectura authenticated; escritura super admin. RRHH podrá reutilizarla después (fuera de alcance).

#### `hab_criterio_fuentes_sugeridas` — global, curada (F6)
`criterio_id uuid FK hab_criterios` + `fuente_codigo text` (lista cerrada §6.2) como PK compuesta, `nota text`. Indica qué proveedor de evidencia de otro módulo se sugiere en cada criterio. La siembra el script desde `curaduria/fuentes-sugeridas.json` (revisión humana, no inferencia por palabras clave en caliente).

#### Tipos de documento normativo de habilitación (tabla existente)
Se insertan en `tipos_documento_normativo` con `categoria='habilitacion'` (la columna y el valor ya existen y están vacíos): protocolo de bioseguridad, limpieza y desinfección, seguridad del paciente/eventos adversos, consentimiento informado (política), guías de práctica clínica adoptadas, PGIRASA, plan hospitalario de emergencias, plan de mantenimiento de la planta física y de equipos, programa de tecnovigilancia/farmacovigilancia, manual de referencia y contrarreferencia. Lista exacta: tarea de F6 contra los textos de 11.1 PP (no inventar nombres fuera de la norma).

### 1.3 Datos POR CLÍNICA — tablas existentes que se amplían

#### `sedes` (+3 columnas)
`uso_edificacion text check (exclusivo_salud, mixto) null`, `fecha_construccion_intervencion date null` (fecha y no año: las reglas cortan en **2-dic-1996** y **mayo-2005**, un año solo no basta; la UI acepta "solo sé el año" y guarda el 1-ene con una marca), `fecha_construccion_es_aproximada boolean not null default false`, `codigo_sede_reps text null`.

Escritura: el motor genérico de Parámetros solo edita `codigo/nombre` y **no se toca**. Las 4 columnas se escriben únicamente con la RPC `fn_hab_actualizar_edificacion_sede(p_sede_id, p_uso, p_fecha, p_aproximada, p_codigo_reps)` — `security definer`, `set search_path = public`, valida `sede.clinica_id = clinica_actual()` y `has_permission('habilitacion','EDIT') and has_entitlement('habilitacion','gestion')`, y solo actualiza esas columnas. (Alternativa descartada: ampliar la política de UPDATE de `sedes` a `habilitacion/EDIT` → daría a quien tenga habilitación la capacidad de renombrar sedes.) `sedes` ya tiene auditoría? No: se agrega `create trigger sedes_auditoria … fn_auditoria()` en la misma migración (la sede ahora lleva datos regulatorios).

Si `uso_edificacion` es null, el motor de aplicabilidad incluye **ambos** bloques (exclusivo y mixto) y la UI muestra "Completa el tipo de edificación de esta sede para descartar N criterios": conservador (mostrar de más, nunca de menos).

#### `clinica_servicios_habilitados` (D1 — una sola fuente de verdad)
Semántica nueva: **1 fila = práctica del catálogo × sede × servicio de la norma**.

| Columna nueva | Tipo | Null | Notas |
|---|---|---|---|
| sede_id | uuid FK sedes on delete restrict | **sí** | nullable por la fila existente de IPS ACME y porque Datos básicos (todos los planes) puede crear la fila sin el detalle. Sin sede, la fila no entra al motor y la UI la marca "Asigna una sede". |
| servicio_norma_id | uuid FK hab_servicios_norma | sí | lo **autocompleta un trigger** si el mapeo tiene una sola opción; obligatorio elegirlo si `requiere_eleccion`. |
| complejidad | text check | sí | autocompletada si el servicio de la norma admite una sola |
| modalidades | text[] | no, default `{}` | |
| telemedicina_categorias | text[] | no, default `{}` | |
| telemedicina_roles | text[] | no, default `{}` | |
| estado | text check (`por_habilitar`, `habilitado`, `cierre_temporal`, `cerrado`) | no, default `por_habilitar` | |
| fecha_habilitacion | date | sí | |
| fecha_cierre_temporal | date | sí | |
| updated_by | uuid FK usuarios | sí | |

Constraints:
- Se elimina `unique (clinica_id, practica_medica_id)` y se crea `unique nulls not distinct (clinica_id, sede_id, practica_medica_id, servicio_norma_id)`. Obstetricia con ambos numerales = 2 filas.
- Trigger `fn_servicio_habilitado_validar()` (before insert/update, `security definer`, `search_path = public`) — **la legalidad de la combinación vive en Postgres, no en el formulario**:
  1. `sede_id` (si no es null) pertenece a `new.clinica_id` (IDOR, misma clase ya corregida en 0056/0057).
  2. `servicio_norma_id` ∈ mapeo de la práctica y `seleccionable = true`; si es null y el mapeo tiene 1 fila, lo asigna; si tiene varias, lo deja null (estado "falta elegir numeral").
  3. `complejidad` ∈ `servicio_norma.complejidades`; si el servicio admite una sola, la asigna.
  4. `modalidades <@ servicio_norma.modalidades`.
  5. `telemedicina_categorias` y `telemedicina_roles` no vacíos ⇒ `'telemedicina' = any(modalidades)`; y vacíos si no hay telemedicina; categorías `<@ servicio_norma.telemedicina_categorias`.
- RLS: select sin cambio. Insert/update: `clinica_id = clinica_actual() and (es_admin() or (has_permission('habilitacion','EDIT') and has_entitlement('habilitacion','gestion')))`. Delete: `es_admin()` **y** sin evaluaciones ni evidencias asociadas a `(sede, criterios de ese servicio)` — se implementa como trigger `before delete` que levanta "Este servicio tiene autoevaluación registrada; ciérralo (estado Cerrado) en lugar de eliminarlo". (No se puede con FK porque la evaluación no apunta a esta fila, §1.1.)
- La auditoría (0055) ya existe.

Reparto de edición (D1, sin dos verdades): **Datos básicos** (todos los planes) sigue creando/editando práctica + sede + código de habilitación; **Habilitación > Sedes y servicios** (pago) edita numeral, complejidad, modalidades, telemedicina, estado y personal. Misma fila, columnas distintas; el trigger valida ambas vías.

`tipos_tratamiento.servicio_habilitado_id` (0057): con filas por sede, ese combobox mostraría el mismo servicio una vez por sede. Ver **decisión pendiente §8-A**.

### 1.4 Datos POR CLÍNICA — tablas nuevas

Patrón común salvo nota: `clinica_id uuid not null references clinicas(id) on delete cascade`, índice por `clinica_id`, RLS habilitada, `fn_auditoria` en insert/update/delete, `created_by uuid references usuarios(id)`, `created_at timestamptz default now()`. Notación de políticas: **V** = `clinica_id = clinica_actual() and has_permission('habilitacion','VIEW')`; **G(X)** = `clinica_id = clinica_actual() and has_permission('habilitacion', X) and has_entitlement('habilitacion','gestion')`.

Toda tabla que referencia otra fila de la clínica por FK (sede, empleado, usuario, documento, evaluación) lleva su **trigger de misma-clínica** (patrón `fn_tipo_tratamiento_servicio_misma_clinica`, 0057). Arquitectura-backend puede consolidarlo en una función genérica `fn_hab_misma_clinica()` parametrizada por `TG_ARGV` (tabla y columna), siempre `security definer` + `search_path = public`.

#### `hab_perfil_prestador` — 1:1 con clínica
PK `clinica_id`. Columnas: `tipo_prestador text FK hab_tipos_prestador`, `naturaleza text check (publica, privada, mixta)`, `es_esal boolean`, `es_cooperacion_internacional boolean`, `tiene_sedes_otros_departamentos boolean`, `es_ips_nueva boolean`, `estado_reps text check (no_inscrito, en_tramite, inscrito, inactivo) not null default 'no_inscrito'`, `fecha_inscripcion_inicial date`, `fecha_vencimiento_reps date`, `fecha_planeada_radicacion date`, `secretaria_departamento_id uuid FK departamentos`, `secretaria_nombre text`, `ets_codigo text`, `ets_codigo_verificado boolean default false`, `grupo_supersalud text check (B, C1, C2, D1, D2, D3)`, `grupo_fecha_clasificacion date`, `grupo_asistente jsonb` (respuestas del asistente + grupo sugerido: **snapshot que no se filtra**, por eso jsonb), `tiene_revisor_fiscal boolean`, `es_upgd boolean`, `realiza_pedt boolean`, `factura_servicios_salud boolean`, `representante_legal_nombre text`, `representante_legal_documento text`, `exigir_evidencia_cumple boolean not null default true`, `updated_by`, `updated_at`.
Checks: `estado_reps = 'inscrito' ⇒ fecha_vencimiento_reps is not null`; `tipo_prestador = 'profesional_independiente' ⇒ grupo_supersalud is null`.
Persona natural/jurídica, NIT, código de prestador y departamento **se leen de `clinicas`** (0052), no se duplican. El código del prestador se escribe con una RPC angosta `fn_hab_actualizar_codigo_prestador(p_codigo)` (mismo patrón que `fn_actualizar_nit_clinica`, 0059), exigiendo `habilitacion/EDIT` (en todos los planes, ver §1.8).
RLS: select V; insert/update `clinica_id = clinica_actual() and has_permission('habilitacion','EDIT')` (**sin** entitlement: el perfil alimenta el calendario de la vista gratuita, §1.8). Sin delete.
Efecto: trigger `after insert or update` que llama `fn_hab_sincronizar_obligaciones(new.clinica_id)` (§4). Así ningún camino de escritura olvida recalcular.

#### `hab_servicio_personal` — quién presta cada servicio (hueco señalado por el director)
`id`, `clinica_id`, `servicio_habilitado_id uuid FK clinica_servicios_habilitados on delete cascade`, `empleado_id uuid FK empleados`, unique `(servicio_habilitado_id, empleado_id)`. RLS select V; insert/delete G(EDIT). Trigger misma-clínica para ambos FK. (Relación, no dato clínico: delete permitido.)

#### `hab_documentos_clinica` — el "renglón" del checklist
`id`, `clinica_id`, `documento_catalogo_id uuid FK null` (null = documento adicional), `nombre_adicional text` (check: obligatorio si catálogo null), `sede_id uuid FK sedes null` (obligatorio si `por_sede`, lo valida trigger), `servicio_habilitado_id uuid FK null` (declaración por servicio), `no_aplica boolean default false`, `no_aplica_justificacion text` (check ≥ 10 caracteres si `no_aplica`), `observaciones text`, `updated_by`, `updated_at`.
Unique parcial: `(clinica_id, documento_catalogo_id, sede_id, servicio_habilitado_id) nulls not distinct where documento_catalogo_id is not null`.
El **estado** (Pendiente / Cargado / Vencido / No aplica / "Ya no aplica a tu tipo de prestador") **no se guarda**: se calcula al leer (versión vigente + vencimiento + regla `max_30_dias_radicacion` contra `fecha_planeada_radicacion` + reglas de aplicabilidad). Guardarlo crearía una segunda verdad que se desincroniza con el paso del tiempo.
RLS select V; insert/update G(EDIT). Sin delete (AC2 HU-1.1: lo cargado no se borra).

#### `hab_documento_versiones` — append-only (HU-3.5)
`id`, `clinica_id`, `documento_id FK hab_documentos_clinica`, `version int not null`, `storage_path text not null`, `nombre_archivo text not null`, `mime text not null`, `tamano_bytes int not null`, `sha256 text` (integridad y detección de duplicado), `fecha_expedicion date`, `fecha_vencimiento date`, `created_by`, `created_at`. Unique `(documento_id, version)`.
- `version` la asigna un trigger `before insert` (`select max(version)+1 … for update` sobre la fila padre) — **no** la calcula la app (hoy `lib/rrhh/protocolos.ts` lo hace en la app y tiene condición de carrera; no copiar ese patrón).
- Trigger `before update or delete` → excepción ("Las versiones no se modifican ni se borran"). Sin políticas de update/delete.
- RLS select V; insert G(CREATE).

#### `hab_tramite_hitos` — append-only con anulación (HU-3.4)
`id`, `clinica_id`, `tipo text check (radicado, devuelto_inconsistencias, codigo_asignado, visita_previa_programada, visita_realizada, subsanacion_radicada, constancia_expedida, distintivo, visita_certificacion)`, `fecha date not null`, `numero text`, `observacion text`, `hay_incumplimientos_subsanables boolean` (solo en `visita_realizada`), `storage_path`, `nombre_archivo`, `mime`, `tamano_bytes`, `anulado boolean default false`, `anulado_motivo text`, `anulado_por`, `anulado_en`, `created_by`, `created_at`.
Trigger `fn_hab_solo_anular()` genérico (patrón `fn_tratamientos_solo_anular`): única transición permitida `anulado false→true` con motivo ≥ 10 caracteres; cualquier otro cambio, excepción. Políticas: insert G(CREATE); update G(VOID).
Efectos (en la RPC `fn_hab_registrar_hito`, `security invoker`, una transacción): `visita_realizada` con subsanables → inserta ocurrencia `subsanacion-visita` con límite = fecha + **8 días hábiles** usando `festivos`; `constancia_expedida` → `hab_perfil_prestador.estado_reps = 'inscrito'` (la UI pide luego la fecha de vencimiento: AC3 HU-3.4).

#### `hab_suficiencia_patrimonial` — append-only con anulación (HU-3.3)
`id`, `clinica_id`, `fecha_corte date not null`, `patrimonio_total`, `capital`, `obligaciones_mercantiles_360`, `obligaciones_laborales_360`, `pasivo_corriente` (todas `numeric(18,2) not null check (>= 0)`), `documento_version_id uuid FK hab_documento_versiones null` (la certificación firmada), `anulado…` (mismo patrón), `created_by`, `created_at`. Los 3 indicadores **no se guardan**: los calcula un helper puro (`lib/habilitacion/suficiencia.ts`) con manejo explícito de división por cero ("no calculable"). Precisión: `numeric`, nunca `float` (lección de 0050). RLS: select **`G(EDIT)`** (no basta VIEW: es información financiera, requerimiento §10 "roles que no deben ver"); insert G(CREATE); update G(VOID).

#### `hab_evaluaciones` — append-only puro (HU-4.2)
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | uuid PK | no | |
| clinica_id | uuid | no | |
| sede_id | uuid FK sedes | no | |
| criterio_id | uuid FK hab_criterios | no | |
| norma_id | uuid FK | no | |
| estado | text check (`pendiente`,`cumple`,`no_cumple`,`no_aplica`) | no | `pendiente` permite "deshacer" sin borrar |
| justificacion | text | sí | check: `estado <> 'no_aplica' or length(btrim(justificacion)) >= 10` |
| observacion | text | sí | |
| fecha_verificacion | date | no | default current_date |
| evaluado_por | uuid FK usuarios | no | |
| created_at | timestamptz | no | |

Índice `(clinica_id, sede_id, criterio_id, created_at desc)`. Vista `hab_evaluaciones_vigentes` (`with (security_invoker = true)` — **obligatorio**: una vista sin esa opción se ejecuta con los permisos del dueño y se salta el RLS) = `distinct on (clinica_id, sede_id, criterio_id) … order by … created_at desc`.
Triggers: `before update or delete` → excepción (sin políticas de update/delete; el trigger es la segunda barrera, también contra el service role). `before insert` → valida que el criterio **aplica** a la sede (`fn_hab_criterio_aplica(sede, criterio)`, §1.6), que no es encabezado ni `remite_a_11_1`, y que si `estado='cumple'` y `exigir_evidencia_cumple`, existe ≥ 1 evidencia activa para `(sede, criterio)`. Auditoría `fn_auditoria` en insert (AC4).
Inserción **solo** vía RPC `fn_hab_evaluar(p_sede, p_criterio, p_estado, p_justificacion, p_observacion, p_evidencias jsonb)` (`security invoker` → RLS aplica; una transacción: inserta evidencias nuevas y luego la evaluación). Políticas: select V; insert G(EDIT).
"Re-verificar" (>12 meses) se calcula de `fecha_verificacion`; no se guarda.

#### `hab_evidencias` — append-only con retiro
Las evidencias cuelgan de `(sede, criterio)`, **no** de una fila de evaluación: así sobreviven a las reevaluaciones (una tarjeta profesional sigue siendo evidencia aunque el criterio pase de pendiente a cumple y luego a no cumple). La instantánea de cierre congela cuáles estaban activas.
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id, clinica_id, sede_id, criterio_id | | no | |
| tipo | text check (`archivo`,`documento_normativo`,`documento_habilitacion`,`registro_modulo`,`enlace`,`nota`) | no | |
| storage_path, nombre_archivo, mime, tamano_bytes, sha256 | | sí | obligatorios si `archivo` (check) |
| tipo_documento_normativo_id | uuid FK tipos_documento_normativo | sí | si `documento_normativo`: apunta al **tipo** → se resuelve en vivo a la última versión |
| documento_clinica_id | uuid FK hab_documentos_clinica | sí | si `documento_habilitacion` |
| fuente_codigo | text check (lista cerrada §6) | sí | si `registro_modulo` |
| fuente_parametros | jsonb | sí | p. ej. `{"nevera_id": "…"}`; validado por la función proveedora, nunca usado para construir SQL dinámico |
| url | text | sí | si `enlace`; check `url ~ '^https://'` |
| descripcion | text | no | (texto de una `nota`) |
| sugerida_por_sistema | boolean | no | true si la creó el motor de sugerencias (§6) y el usuario la aceptó |
| created_by, created_at | | no | |
| retirada_en, retirada_por, retiro_motivo | | sí | |

Trigger: el único update permitido es poblar `retirada_*` una vez. Políticas: select V; insert G(CREATE); update G(EDIT).

#### `hab_criterio_asignaciones` — responsable y fecha objetivo (HU-4.4)
PK `(clinica_id, sede_id, criterio_id)`, `responsable_id uuid FK usuarios`, `fecha_objetivo date`, `updated_by`, `updated_at`. Mutable (es gestión, no declaración), con `fn_auditoria`; como ese trigger usa `new.id`, la tabla lleva además `id uuid default gen_random_uuid() unique`. Select V; insert/update G(EDIT); delete G(EDIT).

#### `hab_planes_mejora` (HU-4.5)
`id`, `clinica_id`, `sede_id`, `criterio_id`, `evaluacion_id uuid FK hab_evaluaciones` (el "No cumple" que lo originó), `accion text not null`, `responsable_id FK usuarios`, `fecha_compromiso date not null`, `estado text check (abierta, en_curso, cerrada) default 'abierta'`, `cierre_storage_path`, `cierre_nombre_archivo`, `cierre_observacion`, `fecha_cierre date`, `created_by/at`, `updated_at`. Trigger: una vez `cerrada`, inmutable (si hay que reabrir, se crea otro plan). Cerrar **no** cambia el criterio (AC3). Select V; insert G(CREATE); update G(EDIT).

#### `hab_autoevaluaciones` + `hab_autoevaluacion_detalle` — instantánea inmutable (HU-4.6)
`hab_autoevaluaciones`: `id`, `clinica_id`, `nombre text not null`, `motivo text check (inscripcion, cuarto_anio, renovacion_anual, novedad, levantamiento_medida)`, `norma_id`, `fecha_cierre timestamptz`, `cerrado_por`, `fecha_declaracion_reps date null`, `confirmo_servicios_no_aptos boolean not null`, `servicios_no_aptos jsonb` (lista congelada: snapshot), `resumen jsonb not null` (totales por estado/estándar/sede/servicio: snapshot para el tablero histórico sin recalcular), `ocurrencia_id uuid FK hab_obligacion_ocurrencias null`, `anulado…`.
Trigger: inmutable salvo (a) `fecha_declaracion_reps` de null→valor **una sola vez** (AC4: el usuario la digita después de declarar en el REPS) y (b) anulación.
`hab_autoevaluacion_detalle` (~450 filas por cierre): PK `(autoevaluacion_id, sede_id, criterio_id)`, `clinica_id`, `sede_nombre` (snapshot), `servicio_clave`, `estandar_codigo`, `criterio_codigo`, `texto_literal` (**snapshot**: si EWAH corrige luego una errata del catálogo, lo declarado no cambia), `estado`, `origen text (directo, remision, autorresuelto, encabezado)`, `remitido_desde_codigo`, `justificacion`, `evaluacion_id`, `evaluado_por`, `fecha_verificacion`, `evidencias jsonb` (snapshot: tipo, descripción, ruta/versión, resumen vivo calculado en ese momento por la función proveedora). Sin updates ni deletes (trigger). **Sin `fn_auditoria`** en el detalle (450 filas de auditoría por cierre no aportan: la cabecera sí se audita).
Inserción solo por RPC `fn_hab_cerrar_autoevaluacion(p_nombre, p_motivo, p_confirmo_no_aptos)` — `security invoker`, exige `has_permission('habilitacion','APPROVE')` en la política de insert de ambas tablas, calcula el conjunto con el mismo motor (§1.6) y los resúmenes de evidencia con las funciones proveedoras (§6) **dentro de la BD**: el cliente no puede inyectar un "resumen" fabricado. Marca la ocurrencia `reps-autoevaluacion` del periodo como presentada.

#### `hab_obligaciones_clinica` — configuración (HU-5.1 AC3)
`id`, `clinica_id`, `obligacion_id FK`, unique `(clinica_id, obligacion_id)`, `aplica_segun_perfil boolean not null` (lo escribe el sincronizador), `activa boolean not null`, `origen text check (automatica, manual)`, `justificacion text`, `fecha_consulta_asesor date`, `dias_aviso int[] null` (null = default del catálogo; check valores 0–365), `responsable_id FK usuarios null`, `correo_adicional text null` (contador externo; check de formato; **solo** recibe las alertas de esa obligación), `updated_by`, `updated_at`.
Check de rastro (D6 y AC3): `(aplica_segun_perfil and not activa) or (not aplica_segun_perfil and activa)` ⇒ `length(btrim(justificacion)) >= 10`.
RLS select V; update G(EDIT); insert solo por el sincronizador (security definer) o G(EDIT) para `origen='manual'`. Sin delete (si deja de aplicar, `aplica_segun_perfil=false` y la UI dice "ya no aplica a tu perfil").

#### `hab_obligacion_ocurrencias` (HU-5.2/5.3)
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id, clinica_id | | no | |
| obligacion_id | uuid FK | no | |
| origen | text check (`calendario`,`vencimiento_reps`,`subsanacion_visita`,`cierre_temporal`,`grupo_supersalud`,`manual`) | no | |
| clave_periodo | text | no | `2026-S2`, `2027-04`, `reps-2027-03-15` |
| periodo_corte | date | sí | |
| fecha_limite | date | no | **literal** de la norma (D5) |
| dia_no_habil | boolean | no | calculado al generar (sábado, domingo o `festivos`) |
| estado | text check (`pendiente`,`presentado`,`no_aplica_periodo`,`anulado`) | no | `vencido` y `extemporáneo` **se calculan** (pendiente con fecha pasada; presentado con `fecha_presentacion > fecha_limite`), no se guardan |
| fecha_presentacion | date | sí | |
| radicado | text | sí | |
| storage_path, nombre_archivo, mime, tamano_bytes | | sí | acuse |
| presentado_por, presentado_en | | sí | |
| justificacion | text | sí | obligatoria (≥10) para `no_aplica_periodo` y `anulado` |
| reemplaza_id | uuid FK self | sí | la corrección apunta a la anulada |
| generada_por | text check (`sistema`,`usuario`) | no | |
| created_at | | no | |

Unique parcial `(clinica_id, obligacion_id, clave_periodo) where estado <> 'anulado'` → la generación es **idempotente** (`on conflict do nothing`) y la corrección (anular + registrar de nuevo) no choca.
Trigger de transiciones: `pendiente → presentado | no_aplica_periodo | anulado`; `presentado | no_aplica_periodo → anulado`; nada más; una vez fuera de `pendiente`, ningún otro campo cambia (AC3 HU-5.3, mismo criterio que Tratamientos). Políticas: select V; update G(EDIT) para presentar/no aplica, G(VOID) para anular (se separan en dos políticas o se valida en el trigger con `has_permission`). Delete: ninguna para usuarios; el regenerador (`security definer`) solo puede borrar `estado='pendiente' and generada_por='sistema'`.

#### `hab_novedades_reportadas` (HU-5.5) — append-only con anulación
`id`, `clinica_id`, `novedad_codigo FK hab_novedades_catalogo(codigo)`, `sede_id null`, `servicio_habilitado_id null`, `fecha_reporte date not null`, `radicado`, archivo (4 columnas), `observacion`, `anulado…`, `created_by/at`. Efecto en la action: `cierre_temporal_servicio` → `clinica_servicios_habilitados.estado='cierre_temporal'` + ocurrencia `cierre_temporal` a 11 meses; `apertura_servicio` → la respuesta de la action incluye la sugerencia (la UI ofrece "Agregar el servicio en Sedes y servicios"). Insert G(CREATE), update G(VOID).

#### `hab_alertas_enviadas` — idempotencia y prueba de aviso
`id`, `clinica_id`, `objeto_tipo text check (ocurrencia, documento_version, plan_mejora, extintor, grupo)`, `objeto_id uuid`, `umbral_dias int`, `enviado_en timestamptz`, `destinatarios text[]`, `proveedor_id text` (id de Resend). Unique `(objeto_tipo, objeto_id, umbral_dias)`. Solo el service role escribe (sin políticas de insert); select `clinica_id = clinica_actual() and es_admin()`. Sin `fn_auditoria` (es un log).

### 1.5 Storage
Bucket **privado** nuevo `habilitacion` (separado de `documentos-rrhh`: otra población de permisos y contiene información financiera). Ruta: `<clinica_id>/<area>/<id_entidad>/<uuid>.<ext>` con `area ∈ {documentos, evidencias, tramite, obligaciones, planes, novedades}`. El nombre de archivo **nunca** se deriva del nombre que sube el usuario (ese se guarda en `nombre_archivo` y se escapa al renderizar/exportar).
Políticas en `storage.objects`: select `bucket_id='habilitacion' and (storage.foldername(name))[1] = clinica_actual()::text and has_permission('habilitacion','VIEW')` **y**, para la carpeta `documentos` cuyo catálogo es financiero, se resuelve por la tabla (el usuario sin `G(EDIT)` no obtiene la fila → no obtiene la ruta; la URL firmada solo se emite desde una action que primero leyó la fila con RLS). Insert: `has_permission('habilitacion','CREATE') and has_entitlement('habilitacion','gestion')`. **Sin delete** (ni admin): los archivos de habilitación nunca se borran (retención §3.3 del requerimiento). Un archivo subido cuya fila no llegó a insertarse (fallo entre upload e insert) queda huérfano: lo limpia un job manual de super admin, documentado como riesgo (§8).
Validación en servidor (no solo en el input): tamaño ≤ 10 MB (mismo límite que RRHH), lista blanca de MIME **y** verificación de firma (magic bytes) para PDF/JPEG/PNG/WebP/XLSX/DOCX; extensión derivada del MIME verificado, no del nombre. URLs firmadas de **60 s** (contenido sensible), generadas bajo demanda.

### 1.6 "¿Qué criterios aplican a esta clínica?" — motor de aplicabilidad en SQL

**Una sola implementación, en SQL**, usada por la UI, la validación de inserts, el preview y el cierre. Nada de reimplementarlo en TypeScript (dos motores = deriva garantizada).

Dos niveles:
1. **Núcleo puro** `fn_hab_resolver_criterios(p_contexto jsonb, p_fecha date) returns table(...)` — `stable`, `security invoker`, **solo lee tablas globales**. `p_contexto` describe hipotéticamente una sede: `{ "uso_edificacion": "...", "servicios": [{ "servicio_norma_id", "complejidad", "modalidades": [], "telemedicina_categorias": [], "telemedicina_roles": [] }] }`. Esto lo hace testeable con fixtures sin datos de clínica y permite el **preview** ("Este servicio te agrega N criterios", AC2 HU-2.2) llamando el mismo núcleo con y sin el servicio nuevo.
2. **Envoltorio de clínica** `fn_hab_criterios_aplicables(p_sede_id uuid default null, p_fecha date default current_date)` — `stable`, `security invoker` (RLS de la clínica aplica), arma el contexto desde `sedes` + `clinica_servicios_habilitados` (filas con `sede_id`, `servicio_norma_id` y `complejidad` no nulos y `estado <> 'cerrado'`; `cierre_temporal` sí entra con marca, porque para reactivar debe seguir cumpliendo) y llama al núcleo por cada sede. `fn_hab_criterio_aplica(sede, criterio) returns boolean` es un `exists` sobre él.

Salida: `sede_id, criterio_id, servicio_norma_id, estandar_codigo, bloque_id, padre_id, origen ('directo' | 'transversal' | 'remision'), remitido_desde_criterio_id, es_encabezado, autorresuelto, orden`.

Algoritmo (CTEs; los pasos son los del §4 del requerimiento, con las correcciones):
1. **Servicios de la sede** = filas válidas; **11.1** se agrega una vez por sede si la sede tiene ≥ 1 servicio. Contexto de 11.1 = unión de complejidades, modalidades, categorías y roles de todos los servicios de la sede.
2. **Bloques que coinciden** (todas las dimensiones; null no restringe):
   - complejidad: `b.aplica_complejidad is null or s.complejidad = 'no_aplica' or s.complejidad = any(b.aplica_complejidad)` (para 11.1: `b.aplica_complejidad && complejidades_union`).
   - modalidad: `b.aplica_modalidad is null or b.aplica_modalidad && s.modalidades` (arrays ya expandidos en la siembra; no hay caso especial de `extramural`).
   - telemedicina: si `b.aplica_telemedicina_categoria is not null` ⇒ `'telemedicina' = any(s.modalidades) and b.aplica_telemedicina_categoria && s.telemedicina_categorias and (b.aplica_telemedicina_rol is null or b.aplica_telemedicina_rol && s.telemedicina_roles)`.
   - edificación (11.1 IN): `b.aplica_tipo_edificacion is null or sede.uso_edificacion is null or b.aplica_tipo_edificacion = sede.uso_edificacion`.
   - Los demás subtítulos de 11.1 no filtran (se marcan "No aplica" a mano, como dice la norma).
3. **Vigencia**: `(c.vigente_desde is null or c.vigente_desde <= p_fecha) and (c.vigente_hasta is null or c.vigente_hasta > p_fecha)`. Con esto el 3-ene-2027 salen solos los 44 derogados y entra el DO.23.6 nuevo (D4) — **sin cron ni migración ese día**. Prueba de aceptación: llamar con `p_fecha = '2027-01-03'`.
4. **Remisiones** (`with recursive`, profundidad máx. 3, guarda de ciclos por `servicio_norma_id`): por cada criterio incluido con `tiene_remision`, se agregan los bloques del `servicio_destino_id` que coinciden con: el **mismo estándar** (o `estandar_destino`), la `complejidad_destino` (o la única del destino, o la del origen), las **mismas modalidades/telemedicina del servicio origen**, y, si `criterios_destino` no es null, solo esos códigos (quimioterapia 2022 → criterios 2019 puntuales, D3). Etiqueta `origen='remision'`, `remitido_desde_criterio_id`.
5. **Autorresueltos**: `remite_a_11_1 = true` ⇒ `autorresuelto = true` (no evaluable). Su estado lo deriva la capa de presentación (§3.3): cumple si todos los evaluables del **mismo estándar de 11.1 de esa sede** están en cumple/no aplica; no cumple si alguno no cumple; si no, pendiente. No cuentan en indicadores.
6. **Jerarquía**: un hijo solo se incluye si su padre está incluido (el script de siembra garantiza que estén en el mismo bloque). `es_encabezado` ⇒ no evaluable; estado derivado de hijos aplicables.
7. **Dedupe**: `distinct on (sede_id, criterio_id)` con prioridad `directo > transversal > remision`.

Rendimiento: 3.975 criterios, 708 bloques, pocas sedes por clínica → milisegundos. No hace falta vista materializada. Índices de §1.2 bastan. Criterio de aceptación: `explain analyze` del envoltorio para EWAH (4 sedes) < 100 ms en el proyecto de Supabase.

Para la UI hay una RPC compuesta `fn_hab_tablero_criterios(p_sede_id)` que devuelve el conjunto aplicable **ya unido** con la evaluación vigente, la asignación, el conteo de evidencias activas y los textos (una sola ida a la BD, ~465 filas ≈ 60–80 KB para EWAH).

### 1.7 Resumen de triggers y funciones nuevas

| Objeto | Tipo | Privilegio | Por qué no basta la app |
|---|---|---|---|
| `fn_servicio_habilitado_validar` | trigger before ins/upd | definer | Legalidad de complejidad/modalidad/numeral y misma clínica: dos pantallas escriben la misma fila |
| `fn_servicio_habilitado_no_borrar_evaluado` | trigger before delete | definer | Proteger la evidencia de autoevaluación |
| `fn_hab_misma_clinica` | trigger genérico | definer | IDOR por FK |
| `fn_hab_inmutable` | trigger before upd/del | invoker | Append-only real (evaluaciones, versiones, detalle de instantánea) |
| `fn_hab_solo_anular` | trigger before upd | invoker | Hitos, suficiencia, novedades, cabecera de autoevaluación |
| `fn_hab_ocurrencia_transicion` | trigger before upd | invoker | Máquina de estados de ocurrencias |
| `fn_hab_version_siguiente` | trigger before ins | definer | Numeración de versión sin carrera |
| `fn_hab_evaluacion_validar` | trigger before ins | invoker | Aplicabilidad + evidencia mínima |
| `fn_hab_resolver_criterios` / `fn_hab_criterios_aplicables` / `fn_hab_criterio_aplica` / `fn_hab_tablero_criterios` | funciones stable | invoker | Motor único |
| `fn_hab_evaluar`, `fn_hab_registrar_hito`, `fn_hab_cerrar_autoevaluacion` | RPC | invoker | Atomicidad multi-tabla con RLS vigente |
| `fn_hab_actualizar_edificacion_sede`, `fn_hab_actualizar_codigo_prestador` | RPC | **definer** (eleva para escribir 4 columnas de `sedes` / 1 de `clinicas` sin abrir su UPDATE general) | Documentar el privilegio en el comentario de la función |
| `fn_hab_sincronizar_obligaciones(p_clinica_id)`, `fn_hab_generar_ocurrencias(p_clinica_id)` | funciones | **definer**, `revoke execute from public, anon, authenticated` (lección de `bootstrap_clinica`, 0020); envoltorio `fn_hab_recalcular_mis_obligaciones()` para authenticated que valida `clinica_actual()` y `habilitacion/EDIT` | |
| `fn_hab_resumen_evidencia(p_fuente, p_sede_id, p_parametros)` y proveedoras `fn_hab_ev_*` | funciones stable | **definer** (leen tablas de RRHH/Medio Ambiente/Inventario cuyo RLS exige otros permisos) — filtran por `clinica_actual()` y exigen `habilitacion/VIEW`; devuelven solo agregados, nunca filas crudas (no salarios ni datos de salud del empleado) | §6 |
| `fn_hab_conteo_urgentes()` | stable | invoker | Badge del menú |

Todas las `security definer`: `set search_path = public`, comentario con "qué privilegio eleva y por qué".

### 1.8 RBAC, plan y entitlement

- `modulos`: `('habilitacion', 'Habilitación', 'Inscripción REPS, autoevaluación Res. 3100, documentos, obligaciones y calendario regulatorio.', '/habilitacion', 12, true)`. `es_administrativo = true` porque el módulo debe estar **activo en todos los planes** (la vista limitada de Gratis necesita `clinica_modulos.activo`).
- `plan_modulos`: incluido en `gratis` y `pro`. `plan_features`: `('habilitacion','gestion')` → `incluido = (plan = 'pro')`. Resultado: `has_entitlement('habilitacion')` = true en ambos; `has_entitlement('habilitacion','gestion')` = solo Pro (o override por clínica).
- Permisos: VIEW, CREATE, EDIT, VOID, APPROVE (cerrar autoevaluación), EXPORT (solo admin, como todo el sistema), DELETE (reservado; en esta entrega ninguna tabla lo usa — se registra para la matriz, pero no se otorga). Backfill solo a roles nivel 1 de clínicas existentes (criterio de RRHH, 0048: contiene información financiera); el admin delega luego. Para clínicas nuevas: `bootstrap_clinica()` versión 8 agrega `'habilitacion'` a su lista (alternativa del patrón 0060 —trigger en `clinicas`— no sirve aquí porque el rol Administrador se crea después del insert de la clínica).
- **Qué ve Gratis** (D-pago): Resumen/tablero y Calendario en solo lectura; Obligaciones en solo lectura (sin activar/desactivar ni marcar presentado); **Perfil editable** (es la entrada sin la cual el calendario sale vacío — ver §8-B); Documentos, Sedes y servicios (detalle), Autoevaluación: pantalla de upsell (`UpsellPlan`, ya existe). Correo de alertas: solo Pro; badge in-app: todos.
- Defensa en profundidad: cada escritura de gestión exige `has_permission(...) and has_entitlement('habilitacion','gestion')` **en la política RLS** y `requireHabilitacion(permiso, { gestion: true })` en la action (§3). El menú y el upsell son conveniencia.

---

## 2. Siembra de los 3.975 criterios, documentos y obligaciones

### 2.1 Recomendación: migración SQL **generada** por un script versionado en el repo

```
scripts/habilitacion/
  README.md                      (cómo regenerar; documentación del propio script)
  fuentes/                       copias congeladas de los JSON verificados (criterios.json, inscripcion.json,
                                 mapeo-servicios.json, reportes.json) + SHA-256 en fuentes/CHECKSUMS
  curaduria/
    remisiones.json              las 41 remisiones a otro servicio/complejidad + 3 de quimioterapia (D3)
    remite-11-1.json             lista explícita de los 547 autorresueltos (no un regex en caliente)
    correcciones-bloques.json    11.2.2 HC + intramural; normalización de edificación; lista blanca de falsos positivos
    criterios-adicionales.json   texto nuevo de 11.2.1.DO.23.6 vigente desde 2027-01-03 (Res. 914/2025 art. 13)
    vigencias.json               los 44 derogados → vigente_hasta 2027-01-03 (derivado de nota_vigencia, revisado a mano)
    mapeo-ajustes.json           D2: prácticas divididas/movidas, requiere_eleccion
    obligaciones-reglas.json     hab_obligacion_vencimientos por obligación y grupo
    documentos-condiciones.json  códigos de regla cerrados por documento
    festivos-co.json             2026–2028, con fuente
  generar-seed.mjs               Node puro (sin dependencias), determinista
  validar.mjs                    las aserciones de §2.3 (también lo llama generar-seed antes de escribir)
  generar-seed.test.mjs          vitest (ya instalado) sobre los helpers del script
```

Salida: `supabase/migrations/0063_habilitacion_seed_norma.sql` (normas, estándares, grupos, servicios, bloques, criterios, remisiones, mapeo) y `0064_habilitacion_seed_catalogos.sql` (documentos, obligaciones y reglas de fecha, novedades, tipos de prestador, festivos, tipos de documento normativo de habilitación). Encabezado de cada archivo: "GENERADO por scripts/habilitacion/generar-seed.mjs desde fuentes con SHA-256 …; no editar a mano".

Detalles obligatorios del generador:
- **UUID deterministas** (v5, namespace fijo del proyecto) sobre la clave natural. Mismos ids en local, staging y producción; regenerar no cambia ids; instantáneas y evaluaciones nunca quedan apuntando a un id huérfano.
- **Idempotente**: `insert … on conflict (id) do nothing`. Una corrección de texto posterior entra como **migración nueva y explícita** (`update hab_criterios set texto_literal = … where id = … -- errata, fuente …`), nunca regenerando y sobrescribiendo en silencio.
- Escapado: literales SQL estándar duplicando la comilla simple (no dollar-quoting: el texto de la norma puede contener `$`). Saltos de línea preservados.
- Inserts por lotes de 500 filas.
- Tamaño estimado: ~1,0–1,3 MB de SQL para 0063 (texto literal ≈ 365 KB + metadatos). Aceptable para `supabase db push`; si el CLI reclama, se parte por grupo de servicios (0063a…0063e) sin cambiar el generador.
- Orden: normas → estándares → grupos → servicios → bloques → criterios (padres antes que hijos, ordenado por `nivel`) → remisiones → mapeo.

### 2.2 Por qué esto y no otra cosa

| Opción | Veredicto |
|---|---|
| **Migración SQL generada + script versionado (recomendada)** | El catálogo viaja con el esquema: mismo orden y mismos ids en todos los entornos, revisable en el diff, reproducible desde fuentes con checksum, se aplica con el flujo ya establecido (`supabase db push --linked`, con `--dry-run` primero). Versionado por norma = una migración nueva por versión, generada por el mismo script con otro `norma.codigo`. |
| Migración escrita a mano | Inviable con 3.975 filas y propensa a errores; no deja rastro de cómo se derivó cada campo. |
| Importar en caliente desde Storage/JSON con una acción de super admin | Los entornos divergen, no hay revisión en PR, exige UI de super admin, y un fallo a mitad deja el catálogo a medias sin la atomicidad de una migración. |
| `supabase/seed.sql` | Solo corre en `db reset` local; no llega a producción. |
| Edge Function / job | Complejidad sin beneficio para un dato que cambia una vez cada varios años. |

Versionado futuro (MinSalud anunció un manual nuevo): fila nueva en `hab_normas` con `vigente_desde`, cierre de la anterior con `vigente_hasta`, catálogos nuevos con sus propios ids. Evaluaciones e instantáneas viejas siguen apuntando a sus criterios. El traslado de evaluaciones entre versiones (si hay criterios equivalentes) es un mapeo explícito que se diseña ese día; el modelo no lo impide.

### 2.3 Validaciones del script (si alguna falla, no se escribe el SQL)
1. Conteos: 3.975 criterios fuente (+1 curado), 708 bloques, 42 entradas de servicio, 7 estándares, 37 documentos, 17 obligaciones + propias, 40 novedades.
2. Ids únicos; todo `padre` resuelve a un criterio del **mismo bloque**; `es_encabezado` = "tiene hijos".
3. Valores de `aplica_*` dentro de los vocabularios cerrados; dimensiones del bloque contenidas en las del servicio (salvo 11.1).
4. Auditoría "encabezado_literal vs aplica_modalidad" (§0): 0 diferencias tras `correcciones-bloques.json` + lista blanca.
5. Remisiones: todo criterio que el regex marca como candidato está **clasificado** en `remisiones.json`, `remite-11-1.json` o en una lista explícita de "no es remisión" (el regex solo detecta candidatos; la clasificación es humana). Si el total curado no da 547/41, el script lo reporta y manda el número curado.
6. Vigencias: exactamente 44 criterios con `vigente_hasta = 2027-01-03`, todos con `nota_vigencia` que menciona la Res. 914/2025.
7. Mapeo: las 52 + 4 prácticas nuevas (D2) tienen ≥ 1 numeral; las de varias filas tienen `requiere_eleccion` en todas.
8. Reglas de fecha: para cada obligación con `fechas_2026_2027` en `reportes.json`, aplicar las reglas al grupo D2 reproduce **exactamente** esas fechas (prueba cruzada contra la fuente).
9. Prueba de humo del motor (F3, contra la BD): contexto EWAH → 465 criterios (§0).

### 2.4 Prototipo ya ejecutado
El prototipo en node usado para §0 (expansión de `extramural`, corrección HC, remisión 11.2.2→11.2.1 por estándar) da 465 criterios para EWAH. Sirve de referencia para escribir `validar.mjs`; no es código de producción.

---

## 3. Server actions y helpers

### 3.1 Reglas generales (no negociables)
- Cada action empieza por `requireHabilitacion(permiso, { gestion })`, helper nuevo en `lib/habilitacion/guard.ts` (**sin** `"use server"`; importa `server-only`) que compone `requirePermiso('habilitacion', permiso)` + `requireEntitlement('habilitacion','gestion')` cuando `gestion: true`. No se reimplementa el chequeo.
- Ninguna action recibe `clinica_id`, ni "el grupo", ni "la fecha calculada": todo se resuelve en servidor desde la sesión y la BD. Los ids recibidos (sede, criterio, documento) se validan contra la clínica por RLS + triggers de misma clínica.
- Validación de entrada con funciones puras propias (el proyecto no usa zod; no agregar dependencia): longitudes máximas (justificación ≤ 2.000, observación ≤ 4.000, radicado ≤ 100), fechas ISO, enums contra `constantes.ts`.
- Texto libre que va a correo/PDF/xlsx: escape HTML (`escapeHtml` hoy vive dentro de `lib/rrhh/alertas.ts` → **moverlo** a `lib/texto.ts`, que ya existe, y reutilizarlo); en xlsx, neutralizar inyección de fórmulas (prefijar `'` a valores que empiezan por `= + - @`).
- Errores: mensaje en español para el usuario; el detalle técnico solo en `console.error` del servidor. Nunca exponer el mensaje crudo de Postgres.
- Después de mutar: `revalidatePath('/habilitacion', 'layout')`.
- Las actions de archivo siguen el patrón de `lib/rrhh/documentos.ts` (FormData → validación → upload con cliente de sesión → insert) **corrigiendo** dos debilidades: validar la firma del archivo (no confiar en `archivo.type` ni en la extensión del nombre) y dejar que la versión la asigne el trigger.

### 3.2 Archivos y funciones

| Archivo | Directiva | Funciones (permiso · requiere gestión) | Validaciones clave |
|---|---|---|---|
| `lib/habilitacion/constantes.ts` | ninguna | `MODULO`, `FEATURE_GESTION`, vocabularios con etiquetas (§1.2.1), `ESTADOS_EVALUACION`, `ESTANDARES_ORDEN`, `UMBRALES_SEMAFORO = {rojo: 7, ambar: 30}`, `DIAS_AVISO_DEFAULT`, `MAX_ARCHIVO_BYTES`, `MIME_PERMITIDOS`, `FUENTES_EVIDENCIA`, umbrales del asistente de grupo | Archivo hermano obligatorio: **un archivo `"use server"` solo puede exportar funciones async**. Lo importan cliente y servidor. |
| `lib/habilitacion/tipos.ts` | ninguna | tipos de filas y de las RPC | |
| `lib/habilitacion/guard.ts` | `server-only` | `requireHabilitacion(permiso, opts)` | |
| `lib/habilitacion/consultas.ts` | `server-only` | `getPerfil`, `getSedesConServicios`, `getTableroCriterios(sedeId)`, `getChecklistDocumentos`, `getOcurrencias(rango)`, `getEventosCalendario(rango)`, `getIndicadores()` | Solo lectura con cliente de sesión (RLS). Patrón de `lib/catalogos.ts`. |
| `lib/habilitacion/perfil.ts` | `"use server"` | `guardarPerfil` (EDIT · no), `guardarGrupoSupersalud` (EDIT · no), `actualizarCodigoPrestador` (EDIT · no, RPC) | tipo obligatorio; `inscrito ⇒ fecha_vencimiento`; sin grupo para PI; el grupo guardado es el confirmado (el sugerido va en `grupo_asistente`). El recálculo de obligaciones lo hace el trigger. |
| `lib/habilitacion/sedes-servicios.ts` | `"use server"` | `actualizarEdificacionSede` (EDIT · sí, RPC), `guardarDetalleServicio` (EDIT · sí), `cambiarEstadoServicio` (EDIT · sí), `asignarPersonal` / `quitarPersonal` (EDIT · sí), `previsualizarCriterios(contexto)` (VIEW · sí; núcleo §1.6) | Las reglas de combinación están en el trigger; la action traduce su error a un mensaje claro. |
| `lib/clinicas/servicios-habilitados.ts` (existente) | `"use server"` | `agregarServicioHabilitado(practicaId, sedeId, codigo)` — **cambia la firma** (sede); mensajes de unicidad nuevos; `eliminarServicioHabilitado` traduce el error "tiene autoevaluación" | Sigue siendo solo admin, como hoy. |
| `lib/habilitacion/documentos.ts` | `"use server"` | `prepararChecklist()` (EDIT · sí: crea renglones faltantes según reglas), `subirVersion(formData)` (CREATE · sí), `marcarNoAplica` (EDIT · sí), `crearDocumentoAdicional` (CREATE · sí), `urlFirmada(versionId)` (VIEW · sí; 60 s) | tamaño, firma, MIME; `fecha_vencimiento ≥ fecha_expedicion`; documento financiero ⇒ EDIT para leerlo. |
| `lib/habilitacion/tramite.ts` | `"use server"` | `registrarHito` (CREATE · sí, RPC), `anularHito` (VOID · sí), `registrarSuficiencia` (CREATE · sí), `anularSuficiencia` (VOID · sí) | cifras ≥ 0 parseadas con un helper es-CO (sin `parseFloat` sobre "1.234.567,89"; gotcha del punto de miles ya visto en la importación del legado). |
| `lib/habilitacion/autoevaluacion.ts` | `"use server"` | `evaluarCriterio` (EDIT · sí, RPC `fn_hab_evaluar`), `agregarEvidencia(formData)` (CREATE · sí), `retirarEvidencia` (EDIT · sí), `asignarResponsable` (EDIT · sí), `crearPlanMejora` (CREATE · sí), `actualizarPlanMejora` / `cerrarPlanMejora` (EDIT · sí), `cerrarAutoevaluacion` (APPROVE · sí, RPC), `registrarFechaDeclaracionReps` (APPROVE · sí), `anularAutoevaluacion` (VOID · sí) | justificación ≥ 10 en No aplica; "No cumple" responde `{abrirPlanMejora: true}`; el cierre recalcula en BD la lista de servicios no aptos y exige `confirmoNoAptos` si no está vacía (no confía en la lista que mostró la UI). |
| `lib/habilitacion/obligaciones.ts` | `"use server"` | `configurarObligacion` (EDIT · sí), `presentarOcurrencia(formData)` (EDIT · sí), `marcarNoAplicaPeriodo` (EDIT · sí), `anularOcurrencia` (VOID · sí), `registrarOcurrenciaManual` (CREATE · sí), `recalcularObligaciones` (EDIT · no, RPC envoltorio), `registrarNovedad(formData)` (CREATE · sí), `anularNovedad` (VOID · sí) | desactivar una automática / activar una no aplicable ⇒ justificación + fecha de consulta al asesor (D6); `correo_adicional` válido; `fecha_presentacion ≤ hoy`. |
| `lib/habilitacion/exportar.ts` | `server-only` | `construirXlsxAutoevaluacion(id)`, `construirPdfAutoevaluacion(id)` (pdf-lib) | |
| `app/api/exportar/habilitacion/[id]/route.ts` | route handler | GET xlsx/pdf de una instantánea cerrada | `requireHabilitacion('EXPORT')`; mismo mecanismo de `app/api/exportar/*`. |
| `lib/habilitacion/alertas.ts` | `server-only` | `enviarAlertasHabilitacion()` | §4.4 |
| `app/api/cron/alertas-habilitacion/route.ts` | route handler | GET con `Bearer CRON_SECRET` | copia del patrón de `alertas-rrhh/route.ts` |

### 3.3 Helpers puros (sin E/S, con pruebas vitest en `lib/habilitacion/__tests__/`)
- `reglas-documentos.ts` — `documentosAplicables(catalogo, perfil, clinica, sedes, servicios)` evalúa los códigos de condición cerrados (§1.2) y devuelve `{aplica, motivo}` por documento y sede. Se queda en TS porque solo decide **presentación** (no crea alertas ni decide permisos).
- `estado-documento.ts` — `estadoDocumento(versionVigente, regla, fechaPlaneadaRadicacion, hoy)`, incluida la regla de 30 días (HU-3.2).
- `estado-criterio.ts` — estado derivado de encabezados (por hijos) y de autorresueltos (por estándar de 11.1 de la sede); `indicadores(filas)` según §6 del requerimiento (No aplica fuera del denominador; derivados y encabezados no cuentan); `estadoDeclaracionServicio` (Listo / Con incumplimientos (N) / Sin evaluar (N)).
- `semaforo.ts` — `semaforo(fechaLimite, estado, hoy)` → rojo / ámbar / verde / gris; una sola tabla de colores y una de íconos, reutilizada por calendario, tablero y correo.
- `suficiencia.ts` — 3 indicadores con división por cero controlada ("no calculable").
- `grupo-supersalud.ts` — asistente: umbrales literales de la CE 20211700000005-5 como **datos** (con cita) → grupo sugerido.
- `fechas.ts` — `diasRestantes` y formato es-CO de fechas sin `new Date('yyyy-mm-dd')` (corre el día por zona horaria; bug ya visto en RRHH): reutilizar `lib/medio-ambiente/fecha-local.ts`.

El estado derivado se calcula en TS **sobre el resultado de la RPC**; el motor de aplicabilidad sigue siendo uno solo (SQL).

---

## 4. Ocurrencias de obligaciones, fechas límite y alertas

### 4.1 Dónde viven y quién las genera
- **Aplicabilidad**: `fn_hab_sincronizar_obligaciones(p_clinica_id)` (definer, revocada a usuarios). Lee el perfil (tipo, grupo, revisor fiscal, UPGD, PEDT, factura), los servicios declarados (¿alguno con telemedicina?) y el catálogo; hace upsert en `hab_obligaciones_clinica`: `aplica_segun_perfil` siempre se recalcula; `activa` solo se fija al **crear** la fila (según `activacion_default`) y nunca pisa una decisión del usuario.
- **Ocurrencias**: `fn_hab_generar_ocurrencias(p_clinica_id)` (definer, revocada). Para cada obligación con config activa (las `por_confirmar` se generan para verse en gris, sin alertas):
  - `calendario`: años `actual − 1 … actual + 2` × filas de `hab_obligacion_vencimientos` que coinciden con tipo y grupo → `corte = make_date(y, mes_corte, coalesce(dia_corte, último día))`; `limite = make_date(año/mes de (corte + meses_despues), least(dia_limite, último día de ese mes))`; se conservan las de `[hoy − 400 días, hoy + 18 meses]` (las pasadas recientes se ven como vencidas si nadie las presentó). `clave_periodo` derivada del corte.
  - `vencimiento_reps`: una ocurrencia con `fecha_limite = perfil.fecha_vencimiento_reps`. Al cerrar la autoevaluación y registrar la nueva fecha de vencimiento, nace la siguiente.
  - `grupo_supersalud`: "Verifica tu grupo" anual con límite 31-ene (aviso después del 31-dic, HU-1.2 AC2); solo IPS.
  - `telemedicina-mensual`: día 5 de cada mes, solo si algún servicio declara telemedicina.
  - `dia_no_habil = extract(isodow) in (6,7) or exists festivo`.
  - **Diff idempotente**: `insert … on conflict do nothing` (índice único parcial) + `delete` de las `pendiente` con `generada_por='sistema'` que ya no están en el conjunto (p. ej. cambia el grupo de D2 a C1: las semestrales futuras sin presentar salen y entran las mensuales — AC4 HU-5.2). Presentadas, no aplica y anuladas **nunca** se tocan.
- Se generan en SQL (no en TS) porque crean filas que disparan alertas: el cálculo no debe depender de fechas enviadas por el cliente, y el cron y los triggers necesitan exactamente el mismo código.

### 4.2 Cuándo se recalcula
1. Trigger `after insert/update` en `hab_perfil_prestador`.
2. Trigger `after insert/update/delete` en `clinica_servicios_habilitados` cuando cambian `modalidades` o `estado` (telemedicina).
3. `configurarObligacion`.
4. Cron diario (§4.4), ventana deslizante de 18 meses.
5. Botón "Recalcular" (EDIT) en Obligaciones, por transparencia.

### 4.3 Fechas límite (D5) y días no hábiles
Fecha **literal** siempre. Si `dia_no_habil`: calendario, detalle y correo dicen "Cae en día no hábil (sábado / domingo / festivo: nombre). Preséntalo antes." No se corre la fecha. Si un año no tiene festivos sembrados, `dia_no_habil` se calcula solo con fin de semana y la UI avisa "festivos de AAAA no cargados" (nunca falla en silencio).

### 4.4 Alertas
**Correo** — `GET /api/cron/alertas-habilitacion`, diario `0 12 * * *` (7:00 Bogotá). Mismo patrón que `alertas-rrhh` (Bearer `CRON_SECRET`, `createAdminClient`, `Promise.allSettled`, nunca lanza):
1. Para cada clínica con el feature `gestion` (consulta de `plan_features` + overrides con cliente admin): `fn_hab_generar_ocurrencias`.
2. Ítems con umbral alcanzado y **no avisado**: para cada `t` en `dias_aviso` (config o default), si `dias_restantes <= t` y no existe `(objeto, t)` en `hab_alertas_enviadas` → entra. Si el cron falla un día, al siguiente sale el aviso pendiente y nunca se duplica. Objetos: ocurrencias `pendiente` de obligaciones activas y verificadas (las "por confirmar" no alertan, AC2 HU-5.1); versiones vigentes de documentos con `fecha_vencimiento`; planes de mejora abiertos; extintores de Medio Ambiente vencidos o por vencer (≤ 30 días) de sedes con servicios declarados; vencimiento REPS con 90/60 adicionales.
3. Destinatarios: `fn_hab_destinatarios(p_clinica_id)` (definer, revocada) = usuarios activos con `habilitacion/VIEW` o nivel 1; y `correo_adicional` **solo** para los ítems de su obligación, en correo aparte (al contador externo no se le expone el resto del estado regulatorio).
4. Un correo por clínica y día, agrupado por semáforo (rojo primero), con enlace al detalle en EWAH y al portal oficial, con la marca de la clínica (`construirRemitente`, 0046). Todo texto variable escapado.
5. Solo si Resend responde **sin `error`** (gotcha conocido: `emails.send` no rechaza la promesa, devuelve `{ error }`) se insertan las filas en `hab_alertas_enviadas`; si falla, se reintenta al día siguiente.

`vercel.json`: agregar el tercer cron. **Verificar el límite de cron jobs del plan de Vercel antes de F9**; si no admite otro, crear `GET /api/cron/diario` que llame en secuencia `enviarAlertasRrhh()` y `enviarAlertasHabilitacion()` y reemplazar la entrada de `alertas-rrhh` (las funciones ya están separadas en `lib/`).

**In-app** — insignia numérica en el ítem "Habilitación" del menú (escritorio y móvil) = `fn_hab_conteo_urgentes()` (vencidas + ≤ 7 días + documentos vencidos): RPC barata con índices, calculada en `app/(protected)/layout.tsx` **solo si** el usuario tiene `habilitacion/VIEW`. Todos los planes. `NavGroup`/`MobileNav` aceptan un `badge?: number` opcional por ítem. En el Resumen, el bloque "Lo urgente" va siempre arriba.

Índices: `hab_obligacion_ocurrencias (clinica_id, estado, fecha_limite)`, `hab_documento_versiones (clinica_id, fecha_vencimiento) where fecha_vencimiento is not null`, `hab_planes_mejora (clinica_id, estado, fecha_compromiso)`.

---

## 5. Frontend

### 5.1 Rutas (`app/(protected)/habilitacion/`)
Esqueleto estándar del proyecto: `page.tsx` Server Component (chequea `has_permission('habilitacion','VIEW')` → `<Alert variant="destructive">` si no; luego entitlement → `UpsellPlan` donde corresponda; datos con `Promise.all`), diálogos cliente `*-dialog.tsx` con `useActionState`, actions en `lib/habilitacion/*`.

```
habilitacion/
  layout.tsx                 Server: VIEW + carga liviana del estado de la ruta (6 pasos) para la subnavegación
  _components/
    habilitacion-nav.tsx     client: pestañas con <Link> + usePathname (escritorio) / DropdownMenu con render={<Link/>} (móvil)
    ruta-pasos.tsx           los 6 pasos con estado (pendiente / en curso / completo / alerta)
    semaforo-badge.tsx       insignia color+ícono (usa lib/habilitacion/semaforo.ts)
    vigencia-badge.tsx       "Deja de exigirse el 3-ene-2027 (Res. 914/2025)", "Suspendido provisionalmente", "Confianza baja", "Por confirmar con tu asesor"
    cita-norma.tsx           numeral + página + enlace al PDF oficial
    archivo-evidencia.tsx    lista de archivos con descarga por URL firmada (reusa FileInput para subir)
  page.tsx                   Resumen = tablero + ruta (paso 6, página de inicio)
  perfil/page.tsx            + perfil-form.tsx, asistente-grupo-dialog.tsx, codigo-prestador-dialog.tsx
  sedes/page.tsx             + edificacion-dialog.tsx, servicio-sede-dialog.tsx (con preview "te agrega N criterios"), personal-servicio-dialog.tsx
  documentos/page.tsx        + documento-versiones-dialog.tsx, no-aplica-dialog.tsx, documento-adicional-dialog.tsx,
                               tramite-timeline.tsx, hito-dialog.tsx, suficiencia-dialog.tsx
  autoevaluacion/page.tsx    + autoevaluacion-cliente.tsx, criterio-card.tsx, grupo-criterios.tsx, evaluar-dialog.tsx,
                               evidencia-dialog.tsx, plan-mejora-dialog.tsx, cerrar-autoevaluacion-dialog.tsx
  autoevaluacion/historial/page.tsx         lista de instantáneas cerradas
  autoevaluacion/historial/[id]/page.tsx    vista de la instantánea + exportar xlsx/PDF (solo admin)
  calendario/page.tsx        + calendario-obligaciones.tsx, ocurrencia-detalle-dialog.tsx, presentar-dialog.tsx
  obligaciones/page.tsx      + configurar-obligacion-dialog.tsx, novedad-dialog.tsx (sección "Novedades REPS")
```
Novedades va dentro de **Obligaciones** (reportar una novedad es la obligación `reps-novedades`), para no agregar una octava pestaña.

Gratis: `page.tsx` (Resumen), `calendario`, `obligaciones` (lectura) y `perfil` (editable) renderizan; `sedes` (detalle), `documentos`, `autoevaluacion` muestran `UpsellPlan` con el mensaje de lo que desbloquea. Los botones de acción en las vistas de lectura no se renderizan (no "deshabilitados con candado" por todas partes: una sola llamada a la acción en la cabecera, por UX).

### 5.2 Componentes reutilizados (no se crean equivalentes)
`Dialog` (50 %, solo cierra con X), `Combobox` (items `{value,label}` planos; `SIN_SELECCION`), `FileInput`, `toast.add()`, `Tabs` (pill con scroll), `Pagination` + `lib/pagination.ts` (20/página) en listas planas (historial de autoevaluaciones, ocurrencias pasadas, novedades), `Badge`, `Card`, `Table` con la convención móvil (`hidden md:table-cell`, acciones solo-ícono, **nunca** `flex-wrap` en una celda de acciones), formularios `grid-cols-1 sm:grid-cols-2`, `ExportarXlsxLink` (admin), `UpsellPlan`, `toItems`/`toItemsOpcional`, `campoOpcional`, `nombreCompleto`. Ningún `cloneElement` sobre `children` venidos de un Server Component (gotcha documentado).

### 5.3 Calendario: generalizar el de la Agenda sin duplicarlo
Hoy `citas/agenda-calendario.tsx` mezcla dos cosas: la **configuración base** de react-big-calendar (localizer es-CO con date-fns, mensajes, CSS, leyendas, navegación por URL) y la **lógica de citas** (diálogos de cita, recursos por sede, colores por profesional). Se extrae la primera:

- `components/calendario/calendario-base.tsx` (`"use client"`): localizer y `MENSAJES` (con `evento` y `sinEventos` parametrizables), import del CSS base, props `eventos`, `vistas` (subconjunto de day/week/month/agenda), `vista`, `fecha`, `onNavegar(fecha, vista)`, `leyendas: {titulo, items: {label, color?, Icono?}[]}[]`, `componenteEvento`, `eventPropGetter`, `onSelectEvent`, `onSelectSlot?`, `selectable?`, `min/max/step?`, `resources?`, `alto?`. Solo presentación; sin conocimiento de citas ni de obligaciones.
- `components/calendario/calendario-base.css`: lo genérico de `agenda-calendario.css`; lo específico de la Agenda se queda en su archivo.
- `AgendaCalendario` pasa a **consumir** `CalendarioBase` (misma UI, mismo comportamiento). Este refactor es la única intervención sobre `citas/` y tiene **prueba de regresión obligatoria** (Playwright: vistas día/semana/mes, abrir cita, crear cita desde un hueco, columnas por sede en vista día).
- `habilitacion/calendario/calendario-obligaciones.tsx` consume `CalendarioBase` con eventos de día completo (`allDay`), vistas mes / semana / agenda (lista), color = semáforo (fondo + borde) e **ícono = tipo** (reporte, documento, autoevaluación, plan de mejora, grupo Supersalud, novedad) — la misma regla que ya se aprendió en la Agenda (una dimensión por canal visual). Clic → `OcurrenciaDetalleDialog` (explicación, entidad, plataforma y enlace, instructivo, periodo, aviso de día no hábil, "Marcar como presentado").
- Datos: `getEventosCalendario(desde, hasta)` lee una vista `hab_eventos_calendario` (`security_invoker = true`) que une ocurrencias + vencimientos de versiones de documentos + compromisos de planes de mejora; el rango viene de `searchParams` (`fecha`, `vista`) igual que en `/citas`.

### 5.4 Semáforo y estados (consistencia visual)
Rojo = vencido o ≤ 7 días; ámbar = 8–30; verde = > 30; gris = presentado / no aplica en el periodo; gris con borde punteado = "por confirmar". Tokens de color de la marca (`--ewah-*`, `--destructive`); el color nunca es la única señal (ícono + texto "Vence en 5 días"), por accesibilidad. Estados de criterio: Cumple (✓ verde), No cumple (✗ rojo), No aplica (— gris), Pendiente (○ contorno), Se cumple con 11.1 (gris, sin botones), Encabezado ("N de M hijos cumplen").

### 5.5 Pantalla de autoevaluación (la más exigente)
**Volumen**: EWAH ≈ 465 aplicables en una sede; con varias sedes, cientos por sede. Decisiones:
- **Una sede a la vez** (selector Combobox arriba; default: la primera con pendientes). 11.1 se evalúa por sede (HU-4.3), así que mezclar sedes en una lista sería confuso y duplicaría tarjetas.
- **Carga**: la page (Server Component) llama una vez `fn_hab_tablero_criterios(sede)` (~465 filas, ~60–80 KB) y pasa el arreglo a `autoevaluacion-cliente.tsx`. Filtros **en cliente** (instantáneos, sin ida al servidor): estándar, servicio, estado (pendientes primero por defecto), "asignados a mí", "re-verificar", texto (normalizado sin tildes con el mismo criterio de `f_unaccent`). Los filtros se reflejan en la URL (`?sede=&estandar=&estado=…`) con `router.replace` para que el enlace sea compartible y el "Atrás" funcione.
- **Sin paginación** de criterios: paginar rompe la jerarquía (un padre en la página 3 y sus hijos en la 4) y el progreso por estándar. En su lugar:
  - Estándar como **pestañas** (7, en el orden de la norma) con contador "Talento humano 12/31" y mini barra de progreso; solo se renderiza el estándar activo (como máximo ~250 tarjetas en 11.1 IN + servicios).
  - Dentro del estándar, **grupos plegables por servicio** (11.1 primero, luego cada servicio; los criterios por remisión con la etiqueta "exigido por remisión desde 11.2.2.TH.1"); plegados por defecto los grupos sin pendientes.
  - Padres "Cuenta con:" como encabezado plegable con su estado derivado.
  - **`content-visibility: auto` + `contain-intrinsic-size`** en cada tarjeta: el navegador no pinta ni hace layout de lo que está fuera de pantalla. Es virtualización nativa sin dependencia; conserva Ctrl+F, accesibilidad y la altura de scroll. (Una librería de virtualización sería un fork de dependencias que no se justifica para < 300 nodos visibles.)
- **Tarjeta** (`criterio-card.tsx`): texto literal (con "ver más" si > 6 líneas), `CitaNorma` (numeral, página, PDF), insignias de vigencia/confianza, responsable y fecha de verificación, evidencias (conteo + sugeridas de otros módulos con su estado vivo, §6), y un **control segmentado de 3 botones grandes** (Cumple / No cumple / No aplica; `aria-pressed`, objetivos táctiles ≥ 44 px, en móvil a ancho completo apilados en `grid-cols-3`).
  - Cumple: si ya hay evidencia activa → se guarda directo; si no (y la clínica exige evidencia) → abre `EvidenciaDialog` y guarda al confirmar.
  - No aplica → `EvaluarDialog` con justificación (≥ 10).
  - No cumple → guarda y abre `PlanMejoraDialog` (AC3 HU-4.2).
- **Escritura optimista**: `useOptimistic` sobre el arreglo local + `startTransition(action)`; si la action falla, se revierte y sale un toast. Tras éxito, `revalidatePath` refresca contadores; el estado optimista evita el parpadeo.
- **Cabecera fija** (sticky): "Tienes **N** criterios; **M** se responden solos por remisión a 11.1; **E** encabezados" (valores reales) + barra global de avance de evaluación (evaluados / evaluables) y % de cumplimiento — el requerimiento pide mostrar el número para bajar la ansiedad. Botón "Cerrar autoevaluación" (APPROVE) a la derecha.
- **Movimiento** (técnicas concretas, todas con `tw-animate-css` ya instalado y respetando `prefers-reduced-motion`):
  - Cambio de estándar (pestaña): crossfade del contenido, `animate-in fade-in duration-200` del panel entrante.
  - Cambio de estado en una tarjeta: transición de color de fondo/borde de 150 ms (`transition-colors`) y el ícono del estado con `zoom-in-95 fade-in duration-150` (micro-confirmación, sin mover el layout).
  - Plegar/desplegar grupo: `data-open/data-closed` con `fade-in slide-in-from-top-1 duration-150` (patrón de `dialog.tsx`).
  - Barra de progreso: `transition-[width] duration-300 ease-out`.
  - No se usa `<ViewTransition>` en esta pantalla (las actualizaciones optimistas frecuentes no deben disparar transiciones de documento). Opcional en F10: transición Resumen → paso con `<ViewTransition>` (verificado disponible en `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`, sin configuración); si no se hace, nada se pierde.
- Criterio de aceptación de rendimiento: con 465 tarjetas cargadas en una laptop media, cambiar filtro < 100 ms (sin ida al servidor) y marcar un estado se refleja < 50 ms (optimista). Se mide con Performance de Chrome en la prueba de F5.

### 5.6 Tablero (Resumen) y la "Ruta de habilitación"
- Arriba: **"Lo urgente"** (vencidos + ≤ 7 días, ordenados por fecha, con enlace al portal oficial).
- **Ruta de 6 pasos** (`ruta-pasos.tsx`): stepper horizontal en escritorio, vertical en móvil; estado de cada paso calculado en servidor: 1 Perfil (completo si tipo + estado REPS válidos), 2 Sedes y servicios (completo si toda fila tiene sede, numeral, complejidad y modalidades; alerta si alguna sede sin tipo de edificación), 3 Documentos (aplicables para radicar cargados / total), 4 Autoevaluación (evaluados / evaluables y servicios no aptos), 5 Obligaciones (vencidas → alerta), 6 Tablero. Cada paso enlaza a su pestaña. La primera visita sin perfil muestra "Completa tu perfil para ver tu ruta" (AC1 HU-1.1) con la pregunta "¿Ya estás inscrito en el REPS?" que adapta los textos.
- Indicadores (definiciones del §6 del requerimiento, calculados por `estado-criterio.ts` sobre la misma RPC): % global; 7 barras por estándar con conteo de No cumple; **tabla servicio × sede con su estado de declaración** (el indicador más importante: un "No cumple" = no declarable aunque tenga 98 %); avance de evaluación; re-verificar; planes de mejora; documentos (cargados/aplicables, vencidos/por vencer, incluidos los de RRHH y Medio Ambiente referenciados); contador grande de días al vencimiento REPS (ámbar desde 90, rojo desde 30); próximas obligaciones por semáforo; disciplina de reporte (presentados a tiempo / total del último año); obligaciones por confirmar.
- Todo número es un enlace al detalle filtrado (p. ej. "3 No cumple en Infraestructura" → `/habilitacion/autoevaluacion?estandar=infraestructura&estado=no_cumple`).
- Gratis: el tablero en solo lectura muestra lo que se puede calcular sin gestión (obligaciones, vencimiento REPS) y tarjetas de cumplimiento en estado "Disponible en plan Pro".
- Gráficos: barras simples con CSS/SVG propio (sin librería de gráficos nueva).

### 5.7 RBAC, launcher y menú
- `REGISTRO_MODULOS` (`lib/modulos/registro.ts`, regla permanente): `{ codigo: 'habilitacion', nombre: 'Habilitación', descripcion: 'Inscripción REPS, autoevaluación y calendario regulatorio.', href: '/habilitacion', icono: ShieldCheckIcon }` (verificar que el ícono exista en la versión instalada de `lucide-react`). Como el módulo está activo en todos los planes, la tarjeta del launcher no muestra la insignia "Pro"; el upsell ocurre dentro.
- `NAV_GROUPS` (`app/(protected)/layout.tsx`): ítem `{ href: '/habilitacion', label: 'Habilitación' }` en **Administración** (como pidió el director), con `badge` (§4.4).
- Matriz de permisos de Usuarios y Roles: aparece sola al existir el módulo y sus permisos en `modulos`/`permisos`.
- Datos básicos (Parámetros): la lista de servicios habilitados pasa a mostrar **sede** y, si la clínica tiene el módulo, un enlace "Configurar complejidad y modalidades en Habilitación". El diálogo de agregar servicio pide sede (Combobox de sedes activas).
- Parámetros: no se registran los catálogos de habilitación en `CATALOGOS` (son normativos, de solo lectura y no tienen la forma id/código/nombre del motor genérico). `ModuloCatalogo` no cambia.

---

## 6. Reúso de RRHH, Medio Ambiente, Inventario y Documentos normativos como evidencia

**Mecanismo: "proveedores de evidencia" = funciones SQL de solo lectura que devuelven un resumen agregado vivo; la evidencia guarda la referencia (`tipo='registro_modulo'`, `fuente_codigo`, `fuente_parametros`), nunca una copia del dato.** Esto es lo que el director pidió como "función de resumen de cumplimiento" de cada módulo.

### 6.1 Contrato
`fn_hab_resumen_evidencia(p_fuente text, p_sede_id uuid, p_parametros jsonb) returns jsonb` — dispatcher `stable security definer set search_path = public`; valida `p_fuente` contra la lista cerrada (un `case`, **nunca** SQL dinámico con el texto recibido), exige `has_permission('habilitacion','VIEW')`, filtra todo por `clinica_actual()` y por la sede. Devuelve:
```json
{ "estado": "ok | alerta | falta", "titulo": "...", "detalle": "...", "conteos": {...},
  "sugerencia": "cumple | no_cumple | null", "enlace": "/medio-ambiente?tab=neveras&sede=...", "calculado_en": "..." }
```
`security definer` es necesario porque RRHH/Medio Ambiente/Inventario tienen RLS con sus propios permisos (`rrhh/VIEW`…) que el responsable de calidad puede no tener; a cambio, las proveedoras **solo devuelven agregados** (conteos, nombres de persona y estado del documento: vigente/vencido/falta) y **nunca** salarios, contratos, diagnósticos ni datos de salud del empleado (vacunas: solo "vigente/vencida", no el detalle). Esto es un requisito de revisión explícito para `ciberseguridad`.

### 6.2 Proveedores de esta entrega (lista cerrada `FUENTES_EVIDENCIA`)
| `fuente_codigo` | Lee | Resumen | Criterios típicos (se asocian por curaduría, no por adivinanza) |
|---|---|---|---|
| `rrhh_talento_humano` | `hab_servicio_personal` → `empleados` + `documentos_empleado` (`acta_diploma`, `tarjeta_profesional`, `vacuna`) + `empleados.numero_tarjeta_profesional` | tabla persona × documento requerido con ✓ / ✗ / vencido; sugiere "cumple" si todos vigentes | 11.1 TH.1, TH.2, vacunación; TH de cada servicio |
| `ma_temperatura_nevera` | `registros_temperatura_nevera` (`fuente_parametros.nevera_id` opcional) | "28/30 días del último mes, 0 fuera de rango" | 11.1 MD cadena de frío |
| `ma_temperatura_ambiente` | `registros_temperatura_consultorio` | días con registro / fuera de rango | 11.1 IN / MD almacenamiento |
| `ma_residuos` | `registros_residuos` | registros del último mes por color | 11.1 IN/PP gestión de residuos, PGIRASA |
| `ma_limpieza` | `registros_limpieza` | cobertura por área y jornada | 11.1 IN orden, aseo, limpieza y desinfección |
| `ma_extintores` | `extintores` | vigentes / por vencer ≤ 30 / vencidos | plan de emergencias |
| `inv_registro_sanitario` | insumos activos (`registro_sanitario`, `fecha_vencimiento_registro_invima`) | "N insumos activos sin registro sanitario o con registro vencido" → sugiere "no cumple" si N > 0 | 11.1 MD registro sanitario |
| `inv_lotes_vencidos` | lotes con existencia y `fecha_vencimiento` | "N lotes vencidos con existencia" | 11.1 MD fechas de vencimiento, trazabilidad |
| `sistema_consentimientos` | `tratamiento_consentimientos` (conteo del último trimestre / tratamientos) | ficha descriptiva del software + cobertura | 11.1 PP consentimiento informado |
| `sistema_historia_clinica` | metadatos: evoluciones append-only, `auditoria` activa | ficha descriptiva prellenada ("historia clínica append-only con auditoría de cambios") | 11.1 HC contenido, trazabilidad, custodia |

### 6.3 Asociación criterio ↔ fuente (sugerencias)
Tabla global curada `hab_criterio_fuentes_sugeridas (criterio_id, fuente_codigo, nota)` sembrada por el mismo script (lista revisada a mano en F6, no inferida por palabras clave en tiempo de ejecución). En la tarjeta del criterio, la sección "Evidencia de otros módulos" muestra el resumen vivo de cada fuente sugerida con botón **"Usar como evidencia"** (crea la fila `registro_modulo`, `sugerida_por_sistema = true`). Si la fuente devuelve `falta`, la tarjeta muestra "Falta en [módulo] → ir a cargarlo" con el enlace (nunca pide un archivo suelto en su lugar). La sugerencia "cumple/no cumple" **nunca** cambia el estado sola: el responsable confirma (AC de HU-4.7).

### 6.4 Documentos normativos (protocolos) — sin segundo repositorio
- Los tipos con `categoria = 'habilitacion'` se gestionan desde Habilitación (la evidencia `documento_normativo` apunta al **tipo**: siempre muestra la última versión vigente; la instantánea congela el `id` de la versión).
- Ajuste de políticas de `documentos_normativos` (migración de F6): select `… and (has_permission('rrhh','VIEW') or (has_permission('habilitacion','VIEW') and tipo es de categoria 'habilitacion'))`; insert análogo con `CREATE` + `has_entitlement('habilitacion','gestion')`; **delete deshabilitado para la categoría habilitación** (nueva política: `es_admin() and tipo no es 'habilitacion'`). `lib/rrhh/protocolos.ts` debe excluir esos tipos de su botón de eliminar.
- Storage `documentos-rrhh`: se agrega una política paralela que permite select/insert con `habilitacion` **solo** bajo `<clinica_id>/normativos-habilitacion/…` (subcarpeta nueva; los protocolos de RRHH siguen en `normativos/`).
- La asignación de versión de `documentos_normativos` hoy la calcula la app (condición de carrera); para la categoría habilitación se usa el mismo trigger `fn_hab_version_siguiente` (y se recomienda adoptarlo también para RRHH, fuera de alcance).

### 6.5 Lo que NO se hace
No se copian filas de otros módulos a tablas de habilitación; no se crean "documentos de habilitación" duplicados de tarjetas profesionales; no se consulta desde TS la tabla interna de otro módulo (solo vía proveedora). Si mañana cambia el esquema de Medio Ambiente, se ajusta **una** función.

---

## 7. Plan de construcción por fases

Reglas para todas las fases:
- Migraciones: `npx supabase db push --linked --dry-run` primero; aplicar solo cuando el usuario lo pida (flujo del proyecto). Si falla con "ya existe", `migration repair` antes de reintentar.
- **Números de migración reservados desde ya** (para que fases paralelas no choquen): 0061 RBAC + catálogo de prácticas + servicios por sede + perfil + sedes; 0062 esquema global; 0063 seed norma (generado); 0064 seed catálogos (generado); 0065 motor de aplicabilidad; 0066 autoevaluación (evaluaciones, evidencias, asignaciones, planes, instantáneas, bucket); 0067 documentos + trámite + suficiencia; 0068 obligaciones + ocurrencias + novedades + alertas; 0069 proveedores de evidencia + ajuste de políticas de `documentos_normativos`. Si una fase no necesita su número, se deja una migración vacía con comentario (no se renumera).
- Cada fase termina con: `pnpm lint` + `pnpm test` (vitest) + build sin errores, prueba visual con `playwright cli --browser=chrome` (no descargar Chromium) en escritorio **y** a 390 px de ancho, despliegue a staging en Vercel para revisión en vivo, commit; el usuario hace el push (se le da el comando exacto).
- Usuarios de prueba para Playwright: admin de EWAH (Pro), admin de una clínica Gratis, un rol sin permiso de habilitación, un rol con VIEW solamente.

| Fase | Contenido | Migración / archivos | "Terminado" (verificable) | Prueba Playwright / técnica |
|---|---|---|---|---|
| **F0 · Datos** | Script de siembra, curaduría (41 remisiones, 547 autorresueltos, 11.2.2 HC, edificación, DO.23.6 2027, 44 vigencias, reglas de fecha, condiciones de documentos, festivos) | `scripts/habilitacion/**` | `node scripts/habilitacion/generar-seed.mjs` produce 0063/0064 deterministas (dos corridas → mismo SHA); `validar.mjs` en verde (§2.3); pruebas vitest del script en verde | No UI. Revisión humana de la curaduría por `director-proyecto` / `investigador-regulatorio` (archivos `curaduria/*.json` en el PR). |
| **F1 · Cimientos** | Módulo RBAC, permisos, plan/feature, bootstrap v8; ajuste D2 de `practicas_medicas` con aserción; ampliación de `clinica_servicios_habilitados` + trigger de validación; columnas de `sedes` + RPC; `hab_perfil_prestador` (sin el trigger de obligaciones, que llega en F8) | 0061 (menos lo que depende del esquema global: el FK `servicio_norma_id` y el trigger de validación se agregan en 0062) | `has_entitlement('habilitacion')` true en Gratis y Pro, `('habilitacion','gestion')` solo Pro; la fila de IPS ACME sigue existiendo con `sede_id` null; Datos básicos sigue funcionando (agregar servicio pide sede) | Datos básicos: agregar/quitar servicio con sede; matriz de roles muestra "Habilitación". |
| **F2 · Catálogo global** | Esquema global §1.2 + seed generado; FK y trigger de validación de `clinica_servicios_habilitados` | 0062, 0063, 0064 | Conteos en BD = conteos del script; `select` de catálogo funciona con usuario normal y falla la escritura (no super admin) | Script SQL de verificación (conteos, una fila de cada tabla). |
| **F3 · Motor** | `fn_hab_resolver_criterios`, `fn_hab_criterios_aplicables`, `fn_hab_criterio_aplica`, `fn_hab_tablero_criterios` | 0065 | Fixtures SQL: EWAH → **465**; con `p_fecha = 2027-01-03` → −44 derogados aplicables + DO.23.6 nuevo (si el contexto incluye 11.2.1 DO); sede mixta vs exclusiva cambia los bloques de edificación; servicio con telemedicina interactiva/referencia agrega solo esos bloques; quimioterapia 2022 incluye solo los criterios 2019 referenciados; `explain analyze` < 100 ms | `scripts/habilitacion/probar-motor.mjs` contra staging (RPC con usuario de prueba). |
| **F4 · Cascarón UI** | Layout, subnavegación, Resumen (con ruta de 6 pasos y estados parciales), Perfil completo (asistente de grupo, código de prestador), Sedes y servicios (edificación, detalle del servicio con preview de criterios, personal), launcher, NAV, upsell | `app/(protected)/habilitacion/{layout,page,perfil,sedes}`, `_components/*`, `lib/habilitacion/{constantes,tipos,guard,consultas,perfil,sedes-servicios}.ts`, `lib/modulos/registro.ts`, `app/(protected)/layout.tsx`, `nav-group.tsx`, `mobile-nav.tsx` | Gratis ve Resumen/Perfil y upsell en el resto; Pro ve todo; rol sin VIEW recibe alerta; preview "te agrega N criterios" coincide con el motor | Flujo: completar perfil IPS D2 → declarar 11.2.2 mediana intramural en una sede → ver "465 criterios"; Obstetricia exige elegir numeral; complejidad inválida rechazada por el trigger aunque se fuerce por consola. |
| **F5 · Autoevaluación** | evaluaciones, evidencias (archivo/nota/enlace), asignaciones, planes de mejora, bucket `habilitacion`, pantalla §5.5 | 0066; `autoevaluacion/**`, `lib/habilitacion/{autoevaluacion,estado-criterio,semaforo,fechas}.ts` | Append-only probado: `update`/`delete` directo por PostgREST falla; No aplica sin justificación falla en BD; Cumple sin evidencia falla en BD; encabezados y autorresueltos no aceptan evaluación; rendimiento §5.5 | Marcar 10 criterios (los 3 estados), subir evidencia, plan de mejora desde No cumple, filtros por URL, móvil 390 px. |
| **F6 · Evidencia de otros módulos** | Proveedoras `fn_hab_ev_*` + dispatcher, `hab_criterio_fuentes_sugeridas` (seed), ajuste de políticas de `documentos_normativos` y storage, tipos normativos de habilitación, `lib/rrhh/protocolos.ts` sin delete para esa categoría | 0069 (+ regeneración de 0064 o migración 0069b con las fuentes sugeridas) | Usuario con solo `habilitacion/VIEW` ve el resumen de RRHH sin poder abrir RRHH; ninguna proveedora devuelve salario ni datos de salud (revisión de `ciberseguridad`) | Criterio TH muestra la tabla de personas; nevera muestra días con registro; "Usar como evidencia" crea la referencia. |
| **F7 · Documentos y trámite** | checklist por reglas, versiones, no aplica, adicionales, línea de tiempo del trámite, suficiencia patrimonial | 0067; `documentos/**`, `lib/habilitacion/{documentos,tramite,reglas-documentos,estado-documento,suficiencia}.ts` | IPS persona jurídica vs profesional independiente generan checklists distintos (casos AC3 HU-3.1); regla de 30 días contra fecha planeada; versión nueva conserva la anterior; archivo con extensión falsa rechazado | Subir versión 1 y 2 de un documento; registrar visita con subsanables → aparece obligación a 8 días hábiles. |
| **F8 · Obligaciones y calendario** | sincronizador y generador SQL, triggers de recálculo, config por clínica, presentar/anular, novedades, `CalendarioBase` + refactor de la Agenda, calendario de obligaciones | 0068; `components/calendario/**`, `citas/agenda-calendario.tsx` (refactor), `calendario/**`, `obligaciones/**`, `lib/habilitacion/obligaciones.ts` | Fechas generadas para D2 = `fechas_2026_2027` de `reportes.json`; cambio de grupo regenera solo pendientes; presentada no editable; extemporánea marcada; día no hábil avisado; **Agenda sin regresiones** | Regresión completa de `/citas`; calendario de obligaciones mes/semana/agenda; presentar con acuse; anular y registrar de nuevo. |
| **F9 · Alertas** | cron, `hab_alertas_enviadas`, destinatarios, correo agrupado, badge | `app/api/cron/alertas-habilitacion/route.ts`, `lib/habilitacion/alertas.ts`, `vercel.json`, `lib/texto.ts` (escapeHtml movido) | Dos ejecuciones seguidas no duplican; un umbral perdido se envía al día siguiente; error de Resend no marca enviado; Gratis no recibe correo | Llamada manual al endpoint con `CRON_SECRET` en staging + verificación del correo recibido; badge visible en escritorio y móvil. |
| **F10 · Tablero y cierre** | indicadores completos, cierre de autoevaluación (instantánea), historial, exportar xlsx/PDF, fecha de declaración REPS | (usa 0066); `page.tsx`, `autoevaluacion/historial/**`, `lib/habilitacion/exportar.ts`, `app/api/exportar/habilitacion/[id]/route.ts` | Instantánea inmutable (update/delete fallan); texto congelado aunque cambie el catálogo; aviso de servicios no aptos exige confirmación; export solo admin; ocurrencia REPS del año queda presentada | Cerrar una autoevaluación con 1 No cumple → aviso → confirmar → descargar xlsx y PDF. |
| **F11 · Endurecimiento** | `ciberseguridad` (RLS por tabla con usuario de otra clínica, IDOR por FK, storage, funciones definer revocadas), `aseguramiento-calidad` (regresión), `documentador`, `memoria-proyecto` | — | Informe sin hallazgos críticos abiertos | Suite Playwright completa del módulo. |

**Paralelismo sin choque de archivos:**
- **F0 ∥ F1** (script en `scripts/` vs migración 0061 y UI de Datos básicos).
- Tras F2: **F3 ∥ F4** (SQL del motor vs UI de perfil/sedes; F4 usa el preview, que se conecta al final de F3 — se acuerda la firma de la RPC antes de empezar).
- Tras F3/F4: **F5 ∥ F7 ∥ F8** — tablas, migraciones (0066 / 0067 / 0068), carpetas de rutas y archivos `lib/habilitacion/*.ts` disjuntos. Puntos de contacto a coordinar: `constantes.ts` y `tipos.ts` (cada fase agrega su bloque; conflictos triviales de merge), y el bucket `habilitacion` (lo crea 0066; F7 y F8 dependen de él → aplicar 0066 primero o crear el bucket en 0061).
- **F6** después de F5 (usa la tarjeta de criterio). **F9** después de F8. **F10** después de F5 + F8. **F11** al final, aunque cada fase ya pasa su propia verificación de RLS.
- Recomendación: mover la creación del bucket `habilitacion` a **0061** para eliminar esa dependencia.

---

## 8. Riesgos técnicos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Error en la curaduría (remisiones, autorresueltos, vigencias) → la clínica ve criterios de menos (exposición en una visita) o de más (ansiedad) | Curaduría en archivos revisables en PR por `director-proyecto`/`investigador-regulatorio`; el script exige clasificar todo candidato; prueba de aceptación EWAH = 465; ante duda, la regla del motor es **conservadora** (incluir). |
| R2 | Bloques con `aplica_*` mal normalizados (como 11.2.2 HC) | Auditoría automática encabezado vs arrays en `validar.mjs` con lista blanca explícita; `correccion_curada` documenta cada ajuste. |
| R3 | La norma cambia (manual nuevo anunciado, revocatorias) | Versionado `hab_normas` + criterios con vigencias + instantáneas con texto congelado; el script regenera una versión nueva sin tocar la anterior. |
| R4 | Vista sin `security_invoker` o función `definer` sin filtro de clínica → fuga entre clínicas | Checklist de revisión obligatorio en cada migración; prueba de F11 con usuario de otra clínica sobre **cada** tabla, vista y RPC; `revoke execute` en las funciones solo-servidor (lección de `bootstrap_clinica`). |
| R5 | Las proveedoras de evidencia (definer) exponen datos de RRHH a quien no tiene permiso de RRHH | Solo agregados; lista de campos permitidos por proveedora revisada por `ciberseguridad`; nunca salarios ni detalle de salud. |
| R6 | Archivos maliciosos o con tipo falso | Validación de firma en servidor, lista blanca, tamaño, ruta generada por el servidor, URLs firmadas de 60 s, bucket privado sin delete. |
| R7 | Archivo subido sin fila (fallo entre upload e insert) | Se acepta el huérfano (no se borra nada del bucket); script de super admin que lista huérfanos para limpieza manual. |
| R8 | Límite de cron jobs del plan de Vercel | Verificar antes de F9; plan B: un único `/api/cron/diario` que orquesta RRHH + Habilitación. |
| R9 | Fallo silencioso de Resend (no rechaza la promesa) | Revisar `error` explícitamente; marcar enviado solo con éxito; catch-up por umbral. |
| R10 | Fechas corridas por zona horaria (`new Date('yyyy-mm-dd')`) | Helper de fecha local ya existente; pruebas vitest de bordes (31-dic, 29-feb, día no hábil). |
| R11 | Festivos no sembrados o equivocados | Tabla con `fuente`; aviso visible si falta el año; cotejo contra fuente oficial en F0. |
| R12 | Refactor de la Agenda rompe `/citas` (módulo crítico) | Extracción sin cambio de comportamiento + regresión Playwright obligatoria antes del merge de F8; si se complica, F8 puede arrancar con `CalendarioBase` usado solo por habilitación y migrar la Agenda en un PR aparte (nunca copiar el componente). |
| R13 | Migración grande del seed (~1,2 MB) falla en `db push` | Lotes de 500; partición por grupo de servicios si hace falta; `--dry-run` previo. |
| R14 | Doble edición de la fila de servicios (Datos básicos y Habilitación) | Columnas separadas por pantalla + trigger único de validación; mensajes de error traducidos en ambas. |
| R15 | Lista larga lenta en móviles | Una sede y un estándar a la vez, filtros en cliente, `content-visibility`, medición en F5. |
| R16 | Falsa seguridad: el usuario cree que EWAH radicó | Texto fijo en la UI y en el correo: "EWAH no radica ante el Estado; carga oficial en [portal]". Estado "presentado" solo con fecha y radicado digitados por el usuario. |
| R17 | Condición de carrera al versionar | Trigger `fn_hab_version_siguiente` con bloqueo de la fila padre. |
| R18 | Rendimiento del layout por la insignia | RPC de conteo indexada, solo para usuarios con VIEW; si crece, cache por request con `React.cache`. |

### Decisiones que requieren al usuario

**A. (Bloquea parte de F1) `tipos_tratamiento.servicio_habilitado_id` con servicios por sede.** Hoy un tipo de tratamiento apunta a una fila de servicio habilitado; con D1 esa fila es por sede, así que el combobox de Parámetros mostraría el mismo servicio una vez por sede y el tipo de tratamiento quedaría atado a una sede. Hoy no hay ningún tipo de tratamiento que lo use (0 filas, verificado).
- **Recomendado:** cambiar la referencia a `practica_medica_id` (el servicio, a nivel de clínica). El código de habilitación para RIPS se resuelve después con la sede del tratamiento. Se agrega la columna nueva y la vieja queda sin uso; no se borra nada.
- Alternativa: dejarlo como está. Cada tipo de tratamiento queda atado a la fila de una sede.

**B. (No bloqueante, ya tiene valor por defecto) Plan Gratis.** El diseño deja **editable el Perfil** en Gratis, porque sin tipo de prestador, grupo y fecha del REPS el calendario sale vacío. Las alertas por correo quedan solo en Pro y la insignia en el sistema para todos. Si el usuario quiere que Gratis sea 100 % de solo lectura, el calendario gratuito solo mostraría obligaciones genéricas sin fechas propias.

**C. (No bloqueante) Unidad de quemados.** Se mapea a dos numerales (11.4.9 y 11.4.7). Recomiendo tratarla como Obstetricia y SPA: la clínica elige el numeral. D2 no la mencionó.
