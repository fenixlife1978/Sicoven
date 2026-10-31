import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSeniatIslrOperationsXml, generateSeniatIslrOperationsTxt } from './seniatGenerators';
import type { Company, PurchaseRecord, IslrRetentionVoucher } from '../types/accounting';
import type { IslrFiscalEvent } from '../types/islrFiscalEvent';

const company = { id: 'c1', rif: 'J-12345678-9', name: 'Empresa', address: '', phone: '', email: '', taxpayerType: 'ORDINARIO', defaultIvaRetentionRate: 75, fiscalYear: 2026, bcvRate: 1 } as Company;
const purchase = (overrides: Partial<PurchaseRecord> = {}) => ({
  id: 'p1', companyId: 'c1', opNumber: 1, invoiceDate: '2026-10-05',
  supplierRif: 'J-98765432-1', supplierName: 'Proveedor', invoiceNumber: 'F-001',
  controlNumber: '00-123', documentType: '01', totalAmountBs: 1000,
  exemptAmountBs: 0, taxableBaseBs: 1000, taxRate: 16, vatAmountBs: 160,
  retentionRate: 0, vatWithheldBs: 0, bcvRate: 1, totalAmountUsd: 1000,
  taxableBaseUsd: 1000, vatAmountUsd: 160, vatWithheldUsd: 0,
  islrConceptCode: '002', islrConceptName: 'Honorarios', islrRate: 3,
  islrWithheldBs: 0, islrSubtrahendBs: 107.5, islrBeneficiaryType: 'PN',
  islrResidency: 'RESIDENT', islrBasePercentage: 100,
  ...overrides
} as PurchaseRecord);
const voucher = (overrides: Partial<IslrRetentionVoucher> = {}) => ({
  id: 'v1', companyId: 'c1', voucherNumber: 'ISLR-202610-000001',
  date: '2026-10-05', period: '202610', supplierRif: 'J-98765432-1',
  supplierName: 'Proveedor', supplierAddress: '', isPersonNatural: true, isResident: true,
  conceptCode: '002', conceptDescription: 'Honorarios', invoiceNumber: 'F-001',
  controlNumber: '00-123', invoiceDate: '2026-10-05', baseAmountBs: 1000,
  retentionRate: 3, subtrahendBs: 107.5, withheldAmountBs: 0,
  bcvRate: 1, baseAmountUsd: 1000, withheldAmountUsd: 0, ...overrides
} as IslrRetentionVoucher);

test('SENIAT XML includes a declared ISLR operation even when withholding is zero', () => {
  const xml = generateSeniatIslrOperationsXml(company, [purchase()], [], '202610');
  assert.match(xml, /<CodigoConcepto>002<\/CodigoConcepto>/);
  assert.match(xml, /<MontoOperacion>1000\.00<\/MontoOperacion>/);
  assert.match(xml, /<PorcentajeRetencion>3\.00<\/PorcentajeRetencion>/);
  assert.match(xml, /<RelacionRetencionesISLR RifAgente="J123456789" Periodo="202610">/);
});

test('SENIAT XML excludes cancelled purchase operations pending fiscal correction', () => {
  const xml = generateSeniatIslrOperationsXml(company, [purchase({ isCancelled: true })], [], '202610');
  assert.doesNotMatch(xml, /<DetalleRetencion>/);
});

test('SENIAT XML preserves legacy voucher-only records without duplicating linked purchases', () => {
  const xml = generateSeniatIslrOperationsXml(company, [purchase()], [voucher()], '202610');
  assert.equal((xml.match(/<DetalleRetencion>/g) || []).length, 1);
  const legacy = generateSeniatIslrOperationsXml(company, [], [voucher()], '202610');
  assert.equal((legacy.match(/<DetalleRetencion>/g) || []).length, 1);
});

test('SENIAT XML escapes invoice text and limits output to selected period', () => {
  const xml = generateSeniatIslrOperationsXml(company, [
    purchase({ invoiceNumber: 'F&<002>' }),
    purchase({ id: 'p2', invoiceDate: '2026-09-30', invoiceNumber: 'SEP' })
  ], [], '202610');
  assert.match(xml, /F&amp;&lt;002&gt;/);
  assert.doesNotMatch(xml, /SEP/);
});

test('ISLR TXT includes zero-withholding operations', () => {
  const txt = generateSeniatIslrOperationsTxt(company, [purchase()], [], '202610');
  assert.match(txt, /\t1000\.00\t3\.00\t107\.50\t0\.00$/);
});


test('SENIAT XML uses fiscal event date and allocation instead of invoice date', () => {
  const event: IslrFiscalEvent = {
    id: 'e1', companyId: 'c1', supplierRif: 'J-98765432-1', conceptCode: '002',
    fiscalDate: '2026-10-10', sequence: 1, kind: 'ACCOUNT_CREDIT',
    allocations: [{ purchaseId: 'p1', baseAmountBs: 800 }],
    basePercentage: 100, unitTaxValueBs: 43, withheldAmountBs: 0,
    journalEntryId: 'j1', createdAt: '2026-10-10T10:00:00.000Z'
  };
  const xml = generateSeniatIslrOperationsXml(company, [purchase()], [], '202610', [event]);
  assert.ok(xml.includes('<FechaOperacion>10/10/2026</FechaOperacion>'));
  assert.ok(xml.includes('<MontoOperacion>800.00</MontoOperacion>'));
});

test('SENIAT event-backed purchase is not duplicated by its legacy voucher', () => {
  const event: IslrFiscalEvent = {
    id: 'e1', companyId: 'c1', supplierRif: 'J-98765432-1', conceptCode: '002',
    fiscalDate: '2026-10-05', sequence: 1, kind: 'ACCOUNT_CREDIT',
    allocations: [{ purchaseId: 'p1', baseAmountBs: 1000 }],
    basePercentage: 100, unitTaxValueBs: 43, withheldAmountBs: 0,
    journalEntryId: 'j1', voucherId: 'v1', createdAt: '2026-10-05T10:00:00.000Z'
  };
  const xml = generateSeniatIslrOperationsXml(company, [purchase()], [voucher()], '202610', [event]);
  assert.equal((xml.match(/<DetalleRetencion>/g) || []).length, 1);
});

test('SENIAT XML keeps legacy purchase and voucher fallback when no fiscal event exists', () => {
  const xml = generateSeniatIslrOperationsXml(company, [purchase()], [voucher({
    id: 'v2', invoiceNumber: 'LEGACY-2', supplierRif: 'J-11111111-1'
  })], '202610', []);
  assert.equal((xml.match(/<DetalleRetencion>/g) || []).length, 2);
});
