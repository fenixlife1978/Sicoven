import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePurchaseSettlementMode, validatePurchasePaymentDate } from './purchaseSettlement';

test('bloquea contado hasta completar el asiento contra una cuenta contable documentada', () => {
  const error = validatePurchaseSettlementMode('CONTADO') || '';
  assert.match(error, /cuenta contable de efectivo o banco/);
  assert.match(error, /No se registró la compra/);
  assert.doesNotMatch(error, /caja registradora|POS|terminal/i);
});

test('permite crédito para su circuito de CxP', () => {
  assert.equal(validatePurchaseSettlementMode('CREDITO'), null);
});

test('mantiene compatibilidad con registros históricos sin condición explícita', () => {
  assert.equal(validatePurchaseSettlementMode(undefined), null);
});

test('bloquea un pago anterior al abono en cuenta sin afirmar que ya existe el flujo de anticipos', () => {
  assert.match(validatePurchasePaymentDate('2026-10-09', '2026-10-10') || '', /anticipos directos a proveedores aún no está disponible/);
});

test('allows supplier payable settlements on or after account-credit recognition', () => {
  assert.equal(validatePurchasePaymentDate('2026-10-10', '2026-10-10'), null);
  assert.equal(validatePurchasePaymentDate('2026-10-11', '2026-10-10'), null);
});

test('rejects malformed dates for supplier payable settlement chronology', () => {
  assert.match(validatePurchasePaymentDate('2026-02-30', '2026-02-28') || '', /fecha.*no es válida/);
});
