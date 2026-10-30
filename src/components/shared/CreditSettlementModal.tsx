import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import type { CreditSettlementKind, SettlementMethod } from '../../types/creditSettlement';
import { calculateFxFiscalAdjustment } from '../../types/fxFiscalAdjustment';

type Props = {
  documentId: string;
  documentNumber: string;
  partyName: string;
  kind: CreditSettlementKind;
  onClose: () => void;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export const CreditSettlementModal: React.FC<Props> = ({ documentId, documentNumber, partyName, kind, onClose }) => {
  const { currentCompany, getCreditBalance, addCreditSettlement, purchases, sales, bankAccounts } = useAccounting();
  const document = kind === 'SALE_COLLECTION' ? sales.find(item => item.id === documentId) : purchases.find(item => item.id === documentId);
  const balance = getCreditBalance(documentId, kind);
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState(String(currentCompany.bcvRate || ''));
  const [usd, setUsd] = useState(balance.outstandingUsd.toFixed(2));
  const [method, setMethod] = useState<SettlementMethod>('CASH_BS');
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const fiscalMode = document?.fiscalAdjustmentMode || 'REVISION_CONTADOR';
  const fxProposal = useMemo(() => {
    if (!document) return null;
    try {
      return calculateFxFiscalAdjustment({
        totalAmountUsd: Number(document.totalAmountUsd || 0),
        taxableBaseUsd: Number(document.taxableBaseUsd || 0),
        vatAmountUsd: Number(document.vatAmountUsd || 0),
        exemptAmountUsd: Math.max(0, Number(document.totalAmountUsd || 0) - Number(document.taxableBaseUsd || 0) - Number(document.vatAmountUsd || 0) - Number(document.igtfAmountUsd || 0)),
        invoiceRate: Number(document.bcvRate || 0), settlementRate: Number(rate || 0),
        settledAmountUsd: Number(usd || 0), mode: fiscalMode
      });
    } catch { return null; }
  }, [document, rate, usd, fiscalMode]);

  const [saving, setSaving] = useState(false);
  const bs = useMemo(() => Math.round((Number(usd) * Number(rate) + Number.EPSILON) * 100) / 100, [usd, rate]);
  const isSale = kind === 'SALE_COLLECTION';
  const isBankTransfer = method === 'BANK_TRANSFER_BS' || method === 'BANK_TRANSFER_USD';
  const bankCurrency = method === 'BANK_TRANSFER_USD' ? 'USD' : 'BS';
  const eligibleBankAccounts = bankAccounts.filter(account => account.companyId === currentCompany.id && account.currency === bankCurrency);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      addCreditSettlement({
        documentId, kind, settlementDate: date, bcvRate: Number(rate),
        amountUsd: Number(usd), amountBs: bs, method,
        bankAccountId: isBankTransfer ? bankAccountId : undefined,
        reference: reference.trim() || undefined, notes: notes.trim() || undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la liquidación.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label={isSale ? 'Registrar cobro' : 'Registrar pago'}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-4 max-h-[95vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">{isSale ? 'Cobrar factura a crédito' : 'Pagar factura a crédito'}</h2>
          <p className="text-sm text-slate-500">{documentNumber} · {partyName}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <div><span className="block text-xs text-slate-500">Saldo pendiente USD</span><strong>{balance.outstandingUsd.toFixed(2)}</strong></div>
        <div><span className="block text-xs text-slate-500">Saldo original en Bs.</span><strong>{balance.outstandingBsAtInvoiceRate.toFixed(2)}</strong></div>
      </div>
      <label className="block text-xs font-semibold text-slate-700">Fecha real de {isSale ? 'cobro' : 'pago'}<input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-slate-700">Tasa BCV de liquidación<input required type="number" min="0.000001" step="0.000001" value={rate} onChange={e=>setRate(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-700">Importe USD<input required type="number" min="0.01" max={balance.outstandingUsd} step="0.01" value={usd} onChange={e=>setUsd(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
      </div>
      <div className="rounded-lg border border-slate-200 p-3 text-sm"><span className="text-slate-500">Equivalente calculado en Bs. (USD × tasa)</span><strong className="block text-base">{bs.toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
      {fxProposal && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm space-y-1"><strong>Estimación de ajuste cambiario (no es una nota fiscal)</strong><div className="grid grid-cols-2 gap-2"><span>Diferencia base imponible</span><strong>{fxProposal.deltaBaseBs.toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})} Bs.</strong><span>Diferencia IVA estimada</span><strong>{fxProposal.deltaVatBs.toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})} Bs.</strong><span>Diferencia total estimada</span><strong>{fxProposal.deltaTotalBs.toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})} Bs.</strong></div><p>{fxProposal.direction === 'DEBIT_NOTE' ? 'Posible nota de débito por evaluar.' : fxProposal.direction === 'CREDIT_NOTE' ? 'Posible nota de crédito por evaluar.' : fxProposal.direction === 'REVIEW_REQUIRED' ? 'Revisión del contador requerida.' : 'No se estima diferencia material.'} {fxProposal.explanation}</p></div>}
      <label className="block text-xs font-semibold text-slate-700">Medio de {isSale ? 'cobro' : 'pago'}<select value={method} onChange={e=>{setMethod(e.target.value as SettlementMethod);setBankAccountId('');}} className="mt-1 w-full rounded-lg border p-2 text-sm">
        <option value="CASH_BS">Efectivo Bs.</option><option value="CASH_USD">Efectivo USD</option>
        <option value="BANK_TRANSFER_BS" disabled={!bankAccounts.some(account=>account.companyId===currentCompany.id&&account.currency==='BS')}>Transferencia bancaria Bs.</option>
        <option value="BANK_TRANSFER_USD" disabled={!bankAccounts.some(account=>account.companyId===currentCompany.id&&account.currency==='USD')}>Transferencia bancaria USD</option>
        <option value="OTHER" disabled>Otro (sin cuenta de tesorería identificada)</option>
      </select></label>
      {isBankTransfer && <label className="block text-xs font-semibold text-slate-700">Cuenta bancaria auxiliar ({bankCurrency}) *
        <select required value={bankAccountId} onChange={e=>setBankAccountId(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm">
          <option value="">Seleccione la cuenta bancaria de esta empresa</option>
          {eligibleBankAccounts.map(account=><option key={account.id} value={account.id}>{account.bankName} · {account.accountType==='AHORRO'?'Ahorro':'Corriente'} · {account.accountNumber.slice(-4)} · {account.accountCode}</option>)}
        </select>
      </label>}
      {isBankTransfer && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">El cobro o pago se contabilizará directamente en el auxiliar bancario seleccionado. Después podrá vincular el asiento con el movimiento del estado de cuenta en la conciliación bancaria.</p>}
      {!isBankTransfer && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">El movimiento se contabilizará en la cuenta contable de efectivo correspondiente. Para transferencias, seleccione una cuenta bancaria auxiliar de esta empresa.</p>}
      <label className="block text-xs font-semibold text-slate-700">Referencia / comprobante {isBankTransfer ? '*' : '(recomendado)'}<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={120} required={isBankTransfer} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-700">Notas<input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
      <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-3">El sistema conserva la tasa original de la factura y registra automáticamente la ganancia o pérdida cambiaria del cobro/pago en Bs. Esta liquidación no emite por sí sola notas de débito/crédito ni modifica el IVA; cualquier ajuste fiscal debe documentarse según el caso y validarse con el contador.</p>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving || balance.outstandingUsd <= 0 || (isBankTransfer && (!bankAccountId || !reference.trim()))} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Registrando…' : 'Registrar liquidación'}</button></div>
    </form>
  </div>;
};
