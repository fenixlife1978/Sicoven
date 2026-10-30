import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';
import type { PurchaseRecord } from '../../types/accounting';

interface Props {
  purchase: PurchaseRecord;
  onClose: () => void;
}

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const PurchaseCreditNoteModal: React.FC<Props> = ({ purchase, onClose }) => {
  const { products, movements, addPurchaseCreditNote, isStorageReady, storageError } = useAccounting();
  const [returnDate, setReturnDate] = useState(localToday);
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [controlNumber, setControlNumber] = useState('');
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const rows = useMemo(() => (purchase.inventoryLines || []).map(line => {
    const product = products.find(item => item.id === line.productId && item.companyId === purchase.companyId);
    const candidates = movements.filter(item =>
      item.companyId === purchase.companyId && item.productId === line.productId &&
      item.type === 'ENTRADA' && item.concept === 'COMPRA' &&
      item.documentRef.trim().toUpperCase() === ('FAC-' + purchase.invoiceNumber).trim().toUpperCase() &&
      !item.correctionForMovementId &&
      Math.abs(Number(item.quantity) - Number(line.quantity)) <= 1e-8 &&
      Math.abs(Number(item.unitCostBs) - Number(line.unitCostBs)) <= 0.02
    );
    const originalMovement = candidates.length === 1 ? candidates[0] : undefined;
    const returned = originalMovement ? movements
      .filter(item => item.companyId === purchase.companyId && item.correctionForMovementId === originalMovement.id &&
        item.type === 'SALIDA' && item.concept === 'DEVOLUCION_COMPRA')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
    return { line, product, originalMovement, returned, available: originalMovement ? Math.max(0, Number(originalMovement.quantity) - returned) : 0 };
  }), [purchase, products, movements]);

  useEffect(() => {
    setQuantities({});
    setError('');
    setSuccess('');
  }, [purchase.id]);

  const eligible = purchase.documentType === '01' && !purchase.isCancelled &&
    purchase.paymentTerm === 'CREDITO' && Boolean(purchase.inventoryLines?.length);
  const invalidRows = rows.filter(row => !row.product || !row.originalMovement || row.available <= 1e-8);
  const selectedLines = rows.flatMap(row => {
    const quantity = Number(quantities[row.line.productId] || 0);
    if (!row.originalMovement || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ productId: row.line.productId, originalMovementId: row.originalMovement.id, quantity }];
  });
  const selectedCount = selectedLines.length;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSuccess('');
    if (!isStorageReady) {
      setError(storageError || 'SQLite local no está lista. No se puede registrar la devolución.');
      return;
    }
    if (!eligible) {
      setError('Esta factura no cumple las condiciones del flujo automático. Solo se admiten facturas a crédito con líneas de inventario conciliables.');
      return;
    }
    if (invalidRows.length > 0) {
      setError('Hay artículos sin una entrada única y conciliada en Kardex o sin cantidad pendiente. Corrija la factura o el Kardex antes de devolver.');
      return;
    }
    if (selectedCount === 0) {
      setError('Indique una cantidad mayor que cero en al menos un artículo.');
      return;
    }
    if (!creditNoteNumber.trim() || !controlNumber.trim() || reason.trim().length < 10) {
      setError('Complete el número de nota, número de control y una justificación de al menos 10 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      const note = await addPurchaseCreditNote({
        purchaseId: purchase.id,
        lines: selectedLines,
        returnDate,
        creditNoteNumber: creditNoteNumber.trim(),
        controlNumber: controlNumber.trim(),
        reason: reason.trim()
      });
      setSuccess('Nota de crédito ' + (note.creditNoteNumber || note.invoiceNumber) + ' registrada y confirmada en SQLite. Kardex, CxP y asiento contable quedaron enlazados.');
      window.setTimeout(() => onClose(), 900);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar la nota de crédito en SQLite.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div>
            <h2 className="text-base font-bold">Devolución a proveedor · Nota de crédito</h2>
            <p className="mt-1 text-xs text-slate-300">Factura {purchase.invoiceNumber} · {purchase.supplierName} · {purchase.supplierRif}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {!eligible && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />No elegible: el flujo automático requiere factura vigente a crédito y líneas de mercancía vinculadas al Kardex. Las compras de contado y facturas históricas sin detalle siguen bloqueadas.</div>}
            {eligible && invalidRows.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />La factura tiene artículos sin conciliación única o sin cantidad pendiente. No se habilitará el registro parcial mientras falte esa conciliación.</div>}
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            {success && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700">Fecha de la nota
                <input type="date" required value={returnDate} onChange={event => setReturnDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-xs font-semibold text-slate-700">N° Nota de crédito
                <input required value={creditNoteNumber} onChange={event => setCreditNoteNumber(event.target.value)} maxLength={40} placeholder="NC-000123" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono font-normal" />
              </label>
              <label className="text-xs font-semibold text-slate-700">N° Control
                <input required value={controlNumber} onChange={event => setControlNumber(event.target.value)} maxLength={40} placeholder="00-000123" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono font-normal" />
              </label>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800">Artículos devueltos</h3>
                <span className="text-xs text-slate-500">Seleccione solo las unidades que realmente salen del inventario</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr><th className="px-3 py-2">Artículo</th><th className="px-3 py-2 text-right">Comprado</th><th className="px-3 py-2 text-right">Devuelto</th><th className="px-3 py-2 text-right">Disponible</th><th className="px-3 py-2 text-right">Devolver ahora</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map(row => <tr key={row.line.productId}>
                      <td className="px-3 py-2"><div className="font-semibold text-slate-800">{row.product?.name || 'Artículo no encontrado'}</div><div className="font-mono text-[10px] text-slate-500">{row.product?.code || row.line.productId}</div>{!row.originalMovement && <div className="mt-1 text-[10px] text-red-600">No hay una entrada única coincidente en Kardex</div>}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(row.line.quantity).toLocaleString('es-VE')}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.returned.toLocaleString('es-VE')}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{row.available.toLocaleString('es-VE')}</td>
                      <td className="px-3 py-2 text-right"><input type="number" min="0" max={row.available} step="0.0001" disabled={!row.originalMovement || row.available <= 0 || submitting} value={quantities[row.line.productId] || ''} onChange={event => setQuantities(prev => ({ ...prev, [row.line.productId]: event.target.value }))} className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-mono" placeholder="0" /></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-700">Motivo y soporte de la devolución
              <textarea required minLength={10} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describa el motivo, acuerdo con el proveedor y soporte documental…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">Al confirmar, SICOVEN calculará proporcionalmente base, IVA, retenciones e IGTF; reducirá CxP; registrará la salida de Kardex y el contra-asiento enlazado. SQLite valida el conjunto dentro de una transacción. Si cualquier conciliación falla, no se mostrará éxito. Los comprobantes de retención afectados quedarán señalados para revisión fiscal antes de declarar.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={submitting || !eligible || invalidRows.length > 0 || !isStorageReady || Boolean(success)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando y confirmando en SQLite…</> : 'Registrar nota de crédito y devolución'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
