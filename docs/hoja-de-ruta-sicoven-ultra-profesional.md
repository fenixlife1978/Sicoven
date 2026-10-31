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
| 6.1. Integración de apertura contable confirmada en SQLite | [#21](https://github.com/fenixlife1978/Sicoven/pull/21) | `c81f5fb5daae9870269eb4acaa4bc96f11c5d4fa` | Fusionado; persistencia transaccional SQLite y confirmación explícita |
| 6.2. Reapertura formal y auditable de períodos | [#22](https://github.com/fenixlife1978/Sicoven/pull/22) | `f016d10acbdc501be5d554ff9815de23858b1338` | CI escritorio/Windows y upgrade 1.0.6→1.0.7 con SQLite conservada satisfactorios |
| 6.3. Cierre y apertura de ejercicios integrados | [#23](https://github.com/fenixlife1978/Sicoven/pull/23) | `1232800fc543a3672fe4dd92367af1dff6edd4fe` | CI escritorio/Windows y upgrade con conservación SQLite satisfactorios |
| 6.4. Integridad del Balance General en doble moneda y aislamiento multiempresa | [#24](https://github.com/fenixlife1978/Sicoven/pull/24) | `275ab32b16f3b7e402dace923a0769cff5aceeac` | CI escritorio/Windows satisfactorios; validaciones Bs/USD y aislamiento |
| 6.5. Estados financieros PDF en doble moneda | [#25](https://github.com/fenixlife1978/Sicoven/pull/25) | `82ef632c31bbacf80611dbfbd75e6515d64bd257` | CI pre-merge y post-merge escritorio/Windows SUCCESS; upgrade 1.0.6→1.0.7 conservó SQLite y artefacto Windows cargado |
| 2.1. Corrección del corte acumulado de balances históricos | [#27](https://github.com/fenixlife1978/Sicoven/pull/27) | `9d8147e52b3e9be7c470c281537ddaf8e59c8692` | CI escritorio `41235602359` y Windows `41235602352` SUCCESS; upgrade 1.0.6→1.0.7 conservó SQLite y artefacto Windows cargado |
| 2.2. Corrección de aperturas anuales y saldos históricos | [#29](https://github.com/fenixlife1978/Sicoven/pull/29) | `48e48bd6d4a1958125a8663759c8c244e361623d` | CI escritorio `41237562263` y Windows `41237562281` SUCCESS sobre SHA `8f8cfd3491e255eec19447665e4eb0421beed4ee`; NSIS y upgrade 1.0.6→1.0.7 conservaron SQLite |

El PR #20 se fusionó mediante *squash* solo después de comprobar que ambos trabajos CI terminaron en `success`, que el SHA de la rama coincidía con `c6d515af1608cbe7d3efa0c8d8ff792d018d7c98` y que GitHub reportaba el PR abierto y fusionable. No se publicó instalador ni release.

### Secuencia contable 6.1–6.5 — completada e integrada

Los cinco subbloques están fusionados en `main`:

- **6.1 — PR #21:** integración de apertura contable confirmada en SQLite. La apertura requiere confirmación explícita y persiste mediante el flujo transaccional existente.
- **6.2 — PR #22:** reapertura formal y auditable de períodos, con registro append-only y conservación del cierre original e históricos.
- **6.3 — PR #23:** cierre y apertura de ejercicios integrados, con controles de fechas, duplicidad, empresa y trazabilidad.
- **6.4 — PR #24:** Balance General validado en Bs. y USD y filtrado por empresa antes del cálculo; pruebas de descuadres, aislamiento y valores no finitos.
- **6.5 — PR #25:** exportación PDF horizontal de estados financieros con columnas nativas separadas en Bs. y USD, sin convertir una moneda en la otra.

**Estado:** los PR #21 a #25 están cerrados y fusionados. Los CI posteriores a PR #25 de escritorio y Windows terminaron SUCCESS. El run Windows `41234017655` completó compilación NSIS, verificación del instalador, upgrade 1.0.6→1.0.7 con conservación de SQLite y carga del artefacto. El artefacto permanece sin publicar como release. No publicar instalador ni release.

### Bloque 2.1 — Comparativos históricos y corte acumulado — integrado

- **PR #27:** corrige la selección temporal de movimientos en los balances históricos.
- El Estado de Situación utiliza los movimientos acumulados de la empresa hasta el cierre del ejercicio seleccionado, incluidos los asientos de cierre.
- El Estado de Resultados conserva la actividad del ejercicio seleccionado y excluye los asientos de cierre.
- El resultado acumulado/del ejercicio se incorpora al patrimonio presentado en ambas monedas.
- Se añadieron pruebas para corte acumulado, selección anual, cierres, fechas futuras y aislamiento por empresa.
- CI escritorio `41235602359` y Windows `41235602352`: SUCCESS sobre el SHA `cdfc432b0f4330a1ca303e82e6a348d3ab655e32`. Windows completó la compilación NSIS, upgrade real 1.0.6→1.0.7, conservación de SQLite y carga del artefacto.
- Commit de integración en `main`: `9d8147e52b3e9be7c470c281537ddaf8e59c8692`.

**Límite:** este subbloque corrige la lógica de los comparativos históricos existentes; no completa por sí solo el Estado de Flujos de Efectivo ni el Estado de Cambios en el Patrimonio. El Bloque 2 permanece abierto hasta implementar y validar los cuatro estados financieros y sus notas/revelaciones conforme al marco aplicable.

### Bloque 2.2 — Apertura anual y saldos históricos — integrado

- **PR #29:** corrige la duplicación de saldos cuando el asiento de apertura anual ya transporta los saldos de balance del ejercicio anterior.
- El selector de situación identifica aperturas anuales mediante `exerciseLink.nextPeriodStartDate`; una apertura bancaria ordinaria no reinicia el acumulado.
- El Estado de Resultados utiliza únicamente los movimientos del ejercicio y excluye los asientos de cierre y apertura.
- El resultado pendiente de cierre se presenta con el signo contable correcto en ambas monedas: crédito menos débito para ingresos, costos y gastos; los débitos de costos/gastos reducen el resultado y el patrimonio.
- Se añadieron pruebas para corte anual, apertura 2025/2026, apertura bancaria dentro del año, selección de resultados y contribución del resultado al patrimonio.
- CI escritorio `41237562263` y Windows `41237562281`: SUCCESS sobre SHA `8f8cfd3491e255eec19447665e4eb0421beed4ee`. Windows completó NSIS, upgrade real 1.0.6→1.0.7 y verificación de conservación de SQLite.
- Commit de integración en `main`: `48e48bd6d4a1958125a8663759c8c244e361623d`.

**Estado del Bloque 2:** el Estado de Situación Financiera, el Estado de Resultados y los comparativos históricos tienen avances integrados. El Estado de Cambios en el Patrimonio está en desarrollo en el PR #32; el Estado de Flujos de Efectivo y las notas/revelaciones continúan pendientes. No declarar terminado el bloque hasta cerrar todos esos componentes y sus conciliaciones.

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
