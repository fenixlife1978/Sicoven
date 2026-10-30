# Tesorería y liquidación de CxC/CxP

SICOVEN es un sistema contable de escritorio para contadores públicos que administran la contabilidad de múltiples empresas. No es un punto de venta y no se integra con cajas registradoras ni sistemas POS.

## Regla de contabilización

- Los cobros y pagos en efectivo se registran contra la cuenta contable de efectivo que corresponda.
- Las transferencias bancarias deben identificar un auxiliar bancario perteneciente a la empresa activa.
- La moneda del medio de pago debe coincidir con la moneda del auxiliar seleccionado.
- Toda transferencia requiere referencia o comprobante.
- El asiento se registra directamente contra el código contable del auxiliar bancario seleccionado; no se usa una cuenta bancaria genérica.
- La liquidación conserva el identificador del auxiliar bancario y el vínculo con el asiento del Libro Diario.
- La conciliación posterior coteja el movimiento del estado de cuenta contra ese asiento, por cuenta, importe y naturaleza débito/crédito.

## Diferencias cambiarias

El principal de la factura se conserva en su moneda de origen. La porción liquidada cancela CxC o CxP al valor contable de la tasa de la factura. La diferencia entre ese valor y el importe efectivamente recibido o pagado a la tasa de liquidación se reconoce en la cuenta de ganancia o pérdida cambiaria correspondiente.

## Controles

- Solo se pueden liquidar facturas de crédito vigentes de la empresa activa.
- Se rechazan auxiliares bancarios de otra empresa o con moneda incompatible.
- Las transferencias requieren referencia y se bloquea su reutilización en el mismo auxiliar bancario dentro de la empresa.
- Los asientos ambiguos no se concilian automáticamente.
- Una conciliación manual exige seleccionar un asiento real que coincida con el auxiliar, importe y naturaleza del movimiento.
- Los asientos del Libro Diario son inmutables; las correcciones se hacen mediante reversión o ajuste documentado.

## Alcance

La conciliación bancaria es una función contable de SICOVEN. No representa integración con POS, arqueos de caja registradora, cierres Z ni control operativo de cajeros.
