# Capability map: Analítica y experiencia de clínica

Mapa aprobado por el usuario. Las fronteras reflejan capacidades que se pueden
construir y verificar por separado.

| Module id | Responsabilidad | Depende de |
|---|---|---|
| `perfil-clinica` | Editar nombre legal, nombre comercial y código de actividad económica desde Datos básicos; migrar el código fuera del perfil SG-SST preservando los datos. | — |
| `analitica-clinica` | Nueva sección de Reportes con filtros, producción, tratamientos, ventas registradas por residencia en mapa geográfico, pivotes y tendencias. | — |
| `pgirasa-pesos` | Consolidado mensual por tipo y sede, confirmación explícita de meses sin residuos peligrosos y media móvil/clasificación PGIRASA de seis meses por sede. | — |
| `reportes-regulatorios` | Reporte INVIMA exportable y comisiones de nómina agrupadas por empleado y periodo, integrados en Reportes. | `analitica-clinica` |
| `navegacion-motion` | Reagrupar el menú de escritorio y móvil y añadir transiciones accesibles entre módulos y páginas. | `analitica-clinica` |

Build order: `perfil-clinica` and `pgirasa-pesos` can be developed independently;
`analitica-clinica` establishes the Reports destination; then
`reportes-regulatorios` and `navegacion-motion` integrate with that destination.

The environmental metric is per site, not a clinic-wide sum. This was confirmed
because the product already records waste by site and the PGIRASA classification
is for the generating establishment. A month with no hazardous-waste records is
unknown until an authorized user explicitly confirms 0 kg.
