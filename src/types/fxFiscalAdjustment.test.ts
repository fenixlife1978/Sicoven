import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFxFiscalAdjustment } from './fxFiscalAdjustment';

test('calcula delta de base e IVA de factura $100 + IVA $16 de BCV 880 a 920',()=>{
 const r=calculateFxFiscalAdjustment({totalAmountUsd:116,taxableBaseUsd:100,vatAmountUsd:16,exemptAmountUsd:0,invoiceRate:880,settlementRate:920,settledAmountUsd:116,mode:'AJUSTE_BASE_IVA'});
 assert.equal(r.deltaBaseBs,4000); assert.equal(r.deltaVatBs,640); assert.equal(r.deltaTotalBs,4640); assert.equal(r.direction,'DEBIT_NOTE'); assert.equal(r.requiresFiscalDocument,true);
});
test('calcula diferencial proporcional para abono parcial',()=>{
 const r=calculateFxFiscalAdjustment({totalAmountUsd:116,taxableBaseUsd:100,vatAmountUsd:16,exemptAmountUsd:0,invoiceRate:880,settlementRate:920,settledAmountUsd:58,mode:'AJUSTE_BASE_IVA'});
 assert.equal(r.deltaBaseBs,2000); assert.equal(r.deltaVatBs,320); assert.equal(r.deltaTotalBs,2320);
});
test('propone nota de crédito cuando disminuye la tasa',()=>{
 const r=calculateFxFiscalAdjustment({totalAmountUsd:116,taxableBaseUsd:100,vatAmountUsd:16,exemptAmountUsd:0,invoiceRate:920,settlementRate:880,settledAmountUsd:116,mode:'AJUSTE_BASE_IVA'});
 assert.equal(r.deltaTotalBs,-4640); assert.equal(r.direction,'CREDIT_NOTE');
});
test('no decide por sí solo cuando requiere revisión del contador',()=>{
 const r=calculateFxFiscalAdjustment({totalAmountUsd:116,taxableBaseUsd:100,vatAmountUsd:16,exemptAmountUsd:0,invoiceRate:880,settlementRate:920,settledAmountUsd:116,mode:'REVISION_CONTADOR'});
 assert.equal(r.direction,'REVIEW_REQUIRED'); assert.equal(r.requiresFiscalDocument,false);
});
test('rechaza tasa inválida',()=>assert.throws(()=>calculateFxFiscalAdjustment({totalAmountUsd:116,taxableBaseUsd:100,vatAmountUsd:16,exemptAmountUsd:0,invoiceRate:0,settlementRate:920,settledAmountUsd:116,mode:'AJUSTE_BASE_IVA'})));
