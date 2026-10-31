import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePurchaseSettlementMode, validatePurchasePaymentDate } from './purchaseSettlement';

test('permite contado con cuenta de caja de movimiento y soporte documentado', () => {
  const accounts = [{ code: '1.1.1.01', name: 'Caja Principal', type: 'ACTIVO', isMovement: true }];
  assert.equal(validatePurchaseSettlementMode('CONTADO', '1.1.1.01', accounts, 'EG-0001'), null);
});
test('bloquea contado si falta cuenta válida o soporte del desembolso', () => {
  const accounts = [
    { code: '2.1.1.01', name: 'Proveedores', type: 'PASIVO', isMovement: true },
    { code: '1.1.4.01', name: 'Inventario', type: 'ACTIVO', isMovement: true }
  ];
  assert.match(validatePurchaseSettlementMode('CONTADO', '2.1.1.01', accounts, 'EG-0001') || '', /Caja o Banco/);
  assert.match(validatePurchaseSettlementMode('CONTADO', '1.1.4.01', accounts, 'EG-0001') || '', /Caja o Banco/);
  assert.match(validatePurchaseSettlementMode('CONTADO', '1.1.1.01', [{ code: '1.1.1.01', name: 'Caja', type: 'ACTIVO', isMovement: true }], '') || '', /comprobante/);
});

test('permite crédito para su circuito de CxP', () => {
  assert.equal(validatePurchaseSettlementMode('CREDITO'), null);
});

test('mantiene compatibilidad con registros históricos sin condición explícita', () => {
  assert.equal(validatePurchaseSettlementMode(undefined), null);
});

test('bloquea un pago anterior al abono en cuenta sin afirmar que ya existe el flujo de anticipos', () => {
  assert.match(validatePurchasePaymentDate('2026-10-09', '2026-10-10') || '', /Registra el desembolso como anticipo directo/);
});

test('allows supplier payable settlements on or after account-credit recognition', () => {
  assert.equal(validatePurchasePaymentDate('2026-10-10', '2026-10-10'), null);
  assert.equal(validatePurchasePaymentDate('2026-10-11', '2026-10-10'), null);
});

test('rejects malformed dates for supplier payable settlement chronology', () => {
  assert.match(validatePurchasePaymentDate('2026-02-30', '2026-02-28') || '', /fecha.*no es válida/);
});
