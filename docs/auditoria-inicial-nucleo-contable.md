# Bloque 0 — Inventario técnico inicial del núcleo contable

**Repositorio:** `fenixlife1978/Sicoven`  
**Rama base inspeccionada:** `main`  
**Commit base:** `701b0244b3c8989510aec6169d75dd2433d9fa00`  
**Versión:** `1.0.7`  
**Fecha de inspección:** 2026-10-31

## Alcance y método

Inspección estática de los archivos principales del núcleo contable, interfaces y persistencia SQLite. No se modificó código de ejecución ni datos. No se ejecutó la suite completa: se reutiliza como antecedente la línea base histórica de 320 pruebas aprobadas en el commit indicado. Este documento no afirma que los módulos estén certificados ni sustituye pruebas funcionales sobre una base controlada.

## Inventario comprobado

| Área | Evidencia en código | Estado inicial |
|---|---|---|
| Navegación contable | `src/App.tsx` conecta Diario, Mayor, Balances y Catálogo | Presente |
| Libro Diario | `src/components/LibroDiario/LibroDiarioView.tsx`, `NewEntryModal.tsx` | Presente; validar ciclo integral |
| Libro Mayor | `src/components/LibroMayor/LibroMayorView.tsx` calcula movimientos y saldos por cuenta | Presente; validar cortes, apertura y conciliación |
| Balances | `src/components/Balances/BalancesView.tsx` contiene balance de comprobación, ajustado y balance general/resultados; enlaza históricos y reportes anuales | Presente; estados financieros incompletos/no demostrados |
| Plan de cuentas | `src/data/defaultChartOfAccounts.ts`, `src/types/accounting.ts`, `src/components/Catalogo/CatalogoView.tsx` | Jerarquía base presente; gestión estructural requiere fortalecimiento |
| Asientos | `src/context/AccountingContext.tsx` | Validación de fecha, período bloqueado, partida doble y líneas; revisar consistencia de reglas multimoneda |
| Cierre | `Company.closedThroughDate`, `closeAccountingPeriod`, `electron/accounting-integrity.cjs` | Bloqueo por fecha y protección de persistencia presentes; no equivale a cierre contable anual completo |
| Persistencia | `electron/accounting-persistence.cjs`, `electron/accounting-integrity.cjs` | Snapshot transaccional SQLite y controles de inmutabilidad/auditoría presentes |
| Multimoneda | `JournalEntryItem` almacena débitos/créditos Bs y USD; asientos conservan tasa BCV | Presente; falta validar moneda funcional, conversión y presentación normativa |
| Costos inventario | `src/types/inventoryAccounting.ts` | Tipos y funciones para promedio ponderado/PEPS; no forma parte del primer bloque |
| Libros/retenciones fiscales | `src/utils/seniatGenerators.ts`, vistas y pruebas dedicadas | Generadores presentes; validar formatos contra especificación SENIAT vigente |

## Hallazgos técnicos concretos que deben entrar al Bloque 1

### 1. Alta de cuentas no garantiza la integridad jerárquica

En `src/components/Catalogo/CatalogoView.tsx`, `handleCreateAccount` calcula `level` contando segmentos del código, pero no resuelve ni asigna `parentCode`. En `src/context/AccountingContext.tsx`, `addAccount` reemplaza una cuenta si ya existe el mismo código o la agrega y ordena; no valida por sí misma padre, nivel, tipo de cuenta, condición agrupadora/imputable ni uso histórico.

**Trabajo requerido:** centralizar validaciones de catálogo en lógica de dominio/persistencia, derivar o exigir padre, comprobar coherencia de niveles y tipos, impedir que cuentas agrupadoras reciban movimientos y evitar cambios destructivos de cuentas utilizadas. Incorporar pruebas unitarias y de persistencia.

### 2. Registro de asientos

`addJournalEntry` valida fecha, período cerrado, mínimo de líneas, valores no negativos, que una misma línea no debite y acredite simultáneamente la misma moneda y equilibrio Bs/USD con tolerancia de un céntimo. También exige importes positivos en ambas monedas.

En el fragmento inspeccionado, la validación de líneas no comprueba directamente que cada código exista en el catálogo ni que corresponda a una cuenta de movimiento. La persistencia SQLite tiene validaciones adicionales para integridad de documentos y asientos históricos; se debe completar el rastreo antes de diseñar un cambio para no duplicar controles.

**Trabajo requerido:** comprobar la validación efectiva de cuenta existente/imputable y definir explícitamente reglas de asiento en moneda funcional y moneda extranjera. No cambiar el requisito dual de Bs/USD sin pruebas de negocio y compatibilidad con asientos históricos.

### 3. Cierre contable actual

`closeAccountingPeriod` valida fecha, impide fechas futuras y retrocesos, verifica que los asientos del período cuadren en Bs/USD y que compras/ventas anteriores al corte tengan asiento vinculado. Actualiza `closedThroughDate`. SQLite impide borrar o retroceder el cierre y registra eventos de auditoría.

Esto constituye un bloqueo por fecha, no demuestra por sí solo un cierre formal mensual/anual con ajustes, transferencia de resultados, apertura del siguiente ejercicio, estados financieros de cierre, ni reapertura formal controlada.

**Trabajo requerido:** separar claramente bloqueo operativo de cierre contable formal; diseñar flujo de cierre, revisión, asientos de cierre/apertura y reapertura autorizada sin borrar historia.

### 4. Estados y reportes

`BalancesView` calcula débitos/créditos y saldos por cuenta y presenta sumas/saldos, hoja ajustada y balance general/resultados; también enlaza vistas históricas y reportes anuales. Los cálculos observados agregan asientos y ajustes por cuenta. No se encontró en el alcance inspeccionado evidencia suficiente de Estado de Flujos de Efectivo, Estado de Cambios en el Patrimonio ni notas/revelaciones VEN-NIF completas.

**Trabajo requerido:** no duplicar el balance existente; validar sus reglas, filtros por empresa/período, cifras de cuentas agrupadoras, resultado y comparativos. Los estados que no estén implementados integralmente se abordarán en el Bloque 2.

## Decisiones de arquitectura para el Bloque 1

1. Mantener SQLite como persistencia operativa de escritorio.
2. No alterar la estrategia de snapshot transaccional ni controles append-only sin pruebas de migración y recuperación.
3. Añadir reglas de dominio reutilizables y probarlas antes de conectarlas a las vistas.
4. Conservar IDs, códigos y enlaces de asientos históricos; cambios de catálogo deben ser aditivos y auditables.
5. Definir las reglas de precisión y redondeo por moneda antes de introducir cálculos nuevos.
6. Cada asiento debe ser rastreable a su origen, empresa, fecha, período y documentos relacionados.
7. El flujo de administrador semilla queda fuera del alcance.

## Pendientes de validación antes de declarar terminado el Bloque 1

- Validación estructural completa del plan de cuentas (incluyendo padre, nivel, códigos, tipo y cuentas imputables).
- Diario: secuencia por empresa, período, trazabilidad, filtros y exportación.
- Mayor: saldos iniciales, movimientos, saldo final, períodos y naturaleza de cuenta.
- Balance de comprobación: sumas, saldos y conciliación contra el mayor.
- Multimoneda: moneda funcional, importes originales, tasa histórica, tolerancias y conversión.
- Períodos: bloqueo, cierre formal, apertura, reapertura autorizada y controles de concurrencia.
- Persistencia: commit/rollback, reinicio, restauración y actualización preservando datos.
- Integración: compras, ventas, tesorería, inventario, retenciones y asientos automáticos sin duplicados.
- Pruebas focalizadas nuevas más regresión selectiva de los módulos afectados.

## Pruebas y límites

- No se ejecutó build ni suite en esta fase de documentación.
- No se repitieron las 320 pruebas históricas aprobadas.
- No se modificó ningún archivo de ejecución.
- No se modificó ni auditó el flujo del administrador semilla.
- No se publicó instalador ni release.

## Referencias de código inspeccionadas

- `src/App.tsx`
- `src/components/LibroDiario/LibroDiarioView.tsx`
- `src/components/LibroDiario/NewEntryModal.tsx`
- `src/components/LibroMayor/LibroMayorView.tsx`
- `src/components/Balances/BalancesView.tsx`
- `src/components/Catalogo/CatalogoView.tsx`
- `src/context/AccountingContext.tsx`
- `src/types/accounting.ts`
- `src/data/defaultChartOfAccounts.ts`
- `electron/accounting-persistence.cjs`
- `electron/accounting-integrity.cjs`
- `src/types/inventoryAccounting.ts`
- `src/utils/seniatGenerators.ts`
