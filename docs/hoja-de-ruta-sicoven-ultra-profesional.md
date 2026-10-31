# SICOVEN ULTRA PROFESIONAL — Hoja de ruta de evolución

## Gobierno del proyecto

- Repositorio único: `fenixlife1978/Sicoven`.
- Rama estable: `main`. Esta rama de hoja de ruta no sustituye a `main`.
- Versión de referencia del código: 1.0.7.
- Base de datos de escritorio: SQLite. La persistencia local debe conservar transacciones, integridad referencial, trazabilidad y recuperación.
- Cada bloque funcional se implementará en una rama/PR independiente, se probará y se fusionará a `main` solo cuando cumpla sus criterios de aceptación.
- No publicar instaladores/releases ni desplegar distribución pública sin autorización expresa.
- No introducir datos ficticios ni fuentes de datos pagadas sin autorización.
- Los parámetros fiscales y normativos deben tener fuente, vigencia y fecha de aplicación verificables; no fijar tasas/formatos como constantes inmutables cuando dependan de la normativa.
- Preservar datos históricos, asientos vinculados, reversión y bitácora. No borrar historia para corregir operaciones.
- El flujo de inicio del administrador semilla queda expresamente fuera del alcance y no debe modificarse.
- No reabrir los siete frentes funcionales ya aprobados salvo defecto concreto demostrado.

## Estado de ejecución verificado — 31/10/2026

### Bloques cerrados y fusionados en `main`

| Bloque | PR | Commit de integración en `main` | Validación |
|---|---:|---|---|
| 1. Jerarquía del plan de cuentas VEN-NIF | [#14](https://github.com/fenixlife1978/Sicoven/pull/14) | `7548ffd7c5065acf6ae235e9f31e2ab8bbb68ef0` | CI escritorio e instalador satisfactorios |
| 2. Integridad de cuentas imputables en Diario | [#16](https://github.com/fenixlife1978/Sicoven/pull/16) | `27f96be01fac69513b84eeec28d71b9c6f05a971` | CI escritorio e instalador; upgrade 1.0.6→1.0.7 conservó SQLite |
| 3. Balance y Mayor en doble moneda | [#17](https://github.com/fenixlife1978/Sicoven/pull/17) | `c58e14448eeb4f9eb2edcd366dbf9b8b6e9bcf0a` | CI escritorio e instalador; upgrade conservó SQLite |
| 4. Bloqueo de operaciones retroactivas | [#18](https://github.com/fenixlife1978/Sicoven/pull/18) | `da83c4cf557b0feb5376fdec8309e310b25554fb` | CI escritorio e instalador satisfactorios |
| 5. Interfaz y persistencia confirmada del cierre | [#19](https://github.com/fenixlife1978/Sicoven/pull/19) | `56e044774154fbd92e06486671835e0655fa8498` | CI escritorio e instalador satisfactorios |
| 6. Preparación validada del asiento de apertura | [#20](https://github.com/fenixlife1978/Sicoven/pull/20) | `0c0b511e7eacc39973762d28ff553a69981e8757` | Desktop run 41228459268 success; Windows installer run 41228459069 success |

El PR #20 se fusionó mediante *squash* solo después de comprobar que ambos trabajos CI terminaron en `success`, que el SHA de la rama coincidía con `c6d515af1608cbe7d3efa0c8d8ff792d018d7c98` y que GitHub reportaba el PR abierto y fusionable. No se publicó instalador ni release.

### Próximo subbloque en ejecución — 6.1: integración controlada de apertura

La función pura `buildOpeningEntryItems` ya prepara líneas de apertura en Bs/USD, pero deliberadamente no las persiste ni contabiliza. El trabajo siguiente integra el flujo completo sin automatismos:

- Presentar en Configuración un formulario de apertura por empresa y ejercicio, con fechas, selección expresa de cuenta patrimonial para resultados y vista previa de líneas/sumas en ambas monedas.
- Exigir confirmación explícita antes de registrar el asiento; nunca crear una apertura al cambiar de ejercicio o al iniciar la aplicación.
- Usar el mecanismo existente `addJournalEntry` y la persistencia transaccional SQLite; no escribir directamente desde la interfaz.
- Validar empresa activa, período cerrado, fecha de apertura posterior al cierre, cuentas imputables, partida doble, importes válidos y ausencia de apertura duplicada.
- Hacer idempotente la operación y evitar doble envío mientras SQLite confirma.
- Registrar evento de auditoría específico de apertura sin sustituir ni debilitar el evento existente de asiento contabilizado.
- Probar aislamiento multiempresa, Bs/USD, utilidad y pérdida, ejercicio previo, apertura duplicada, persistencia confirmada, fallo/rollback y auditoría.
- Revisar el modelo real de autenticación/permisos antes de imponer restricciones nuevas. La instalación actual declara el rol único `admin`; el administrador semilla y su flujo permanecen intocables.

**Estado:** rama `feature/bloque-6-1-integracion-apertura` creada desde `main` en `0c0b511e7eacc39973762d28ff553a69981e8757`. Sin cambios funcionales fusionados todavía.

### Reapertura formal — subbloque posterior 6.2

No se debe reducir ni borrar `closedThroughDate` como mecanismo de reapertura. Diseñar un historial persistente de cierres y reaperturas, motivo obligatorio, identidad del usuario autenticado, validación de autorización, evento append-only `accounting_period_reopened`, y transacción SQLite. Conservar el cierre original y los asientos históricos. No implementar hasta haber trazado los permisos reales y las guardias existentes.

## Capacidades preexistentes identificadas en la inspección inicial

La inspección inicial de `main` confirma que el producto ya contiene:

- Vistas de Libro Diario, Libro Mayor y Balances conectadas desde la navegación principal.
- Contexto contable central con catálogo de cuentas, asientos, reversión de asientos y operación de cierre mediante `closeAccountingPeriod`.
- Catálogo base jerárquico en `src/data/defaultChartOfAccounts.ts`, con códigos, niveles, cuentas padre y distinción entre cuentas de movimiento y agrupadoras.
- Tipos de datos contables y de documentos en `src/types/accounting.ts`.
- Funcionalidad de compras, ventas, inventario, conciliación bancaria, tesorería, CxC/CxP, retenciones IVA/ISLR y reversión fiscal.
- Métodos de costeo declarados para inventario: promedio ponderado y PEPS.
- Generadores de libros/formatos SENIAT y pruebas dedicadas existentes.

Estas evidencias prueban presencia de componentes y modelos, no por sí solas el cumplimiento normativo integral ni el circuito funcional completo. Cada módulo será validado en su lógica, persistencia, interfaz, reportes y escenarios reales antes de declararlo terminado.

## Bloques de evolución y secuencia

### Bloque 0 — Gobierno, inventario y línea base
- Mantener esta hoja de ruta y matriz de capacidades.
- Mapear componentes, tipos, funciones, IPC/SQLite, tablas, migraciones, reportes y pruebas existentes.
- Clasificar cada capacidad como completa, parcial, ausente o pendiente de validación funcional.
- Identificar dependencias y riesgos sin tocar los siete frentes cerrados ni autenticación semilla.

**Cierre:** inventario trazable a archivos y funciones, dependencias documentadas, riesgos priorizados y pruebas focalizadas definidas.

### Bloque 1 — Núcleo de Contabilidad General VEN-NIF
- Plan de cuentas jerárquico configurable por empresa, validación de códigos, padres, niveles y cuentas imputables.
- Libro Diario con comprobantes manuales y automáticos, plantillas, asientos recurrentes y ajustes.
- Libro Mayor por cuenta y período, saldo inicial, movimientos, saldo final y referencias al asiento fuente.
- Balance de comprobación con débitos/créditos, saldos y validación de cuadre.
- Ejercicios y períodos contables: apertura, cierre mensual/anual, bloqueo y reapertura autorizada con trazabilidad.
- Multimoneda con moneda funcional, moneda de transacción, tasa histórica, importes originales y equivalentes; reglas de precisión documentadas.
- Integración con compras, ventas, inventario, tesorería y retenciones sin duplicar asientos.
- Controles de permisos, auditoría, integridad transaccional y reversión.

**Cierre:** circuito completo de registro → diario → mayor → balance; cuadre reproducible por empresa/período; cierre y bloqueo efectivos; pruebas de persistencia y reversión.

### Bloque 2 — Estados financieros VEN-NIF
- Estado de Situación Financiera.
- Estado de Resultados Integral.
- Estado de Flujos de Efectivo por método directo e indirecto, cuando los datos permitan sustentar la clasificación.
- Estado de Cambios en el Patrimonio.
- Notas y revelaciones configurables según marco aplicable.
- Comparativos entre períodos, histórico y reexpresado cuando corresponda.
- Presentación en moneda funcional y vistas de conversión, sin confundir conversión con reexpresión.
- Exportación PDF/Excel y rastreo de cada cifra a cuentas y asientos.

**Cierre:** ecuación contable consistente, estados enlazados al mayor, comparativos reproducibles y exportaciones verificadas.

### Bloque 3 — Ajuste por inflación / REME
- Identificar marco aplicable: VEN-NIF para PYMES o VEN-NIF plenas, según entidad y período.
- Catálogo y fuente documentada de índices oficiales; conservar valor, publicación, fecha y período de aplicación.
- Clasificación monetaria/no monetaria y tratamiento de partidas patrimoniales.
- Cálculo reproducible de reexpresión, resultado monetario y movimientos relacionados.
- Papeles de trabajo, asientos propuestos/revisables, conciliaciones y revelaciones.
- Separar cifras históricas, ajustadas y comparativas.

**Cierre:** cálculos trazables a fuentes e índices vigentes, pruebas con casos contables de referencia y revisión profesional; no se declarará cumplimiento solo por aplicar un índice.

### Bloque 4 — Libros fiscales SENIAT
- Libros de compras y ventas con clasificación de operaciones, alícuotas, exentas, exoneradas y no sujetas.
- Retenciones de IVA, comprobantes, períodos, enteros y validaciones según condición del contribuyente y normativa vigente.
- Exportaciones TXT/formatos exigidos, con especificación versionada y pruebas de estructura.
- ISLR por concepto, unidad tributaria y reglas vigentes, residentes/no residentes cuando aplique.
- Conservación de comprobantes, anulaciones, notas, reversión y auditoría.
- Parámetros legales versionados por fecha efectiva y fuente oficial.

**Cierre:** conciliación entre libros, documentos, comprobantes y reportes exportados; archivos validados contra especificaciones vigentes.

### Bloque 5 — Bancos y tesorería
- Multicuentas y monedas.
- Importación de extractos TXT/CSV/Excel mediante plantillas configurables y vista previa.
- Detección de duplicados, validación de fechas/importes y conciliación manual/automática.
- Movimientos pendientes, diferencias y asientos desde movimientos aprobados.
- Flujo de efectivo histórico/proyectado y disponibilidad por cuenta/moneda.

**Cierre:** importación repetible sin duplicados, conciliación auditable y saldos bancarios explicables.

### Bloque 6 — Cuentas por cobrar y pagar
- Antigüedad por tramos, vencimientos y estados de cuenta.
- Saldos nominales y en divisas, exposición cambiaria y tasas históricas.
- Anticipos, notas de crédito/débito, cobros/pagos parciales, retenciones y aplicaciones.
- Alertas y reportes por tercero, documento, moneda y período.

**Cierre:** conciliación integral entre auxiliares y cuentas de control, sin alterar los circuitos de anticipos ya aprobados.

### Bloque 7 — Inventario, compras y costos
- Kardex, entradas/salidas, devoluciones, ajustes y trazabilidad documental.
- Promedio ponderado y PEPS configurables según política de la empresa.
- Costos históricos y multimoneda, gastos atribuibles y costo de ventas.
- Integración de compras, inventario y contabilidad.
- Control de inventario negativo configurable y auditoría.

**Cierre:** costo y existencia reconstruibles desde movimientos; integración contable cuadrada y pruebas de devoluciones/ajustes.

### Bloque 8 — Activos fijos
- Registro de activos, clases, adquisición, ubicación, responsable, valor residual y vida útil.
- Métodos de depreciación y calendario.
- Diferenciación contable/fiscal y ajuste por inflación cuando corresponda.
- Mejoras, transferencias, bajas y ventas.
- Asientos, auxiliares y reportes.

**Cierre:** roll-forward por activo, depreciación reproducible y asientos conciliados.

### Bloque 9 — Nómina y RR. HH. (LOTTT)
- Expediente, contrato, salario, asistencia y novedades.
- Nómina, deducciones, aportes y recibos.
- Prestaciones, garantía trimestral, intereses, vacaciones, bono vacacional, utilidades y liquidaciones.
- Parámetros legales versionados y soportados por fuente oficial.
- Integración contable y auditoría.

**Cierre:** cálculos verificables por período y trabajador, recibos y asientos conciliados.

### Bloque 10 — Facturación fiscal y documentos electrónicos
- Correlativos, números de control, series y formatos de impresión aplicables.
- Integración con equipos/proveedores compatibles cuando exista documentación técnica y legal.
- Manejo de contingencias, anulados y trazabilidad.
- No afirmar homologación o autorización fiscal sin evidencia documental.

**Cierre:** documentos consistentes con libros y contabilidad; compatibilidad/homologación acreditada cuando se anuncie.

### Bloque 11 — Multiempresa y despacho contable
- Aislamiento de datos y configuración por empresa.
- Ejercicios, monedas, parámetros y permisos individuales.
- Consolidación solo cuando proceda y con reglas documentadas.
- Panel de vencimientos, tareas y estado de clientes.
- Bitácora y reportes por empresa.

**Cierre:** pruebas cruzadas que demuestren que ninguna empresa puede leer o modificar datos de otra sin autorización.

### Bloque 12 — Reportes, análisis e IA asistiva
- Centro de reportes con filtros y exportaciones.
- Indicadores, comparativos y ratios sustentados por datos contables.
- Alertas de duplicados, saldos inusuales e inconsistencias.
- IA para explicar y orientar; no contabiliza, altera ni revierte operaciones sin autorización explícita.
- Toda recomendación debe mostrar datos de origen y límites.

**Cierre:** reportes reconciliados y acciones de IA limitadas por permisos, confirmación y trazabilidad.

### Bloque 13 — Seguridad, respaldos, restauración y experiencia
- Respaldos automáticos/manuales, integridad, retención y restauración validada.
- Migraciones versionadas, recuperación ante fallos y protección contra sobrescritura.
- Permisos, sesiones, auditoría y soportes.
- UX profesional, navegación, búsqueda, tablas, formularios, impresión, accesibilidad y adaptación de pantalla.
- Actualización del instalador preservando datos.

**Cierre:** restauración real probada, actualización preserva datos, regresión aprobada y documentación de operación.

## Política de PR y fusión

1. Un PR por bloque funcional o subbloque cohesivo.
2. Cada PR declara alcance, archivos tocados, riesgos, migraciones, pruebas ejecutadas y limitaciones.
3. No fusionar si hay fallos de pruebas, regresiones, cambios fuera de alcance o dudas sobre integridad de datos.
4. Los bloques se fusionan secuencialmente a `main`; el siguiente parte del `main` ya actualizado.
5. Reutilizar la línea base histórica aprobada; no repetir automáticamente la suite completa de 320 pruebas si no hay cambios que lo justifiquen. Ejecutar pruebas focalizadas y regresión selectiva.
6. La publicación de instalador/release es una decisión separada y requiere autorización expresa.

## Criterio global de finalización

SICOVEN se considerará listo para una actualización profesional integral cuando los circuitos contables, fiscales y auxiliares estén completos; los estados financieros cuadren y sean trazables; los cálculos normativos tengan fuentes y vigencias; la multimoneda y multiempresa estén aisladas y verificadas; las exportaciones funcionen; la restauración y actualización preserven datos; la UX sea consistente; no existan defectos bloqueantes; y la versión instalable haya sido probada. La publicación final se hará únicamente con autorización expresa.
