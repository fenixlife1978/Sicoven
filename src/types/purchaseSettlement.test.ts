import { describe, expect, it } from 'vitest';
import { validatePurchaseSettlementMode } from './purchaseSettlement';

describe('validatePurchaseSettlementMode', () => {
  it('bloquea contado mientras no exista conciliación con caja/banco', () => {
    expect(validatePurchaseSettlementMode('CONTADO')).toMatch(/cuenta de caja\/banco/);
  });

  it('permite crédito para su circuito de CxP', () => {
    expect(validatePurchaseSettlementMode('CREDITO')).toBeNull();
  });

  it('mantiene compatibilidad con registros históricos sin condición explícita', () => {
    expect(validatePurchaseSettlementMode(undefined)).toBeNull();
  });
});
