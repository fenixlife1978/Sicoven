import React, { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';
import { allocateSupplierAdvanceCreditNotes } from '../../types/supplierAdvanceSettlement';

interface Props { onClose: () => void; }

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const SupplierAdvanceSettlementModal: React.FC<Props> = ({ onClose }) => {
  const {
    purchases, bankAccounts, currentCompany, getSupplierAdvanceBalance, supplierAdvanceSettlements,
    addSupplierAdvanceSettlement, isStorageReady, storageError
  } = useAccounting();
  const suppliers = useMemo(() => {
    const map = new Map<string, { rif: string; name: string }>();
    purchases.filter(p => p.documentType === '03' && !p.isCancelled && Number(p.supplierAdvanceUsd || 0) > 0)
      .forEach(p => map.set(String(p.supplierRif).trim().toUpperCase(), { rif: String(p.supplierRif).trim().toUpperCase(), name: p.supplierName }));
    return [...map.values()].filter(s => {
      try { return getSupplierAdvanceBalance(s.rif).outstandingUsd > 0.005; } catch { return false; }
    });
  }, [purchases, getSupplierAdvanceBalance]);
  const [supplierRif, setSupplierRif] = useState(suppliers[0]?.rif || '');
  const [kind, setKind] = useState<'REFUND_RECEIVED' | 'APPLIED_TO_PURCHASE'>('REFUND_RECEIVED');
  const [date, setDate] = useState(today);
  const [amountUsd, setAmountUsd] = useState('');
  const [cashReceivedBs, setCashReceivedBs] = useState('');
  const [bcvRate, setBcvRate] = useState(String(currentCompany.bcvRate || ''));
  const [treasuryAccountCode, setTreasuryAccountCode] = useState('');
  const [targetPurchaseId, setTargetPurchaseId] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const sqliteAvailable = typeof window !== 'undefined' && Boolean(window.sicovenStore?.save);
  const balance = supplierRif ? getSupplierAdvanceBalance(supplierRif) : null;
  const eligiblePurchases = purchases.filter(p => p.documentType === '01' && !p.isCancelled &&
    p.paymentTerm === 'CREDITO' && String(p.supplierRif).trim().toUpperCase() === supplierRif &&
    p.companyId === currentCompany.id);
  const accounts = bankAccounts.filter(a => a.companyId === currentCompany.id);
  const rate = Number(bcvRate);
  const usd = Number(amountUsd);
  const validAmount = Number.isFinite(usd) && usd > 0 && Number.isFinite(rate) && rate > 0;
  const allocationPreview = useMemo(() => {
    if (!supplierRif || !Number.isFinite(usd) || usd <= 0) return { rows: [], error: '' };
    const rif = supplierRif.trim().toUpperCase();
    const sourceNotes = purchases.filter(p => p.companyId === currentCompany.id && p.documentType === '03' &&
      !p.isCancelled && String(p.supplierRif || '').trim().toUpperCase() === rif &&
      Number(p.supplierAdvanceUsd || 0) > 0).sort((a, b) =>
        String(a.invoiceDate || '').localeCompare(String(b.invoiceDate || '')) || String(a.id).localeCompare(String(b.id)));
    try {
      const allocations = allocateSupplierAdvanceCreditNotes(
        sourceNotes.map(p => ({ id: p.id, amountUsd: Number(p.supplierAdvanceUsd || 0), bookValueBs: Number(p.supplierAdvanceBs || 0) })),
        supplierAdvanceSettlements, currentCompany.id, rif, Math.round(usd * 100) / 100
      );
      const rows = allocations.map(allocation => {
        const note = sourceNotes.find(p => p.id === allocation.creditNoteId)!;
        const previouslyUsed = supplierAdvanceSettlements.filter(item => item.companyId === currentCompany.id &&
          !item.isReversed && String(item.supplierRif || '').trim().toUpperCase() === rif)
          .flatMap(item => item.sourceCreditNoteAllocations || [])
          .filter(item => item.creditNoteId === note.id)
          .reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
        return {
          id: note.id, invoice: note.invoiceNumber, date: note.invoiceDate,
          appliedUsd: allocation.amountUsd, appliedBs: allocation.bookValueBs,
          remainingUsd: Math.max(0, Number(note.supplierAdvanceUsd || 0) - previouslyUsed - allocation.amountUsd)
        };
      });
      return { rows, error: '' };
    } catch (cause) {
      return { rows: [], error: cause instanceof Error ? cause.message : 'No se pudo calcular la distribución FIFO.' };
    }
  }, [supplierRif, usd, purchases, supplierAdvanceSettlements, currentCompany.id]);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!sqliteAvailable || !isStorageReady) { setError(storageError || 'La edición de escritorio con SQLite local no está disponible.'); return; }
    if (!balance || !validAmount) { setError('Seleccione proveedor e indique importe y tasa BCV válidos.'); return; }
    setSaving(true);
    try {
      await addSupplierAdvanceSettlement({
        supplierRif, kind, date, amountUsd: usd,
        amountBs: kind === 'REFUND_RECEIVED' ? Number(cashReceivedBs) : Math.round(usd * rate * 100) / 100,
        cashReceivedBs: kind === 'REFUND_RECEIVED' ? Number(cashReceivedBs) : undefined,
        bcvRate: rate,
        treasuryAccountCode: kind === 'REFUND_RECEIVED' ? treasuryAccountCode : undefined,
        targetPurchaseId: kind === 'APPLIED_TO_PURCHASE' ? targetPurchaseId : undefined,
        reference: reference.trim() || undefined
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la liquidación.');
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3">
    <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
        <div><h2 className="text-base font-bold">Anticipos y saldos a favor de proveedores</h2><p className="mt-1 text-xs text-slate-300">Reembolso recibido o aplicación a una factura pendiente</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5"/></button>
      </header>
      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {suppliers.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4"/>No hay anticipos de proveedor disponibles para liquidar.</div> : <>
          <label className="block text-xs font-semibold text-slate-700">Proveedor
            <select required value={supplierRif} onChange={e => { setSupplierRif(e.target.value); setTargetPurchaseId(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Seleccione proveedor</option>{suppliers.map(s => <option key={s.rif} value={s.rif}>{s.name} · {s.rif}</option>)}
            </select>
          </label>
          {balance && <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
            <div><span className="block text-[11px] text-slate-500">Saldo disponible USD</span><strong className="font-mono text-lg">{balance.outstandingUsd.toFixed(2)}</strong></div>
            <div><span className="block text-[11px] text-slate-500">Valor histórico Bs</span><strong className="font-mono text-lg">{balance.outstandingBs.toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
          </div>}
          <label className="block text-xs font-semibold text-slate-700">Tipo de operación
            <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="REFUND_RECEIVED">Reembolso recibido en caja / banco</option><option value="APPLIED_TO_PURCHASE">Aplicar a factura de compra pendiente</option>
            </select>
          </label>
          {kind === 'APPLIED_TO_PURCHASE' && <label className="block text-xs font-semibold text-slate-700">Factura destino
            <select required value={targetPurchaseId} onChange={e => setTargetPurchaseId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Seleccione factura</option>{eligiblePurchases.map(p => <option key={p.id} value={p.id}>{p.invoiceNumber} · {p.supplierName} · {p.totalAmountUsd.toFixed(2)} USD</option>)}
            </select>
          </label>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700">Fecha<input required type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
            <label className="text-xs font-semibold text-slate-700">Importe USD<input required type="number" min="0.01" step="0.01" value={amountUsd} onChange={e => setAmountUsd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
            <label className="text-xs font-semibold text-slate-700">Tasa BCV<input required type="number" min="0.000001" step="0.000001" value={bcvRate} onChange={e => setBcvRate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
          </div>
          {validAmount && amountUsd.trim() !== '' && <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="text-xs font-bold text-slate-800">Previsualización FIFO por nota de crédito</h3>
            {allocationPreview.error ? <p role="alert" className="mt-2 text-xs text-amber-800">{allocationPreview.error}</p> :
              allocationPreview.rows.length === 0 ? <p className="mt-2 text-xs text-slate-500">No hay notas disponibles para distribuir este importe.</p> :
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[430px] text-left text-[11px]">
                  <thead><tr className="border-b text-slate-500"><th className="py-2 pr-2">Nota / fecha</th><th className="py-2 pr-2 text-right">Aplicado USD</th><th className="py-2 pr-2 text-right">Valor histórico Bs</th><th className="py-2 text-right">Saldo USD</th></tr></thead>
                  <tbody>{allocationPreview.rows.map(row => <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-medium">{row.invoice || row.id}<span className="block text-slate-400">{row.date}</span></td>
                    <td className="py-2 pr-2 text-right font-mono">{row.appliedUsd.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right font-mono">{row.appliedBs.toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td className="py-2 text-right font-mono">{row.remainingUsd.toFixed(2)}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
          </section>}
          {kind === 'REFUND_RECEIVED' && <>
            <label className="block text-xs font-semibold text-slate-700">Importe efectivamente recibido en Bs<input required type="number" min="0.01" step="0.01" value={cashReceivedBs} onChange={e => setCashReceivedBs(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
            <label className="block text-xs font-semibold text-slate-700">Cuenta de caja / banco
              <select required value={treasuryAccountCode} onChange={e => setTreasuryAccountCode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">Seleccione cuenta</option>{accounts.map(a => <option key={a.id} value={a.accountCode}>{a.bankName} · {a.accountCode} · {a.currency}</option>)}</select>
            </label>
          </>}
          <label className="block text-xs font-semibold text-slate-700">Referencia / soporte<input value={reference} onChange={e => setReference(e.target.value)} maxLength={100} placeholder="Transferencia, recibo o documento" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
          <p className="rounded-lg bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">La descarga del anticipo se contabiliza a su valor histórico. Cualquier diferencia con el valor de liquidación se reconoce como diferencial cambiario. La operación queda sujeta a la confirmación de SQLite.</p>
        </>}
        <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Cancelar</button>
          <button type="submit" disabled={saving || suppliers.length === 0 || !isStorageReady || !sqliteAvailable} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Registrando…' : 'Registrar liquidación'}</button>
        </footer>
      </form>
    </div>
  </div>;
};
