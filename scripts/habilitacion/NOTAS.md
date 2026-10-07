# Siembra del módulo de Habilitación (F0)

Genera las migraciones de catálogo global del módulo (diseño técnico §1.2 y §2):

- `salida/0063_habilitacion_seed_norma.sql`: norma, estándares, grupos, servicios, bloques, criterios, remisiones y mapeo práctica → servicio. Al final, backfill de `clinica_servicios_habilitados.servicio_norma_id` en filas existentes cuya práctica tiene un solo numeral (F2).
- `salida/0064_habilitacion_seed_catalogos.sql`: tipos de prestador, documentos, obligaciones y reglas de fecha, novedades y festivos.

Se escriben en `salida/` y **no** en `supabase/migrations/`. La fase F2 las mueve junto con el esquema (0062).

## Uso

```bash
node scripts/habilitacion/validar.mjs        # las 9 validaciones de §2.3 (código 1 si alguna falla)
node scripts/habilitacion/generar-seed.mjs   # valida y, si todo está en verde, escribe salida/ e imprime el SHA-256
cd apps/web && npx vitest run lib/habilitacion/__tests__/seed-script.test.ts
```

Node puro, sin dependencias. Dos corridas producen el mismo SHA-256. El SQL es idempotente: `insert … on conflict do nothing`, ids uuid v5 deterministas y aserciones de conteo al final de cada archivo. Las fuentes en `fuentes/` están congeladas: `cargar.mjs` verifica su SHA-256 contra `fuentes/CHECKSUMS` (con saltos de línea normalizados a LF). Si una fuente cambia, es una versión nueva de la norma.

Si una fila ya aplicada necesita corrección, se hace con una migración nueva y explícita (`update … where id = …`). No se regenera 0063 después de aplicada.

## Estructura

| Ruta | Qué es |
|---|---|
| `fuentes/*.json` + `CHECKSUMS` | Copias congeladas de `criterios.json`, `inscripcion.json`, `mapeo-servicios.json` y `reportes.json` |
| `curaduria/remisiones.json` | 68 remisiones a otro servicio, complejidad, modalidad o versión, cada una con su nota |
| `curaduria/remite-11-1.json` | 481 autorresueltos y 77 candidatos que no se autorresuelven, cada uno con su motivo |
| `curaduria/no-remision.json` | 14 candidatos del regex que no son remisión, con su motivo |
| `curaduria/correcciones-bloques.json` | 11.2.2 HC + `intramural`, edificación de 11.1 IN, jerarquía de 11.3.6.DO.9.3 y lista blanca de la auditoría |
| `curaduria/criterios-adicionales.json` | Texto nuevo de 11.2.1.DO.23.6 (Res. 914/2025, desde 2027-01-03) |
| `curaduria/vigencias.json` | 44 derogados y 1 modificado por la Res. 914/2025 |
| `curaduria/mapeo-ajustes.json` | D2: divisiones (uuid de 0061), opciones de elección e inferidas |
| `curaduria/obligaciones-reglas.json` | Campos estructurados y reglas de fecha de 17 obligaciones + 5 propias |
| `curaduria/documentos-condiciones.json` | Códigos de condición, sección, por sede y vencimiento de los 37 documentos |
| `curaduria/festivos-co.json` | Festivos de Colombia 2026–2028 |
| `lib/*.mjs` | Lógica pura: uuid, sql, fechas, festivos, modelo, motor de referencia, validaciones y generación de SQL |
| `generar-seed.mjs`, `validar.mjs` | Programas de línea de comandos |

## Resultado de la generación

| Tabla | Filas |
|---|---|
| hab_normas / hab_estandares / hab_grupos_servicio | 1 / 7 / 5 |
| hab_servicios_norma | 42 |
| hab_bloques | 708 |
| hab_criterios | 3.976 (3.975 de la fuente + DO.23.6 nuevo). 593 encabezados, 481 autorresueltos y 45 con `vigente_hasta = 2027-01-03` |
| hab_criterio_remisiones | 68 (9 a otro servicio, 38 a otra complejidad, 18 a otra modalidad del mismo servicio, 3 a la versión 2019 de 11.3.7) |
| hab_mapeo_practica_servicio | 62 filas para 56 prácticas (52 + 4 de D2) |
| hab_tipos_prestador / hab_documentos_catalogo | 4 / 37 |
| hab_obligaciones_catalogo / hab_obligacion_vencimientos | 22 (17 de reportes.json + 5 propias) / 113 reglas |
| hab_novedades_catalogo / festivos | 40 / 54 |

Prueba de humo con el motor de referencia en JS (`lib/motor.mjs`). Caso EWAH: 11.2.2, complejidad mediana, intramural, edificación exclusiva.

- 2026-10-06: **465** criterios (389 de 11.1, 16 de 11.2.2 y 60 de 11.2.1 por remisión), 70 encabezados y 6 autorresueltos. Coincide con §0 del diseño.
- 2027-01-03: **423** criterios. Salen 43 derogados o modificados y entra el texto nuevo de DO.23.6.

Verificación adicional fuera del repo: los dos SQL se aplicaron **dos veces seguidas** en PGlite (Postgres en WASM) sobre un esquema mínimo que imita §1.2 con los ajustes de abajo. No hubo errores, los conteos cuadraron y los 3.975 textos quedaron idénticos byte a byte a la fuente.

## Ajustes al esquema de §1.2 que necesita 0062 (F2)

Al generar, se encontró que el esquema de §1.2 no alcanza en estos puntos. 0062 debe incorporarlos o el seed falla:

1. **`hab_criterio_remisiones`**
   - `complejidad_destino text` pasa a ser `complejidades_destino text[]`. "Cumple con los criterios definidos para la baja y mediana complejidad" (11.3.4.1.PP.30, IN.16) remite a dos complejidades a la vez, y el unique `(criterio_id, servicio_destino_id, coalesce(estandar_destino,''))` impide dos filas.
   - Columna nueva `modalidades_destino text[] null`: null = las del origen. Hay 25 remisiones del tipo "cumple con lo establecido en la **modalidad intramural**" desde bloques de telemedicina o extramurales. Sin esta columna, una sede que solo tiene telemedicina no recibiría los criterios intramurales que la norma le exige.
   - Valor nuevo en el check de `tipo`: `a_otra_modalidad` (mismo servicio, otra modalidad).
   - Semántica de `criterios_destino`: es un puntero directo. Los códigos listados entran con sus hijos y sin filtro de bloque. Se usa en 11.1.PP.32 → 11.1.PP.31 (el rol remisor no entra si la sede solo es de referencia), 11.3.2.TH.2 → TH.1 y 11.3.3.DO.12 → DO.11.
2. **`pagina_inicio` (hab_servicios_norma) y `pagina` (hab_criterios) deben admitir null.** El texto de 11.3.7 según la Res. 1410/2022 (1 servicio y 16 criterios) no está en el PDF de 2019: viene de la compilación de Supersalud y no tiene página. Poner la página de 2019 sería una cita falsa. La validación 3 solo permite null en 11.3.7.
3. **Listas cerradas de condiciones**
   - Documentos: se agregan `tep_solo_persona_juridica` y `tep_solo_persona_natural`. La norma exige 8 documentos al transporte especial solo según su tipo de persona (9.1.3.4), y el AND de códigos positivos no lo expresa sin esto.
   - Obligaciones: se agregan `privada_o_mixta` (FT001/3/4/6/9/25 excluyen IPS públicas) e `internacion_o_urgencias` (reporte diario de capacidad instalada).
4. **`hab_novedades_catalogo.categoria`**: la fuente dice `capacidad_instalada` y se mapea al valor `capacidad` del diseño.
5. **`hab_criterios.fuente_texto`**: la fuente dice `ocr_pdf_2019` y se mapea a `pdf_ocr`. El valor `imagen` no se usa: los 51 textos "transcritos desde imagen" tienen el texto de la compilación.
6. **`hab_obligaciones_catalogo.dias_aviso_default`** es `int[]`.
7. **Jerarquía.** §1.2 pide que padre e hijo estén en el mismo bloque, pero la fuente tiene **20 hijos** en un bloque más específico que el de su padre (11.1.HC.14 → 14.1…14.13, 11.2.3.IN.4, 11.3.10.TH.1). La validación 2 acepta el caso solo si el bloque del padre contiene al del hijo en todas las dimensiones, porque así el padre entra siempre que entra el hijo. Un caso no cumplía la regla y se corrigió en la curaduría: la norma numera "9.3" a la remisión a 11.1 del bloque de referencia de 11.3.6 DO, y se siembra como raíz (nivel 0) sin cambiar su código.
8. **Sugerencia**: `unique (servicio_norma_id, estandar_codigo, orden)` en `hab_bloques`. El `orden` del bloque es su posición dentro del servicio y forma parte del id.
9. **Festivos**: se siembran con id determinista y `pais_id = (select id from paises where codigo = 'CO')`. Si `festivos.id` tiene default, no estorba.

El diseño dice 577 encabezados y el modelo tiene 593. Son los criterios con al menos un hijo, contando el padre por servicio, estándar y número. En 11.1 la numeración se reinicia por estándar, así que contar sin el estándar da menos. Los hijos sí coinciden: 2.803 en la fuente, 2.802 en el modelo, porque 11.3.6.DO.9.3 pasó a raíz.

## Recomendaciones para el motor SQL (F3)

`lib/motor.mjs` es la referencia y el oráculo de pruebas, no código de producción. Al implementarlo se precisaron cuatro puntos de §1.6:

- **El rol de telemedicina filtra aunque el bloque no restrinja la categoría.** Hay 429 bloques del tipo "Modalidad telemedicina - prestador de referencia" con categoría null y rol no null. Con el texto literal de §1.6, una sede solo remisora vería los bloques de referencia.
- La parte **no** telemedicina de un bloque coincide sola, sin mirar el rol. Por ejemplo, "Modalidades intramural, telemedicina – prestador remisor" aplica a una sede solo intramural.
- Para remitir se usa el contexto del criterio origen: su complejidad (o la única del destino) y sus modalidades, salvo que la remisión traiga `complejidades_destino` o `modalidades_destino`. La recursión llega a profundidad 3. Por ejemplo, 11.2.2.IN.10 → 11.2.1.IN.16 → 11.2.1 intramural.
- Un criterio puede ser encabezado y autorresuelto a la vez: 11.1 + "adicionalmente cuenta con:" + hijos. En ese caso su estado es el AND de ambos (F5).

## Decisiones de curaduría tomadas en F0 (para revisión de director-proyecto / investigador-regulatorio)

- **Autorresueltos: 481, no 547.** Hay 557 textos que mencionan "todos los servicios". Criterio conservador: solo se autorresuelve el criterio cuyo **único** requisito es la remisión a 11.1, con su frase de enlace. Hay 76 que traen además un requisito propio en el mismo texto ("… y adicionalmente cuenta con oxígeno medicinal") u otra remisión. Autorresolverlos le ocultaría ese requisito a la clínica, así que quedan evaluables. 11.1.IN.18 no es remisión. Se agregó 11.1.MD.17 ("cumple con los criterios que le apliquen del presente estándar").
- **Remisiones: 68, no 41.** 47 son a otro servicio u otra complejidad (el director contó 41). Las otras 21 son a otra modalidad del mismo servicio o a la versión 2019. Las que el regex detecta pero se descartan están en `no-remision.json` con su motivo: el destino ya está en el mismo bloque o siempre incluido.
- **11.1.IN.50.1** ("los ambientes cumplen con los criterios del servicio de salud de la modalidad intramural", unidad móvil) remite a la infraestructura intramural de **cada** servicio que se preste en unidad móvil. El modelo no puede expresarlo como una sola remisión, así que queda evaluable a mano.
- **Elección de numeral (D2).**
  - Obstetricia → {11.4.1, 11.6.4}.
  - SPA → {11.4.12, 11.4.10, 11.4.11}. 11.4.11 se agregó por la nota del mapeo fuente ("si es parcial") y queda inferida.
  - Unidad de quemados → {11.4.9, 11.4.7, 11.4.1}. 11.4.1 (quemado no crítico) queda inferida.
  - **Trasplantes** → {11.5.1, 11.4.1}. No estaba en la lista D2, pero tiene dos numerales y la regla de §1.2 obliga a elegir.
  - 11.3.4 (contenedor) sale del mapeo de imágenes.
- **Vigencias.** 44 derogados y DO.23.6 modificado, 45 filas con `vigente_hasta = 2027-01-03`. La validación 6 de §2.3 dice "exactamente 44"; se interpretó como 44 derogados + 1 modificado. El texto nuevo de DO.23.6 se copió del art. 13 de la Res. 914/2025.
- **Quimioterapia (D3).** El texto 2022 se siembra como vigente. 11.3.7-2019 se siembra con `solo_por_remision` y `seleccionable = false`. Los criterios 8, 9 y 10 de 2022 (MD.8, PP.9, HC.10) remiten a la modalidad intramural de 2019 en el mismo estándar. Sigue pendiente la confirmación del asesor.
- **Obligaciones.**
  - Fechas literales (D5).
  - RIPS: `requiere_confirmacion_asesor` (D6).
  - ST002 y SIVIGILA: `por_confirmar`.
  - SIVIGILA es semanal, pero ese valor no está en el vocabulario y se siembra `manual`.
  - FT006 C1 trimestral: el corte de diciembre vence el 20-ene, literal, porque la circular no le da regla de cierre como al FT009.
  - TEP se incluye en FT001/3/4/25, FP y Res. 256 porque la regla literal lo nombra.
  - Para la prueba cruzada de fechas se usó el grupo D2. FT006/FT009 usan C2 y FT018 usa D1, porque esas no aplican a D2.
  - Las 5 propias son: telemedicina mensual (día 5), capacidad instalada diaria (informativa), verificación anual del grupo (sin fecha: la norma no la fija), subsanación de visita (8 días hábiles) y cierre temporal.
- **Fuera de F0**, según el diseño: `tipos_documento_normativo` de habilitación (F6, lista contra 11.1 PP, sin inventar nombres) y `hab_criterio_fuentes_sugeridas` (F6).

## Riesgos abiertos

- **Festivos (R11).** Calculados por Ley 51/1983 + Pascua y revisados contra los calendarios 2026–2027 conocidos. Falta cotejarlos con una fuente oficial en línea antes de F8.
- **Tamaño de 0063 (R13).** Pesa ~2,0 MB, por encima de la estimación de 1,0–1,3 MB por los uuid y las notas. Si `supabase db push` lo rechaza, se parte por grupo de servicios sin cambiar el generador.
- **Revisión humana pendiente** de toda la carpeta `curaduria/` en el PR.
