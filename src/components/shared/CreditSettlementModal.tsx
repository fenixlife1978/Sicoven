import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import type { CreditSettlementKind, SettlementMethod } from '../../types/creditSettlement';

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
  const { currentCompany, getCreditBalance, addCreditSettlement } = useAccounting();
  const balance = getCreditBalance(documentId, kind);
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState(String(currentCompany.bcvRate || ''));
  const [usd, setUsd] = useState(balance.outstandingUsd.toFixed(2));
  const [method, setMethod] = useState<SettlementMethod>('BANK_TRANSFER_BS');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const bs = useMemo(() => Math.round((Number(usd) * Number(rate) + Number.EPSILON) * 100) / 100, [usd, rate]);
  const isSale = kind === 'SALE_COLLECTION';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      addCreditSettlement({
        documentId, kind, settlementDate: date, bcvRate: Number(rate),
        amountUsd: Number(usd), amountBs: bs, method,
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
      <label className="block text-xs font-semibold text-slate-700">Medio de {isSale ? 'cobro' : 'pago'}<select value={method} onChange={e=>setMethod(e.target.value as SettlementMethod)} className="mt-1 w-full rounded-lg border p-2 text-sm">
        <option value="BANK_TRANSFER_BS">Transferencia bancaria Bs.</option><option value="CASH_BS">Efectivo Bs.</option><option value="BANK_TRANSFER_USD">Transferencia USD</option><option value="CASH_USD">Efectivo USD</option><option value="OTHER">Otro</option>
      </select></label>
      <label className="block text-xs font-semibold text-slate-700">Referencia bancaria / comprobante (recomendado)<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-700">Notas<input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border p-2 text-sm" /></label>
      <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-3">La liquidación no modifica la factura ni genera automáticamente notas de débito/crédito o ajustes de IVA. Las diferencias cambiarias requieren revisión contable.</p>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving || balance.outstandingUsd <= 0} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Registrando…' : 'Registrar liquidación'}</button></div>
    </form>
  </div>;
};
