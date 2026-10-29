import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldCheck, Undo2 } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { formatBs, formatUsd, formatDate } from '../utils/formatters';

export const ReversionFiscalView: React.FC = () => {
  const {
    currentCompany, accounts, journalEntries, sales, purchases, movements,
    reverseJournalEntry, closeAccountingPeriod
  } = useAccounting();
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [selectedId, setSelectedId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [reason, setReason] = useState('');
  const [workpaperNote, setWorkpaperNote] = useState('');
  const [retainedEarningsCode, setRetainedEarningsCode] = useState('');
  const [inventoryReviewed, setInventoryReviewed] = useState(false);
  const [inventoryCorrectionRef, setInventoryCorrectionRef] = useState('');
  const [closedDate, setClosedDate] = useState(currentCompany.closedThroughDate || '');
  const [feedback, setFeedback] = useState<{kind:'success'|'error'; message:string}|null>(null);

  const source = journalEntries.find(entry => entry.id === selectedId);
  const isPriorPeriod = Boolean(source && currentCompany.closedThroughDate && source.date <= currentCompany.closedThroughDate);
  const retainedEarningsAccounts = accounts.filter(account => account.type === 'PATRIMONIO' && account.isMovement);
  const accountMap = useMemo(() => new Map(accounts.map(account => [account.code, account])), [accounts]);
  const hasReversal = (entryId: string) => journalEntries.some(entry => entry.reversalOfEntryId === entryId) ||
    Boolean(journalEntries.find(entry => entry.id === entryId)?.reversedByEntryId);

  const preview = useMemo(() => {
    if (!source) return [];
    const retained = accountMap.get(retainedEarningsCode);
    return source.items.map(item => {
      const originalAccount = accountMap.get(item.accountCode);
      const toRetained = Boolean(isPriorPeriod && retained && originalAccount &&
        ['INGRESOS','COSTOS','GASTOS'].includes(originalAccount.type));
      return {
        ...item,
        targetCode: toRetained ? retained!.code : item.accountCode,
        targetName: toRetained ? retained!.name : (originalAccount?.name || item.accountName),
        debitBs: item.creditBs,
        creditBs: item.debitBs,
        debitUsd: item.creditUsd,
        creditUsd: item.debitUsd,
        toRetained
      };
    });
  }, [source, accountMap, isPriorPeriod, retainedEarningsCode]);

  const reversalDisabled = !source || hasReversal(source.id) ||
    reason.trim().length < 10 || workpaperNote.trim().length < 10 ||
    (isPriorPeriod && !retainedEarningsAccounts.some(account => account.code === retainedEarningsCode)) ||
    !effectiveDate || effectiveDate < (source?.date || today) ||
    Boolean(currentCompany.closedThroughDate && effectiveDate <= currentCompany.closedThroughDate);

  const linkedSale = source ? sales.find(sale => sale.journalEntryId === source.id || (source.type === 'VENTA' && source.referenceDoc === 'FAC-' + sale.invoiceNumber)) : undefined;
  const linkedPurchase = source ? purchases.find(purchase => purchase.journalEntryId === source.id || (source.type === 'COMPRA' && source.referenceDoc === 'FAC-' + purchase.invoiceNumber)) : undefined;
  const linkedInvoiceNumber = linkedSale?.invoiceNumber || linkedPurchase?.invoiceNumber;
  const linkedInventoryMovements = source && linkedInvoiceNumber
    ? movements.filter(movement => movement.companyId === currentCompany.id &&
        (movement.journalEntryId === source.id || movement.documentRef.trim().toLocaleUpperCase() === linkedInvoiceNumber.trim().toLocaleUpperCase() ||
         movement.documentRef.trim().toLocaleUpperCase() === ('FAC-' + linkedInvoiceNumber).toLocaleUpperCase()))
    : [];
  const requiresInventoryReview = linkedInventoryMovements.length > 0;
  const balanceSheetImpactBs = preview.reduce((sum, item) => {
    const type = accountMap.get(item.targetCode)?.type;
    return ['ACTIVO','PASIVO','PATRIMONIO'].includes(type || '') ? sum + item.debitBs - item.creditBs : sum;
  }, 0);
  const balanceSheetImpactUsd = preview.reduce((sum, item) => {
    const type = accountMap.get(item.targetCode)?.type;
    return ['ACTIVO','PASIVO','PATRIMONIO'].includes(type || '') ? sum + item.debitUsd - item.creditUsd : sum;
  }, 0);
  const profitLossImpactBs = preview.reduce((sum, item) => {
    const type = accountMap.get(item.targetCode)?.type;
    return ['INGRESOS','COSTOS','GASTOS'].includes(type || '') ? sum + item.debitBs - item.creditBs : sum;
  }, 0);
  const profitLossImpactUsd = preview.reduce((sum, item) => {
    const type = accountMap.get(item.targetCode)?.type;
    return ['INGRESOS','COSTOS','GASTOS'].includes(type || '') ? sum + item.debitUsd - item.creditUsd : sum;
  }, 0);

  const submitReversal = () => {
    if (!source || reversalDisabled) return;
    if (requiresInventoryReview && !inventoryReviewed) {
      setFeedback({kind:'error', message:'Confirme la revisión del Kardex y la necesidad de registrar movimientos compensatorios por separado antes de reversar la factura.'});
      return;
    }
    if (requiresInventoryReview && inventoryCorrectionRef.trim().length < 4) {
      setFeedback({kind:'error', message:'Indique el número de documento o papel de trabajo que soporta la conciliación/corrección del inventario (mínimo 4 caracteres).'});
      return;
    }
    const confirmed = window.confirm(
      'Se registrará un contra-asiento nuevo e inmutable. No se borrará el asiento original. La reversión contable no sustituye la nota de crédito ni la rectificación fiscal que legalmente corresponda. ¿Desea continuar?'
    );
    if (!confirmed) return;
    try {
      const entry = reverseJournalEntry(
        source.id, effectiveDate, reason,
        requiresInventoryReview ? workpaperNote.trim() + '\\nReferencia de conciliación/corrección de inventario: ' + inventoryCorrectionRef.trim() : workpaperNote,
        isPriorPeriod, isPriorPeriod ? retainedEarningsCode : undefined
      );
      setFeedback({kind:'success', message:'Contra-asiento '+entry.entryNumber+' registrado y enlazado al asiento '+source.entryNumber+'. El original permanece en el historial.'});
      setReason('');
      setWorkpaperNote('');
      setSelectedId('');
      setInventoryReviewed(false);
      setInventoryCorrectionRef('');
    } catch (error) {
      setFeedback({kind:'error', message:error instanceof Error ? error.message : 'No se pudo registrar la reversión.'});
    }
  };

  const submitClose = () => {
    if (!window.confirm('Va a bloquear el período contable hasta '+closedDate+'. La fecha no podrá retroceder desde esta pantalla. ¿Confirma el cierre?')) return;
    try {
      closeAccountingPeriod(closedDate);
      setFeedback({kind:'success', message:'Período cerrado hasta '+closedDate+'. No se admitirán nuevos asientos ni facturas con fecha igual o anterior.'});
    } catch (error) {
      setFeedback({kind:'error', message:error instanceof Error ? error.message : 'No se pudo cerrar el período.'});
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center gap-3">
          <Undo2 className="h-6 w-6 text-emerald-300" />
          <div>
            <h1 className="text-lg font-bold">Asistente de reversión guiada</h1>
            <p className="text-sm text-slate-300">Inmutabilidad del Libro Diario · impacto cruzado · papeles de trabajo</p>
          </div>
        </div>
        <div className="p-4 sm:p-6 space-y-5">
          {feedback && <div role="status" className={`rounded-lg border p-3 text-sm ${feedback.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{feedback.message}</div>}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-950">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>La reversión contable conserva la trazabilidad y no elimina documentos. <strong>No sustituye una nota de crédito/débito, una declaración sustitutiva ni el trámite ante el SENIAT.</strong> El impacto fiscal legal debe cotejarse con el documento válido y el período declarado.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">1. Seleccione el asiento original</label>
              <select value={selectedId} onChange={event=>{setSelectedId(event.target.value);setFeedback(null);setInventoryReviewed(false);}} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-white">
                <option value="">Seleccionar asiento contabilizado…</option>
                {journalEntries.filter(entry=>!entry.reversalOfEntryId && !hasReversal(entry.id)).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.entryNumber-a.entryNumber).map(entry=>(
                  <option key={entry.id} value={entry.id}>#{entry.entryNumber} · {entry.date} · {entry.description.slice(0,90)}</option>
                ))}
              </select>
              {source && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                <div><span className="text-slate-500">Asiento:</span> <strong>#{source.entryNumber}</strong> · {formatDate(source.date)}</div>
                <div><span className="text-slate-500">Tipo / referencia:</span> {source.type} · {source.referenceDoc || 'Sin referencia'}</div>
                <div><span className="text-slate-500">Descripción:</span> {source.description}</div>
                {(linkedSale || linkedPurchase) && <div className="font-semibold text-amber-800">Documento vinculado: {linkedSale ? 'Venta '+linkedSale.invoiceNumber+' · '+linkedSale.customerName : 'Compra '+linkedPurchase!.invoiceNumber+' · '+linkedPurchase!.supplierName}</div>}
                {requiresInventoryReview && <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 space-y-2"><p className="font-bold">Atención: hay {linkedInventoryMovements.length} movimiento(s) de inventario relacionado(s) con esta factura.</p><ul className="list-disc pl-5">{linkedInventoryMovements.map(movement=><li key={movement.id}>{movement.date} · {movement.type} · {movement.quantity} · {movement.productCode} · {movement.documentRef}{movement.journalEntryId ? ' · asiento de inventario vinculado' : ''}</li>)}</ul><p>La reversión de esta factura no modifica automáticamente el Kardex ni revierte sus asientos de costo de venta/ajuste. Debe conciliar y registrar por separado la compensación de cada movimiento, respetando las existencias disponibles y el método de costo.</p><label className="flex items-start gap-2 font-semibold"><input type="checkbox" checked={inventoryReviewed} onChange={event=>setInventoryReviewed(event.target.checked)} className="mt-1" /><span>Confirmo que revisé estos movimientos y que la corrección del inventario se gestionará por separado con soporte documental.</span></label><label className="block font-semibold">Referencia del soporte de conciliación/corrección de inventario</label><input value={inventoryCorrectionRef} onChange={event=>setInventoryCorrectionRef(event.target.value)} maxLength={160} placeholder="Ej. AJ-KARDEX-2026-004 / papel de trabajo" className="w-full rounded-lg border border-red-300 bg-white p-2 text-sm" /><p className="text-xs">Esta referencia quedará anexada al papel de trabajo de la reversión. El sistema no verifica por sí solo que la compensación haya sido contabilizada.</p></div>}
                {hasReversal(source.id) && <p className="text-red-700 font-semibold">Este asiento ya fue reversado.</p>}
              </div>}
              <label className="block text-sm font-semibold text-slate-700">2. Fecha del contra-asiento</label>
              <input type="date" value={effectiveDate} min={source?.date || today} onChange={event=>setEffectiveDate(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
              {isPriorPeriod && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950"><strong>Ajuste de Ejercicio Anterior (AIA).</strong> El asiento original está en período cerrado hasta {currentCompany.closedThroughDate}. El contra-asiento se registrará en el período abierto y las cuentas de ingresos, costos y gastos se reclasificarán a resultados acumulados. Revise el criterio con el contador responsable.</div>}
              {isPriorPeriod && <label className="block text-sm font-semibold text-slate-700">Cuenta de patrimonio para resultados acumulados</label>}
              {isPriorPeriod && <select value={retainedEarningsCode} onChange={event=>setRetainedEarningsCode(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-white"><option value="">Seleccione cuenta de patrimonio…</option>{retainedEarningsAccounts.map(account=><option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select>}
              <label className="block text-sm font-semibold text-slate-700">3. Causa de la reversión (mínimo 10 caracteres)</label>
              <textarea value={reason} onChange={event=>setReason(event.target.value)} rows={2} maxLength={1000} placeholder="Ej. Factura emitida con RIF incorrecto; documento soporte…" className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
              <label className="block text-sm font-semibold text-slate-700">4. Nota explicativa / papel de trabajo (mínimo 10 caracteres)</label>
              <textarea value={workpaperNote} onChange={event=>setWorkpaperNote(event.target.value)} rows={3} maxLength={5000} placeholder="Fundamento técnico, soporte revisado, responsable y efecto fiscal pendiente…" className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
              <button disabled={reversalDisabled} onClick={submitReversal} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Aprobar y registrar contra-asiento</button>
            </div>
            <div className="space-y-3">
              <h2 className="font-bold text-slate-900">Vista previa del impacto contable</h2>
              {!source ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Seleccione un asiento para calcular el efecto antes de aprobar.</div> : <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 border p-3"><p className="text-xs text-slate-500">Asiento original · Debe Bs.</p><p className="font-bold">{formatBs(source.items.reduce((sum,item)=>sum+item.debitBs,0))}</p><p className="text-xs text-slate-500 mt-1">Haber Bs. {formatBs(source.items.reduce((sum,item)=>sum+item.creditBs,0))}</p></div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3"><p className="text-xs text-emerald-800">Contra-asiento · Debe Bs.</p><p className="font-bold text-emerald-900">{formatBs(preview.reduce((sum,item)=>sum+item.debitBs,0))}</p><p className="text-xs text-emerald-800 mt-1">Haber Bs. {formatBs(preview.reduce((sum,item)=>sum+item.creditBs,0))}</p></div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs min-w-[480px]">
                    <thead className="bg-slate-100 text-slate-600"><tr><th className="text-left p-2">Cuenta destino</th><th className="text-right p-2">Debe Bs.</th><th className="text-right p-2">Haber Bs.</th><th className="text-right p-2">Debe USD</th><th className="text-right p-2">Haber USD</th></tr></thead>
                    <tbody>{preview.map((item,index)=><tr key={index} className="border-t border-slate-100"><td className="p-2">{item.targetCode} · {item.targetName}{item.toRetained && <span className="block text-indigo-700">Reclasificado a resultados acumulados</span>}</td><td className="p-2 text-right whitespace-nowrap">{formatBs(item.debitBs)}</td><td className="p-2 text-right whitespace-nowrap">{formatBs(item.creditBs)}</td><td className="p-2 text-right whitespace-nowrap">{formatUsd(item.debitUsd)}</td><td className="p-2 text-right whitespace-nowrap">{formatUsd(item.creditUsd)}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-sm text-sky-950 space-y-1">
                  <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Balance previsto</p>
                  <p>La contrapartida invierte Debe/Haber por línea y conserva la partida doble en Bs. y USD.</p>
                  <p><strong>Balance General · movimiento neto:</strong> {formatBs(balanceSheetImpactBs)} · {formatUsd(balanceSheetImpactUsd)}. Es el efecto de las líneas del contra-asiento en cuentas de activo, pasivo y patrimonio; no sustituye el balance completo.</p>
                  <p><strong>Estado de Resultados · movimiento neto:</strong> {formatBs(profitLossImpactBs)} · {formatUsd(profitLossImpactUsd)} en ingresos, costos y gastos. En AIA esas cuentas se reclasifican a resultados acumulados.</p>
                  <p><strong>Libro de Compras/Ventas e IVA:</strong> {linkedSale ? 'Venta '+linkedSale.invoiceNumber+' · base '+formatBs(linkedSale.taxableBaseBs)+' · IVA '+formatBs(linkedSale.vatAmountBs) : linkedPurchase ? 'Compra '+linkedPurchase.invoiceNumber+' · base '+formatBs(linkedPurchase.taxableBaseBs)+' · IVA '+formatBs(linkedPurchase.vatAmountBs) : 'No se detectó una factura fiscal vinculada directamente.'} La factura se marca reversada contablemente; los importes del libro legal permanecen auditables hasta la regularización con el documento fiscal válido.</p>
                </div>
              </>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3"><LockKeyhole className="w-6 h-6 text-indigo-700" /><div><h2 className="font-bold text-slate-900">Candado de períodos fiscales</h2><p className="text-sm text-slate-500">Bloquea nuevos asientos y facturas con fecha igual o anterior al corte.</p></div></div>
        <div className="rounded-lg bg-slate-50 border p-3 text-sm">Estado actual: {currentCompany.closedThroughDate ? <strong>cerrado hasta {currentCompany.closedThroughDate}</strong> : <strong>sin período cerrado</strong>}</div>
        <div className="flex flex-col sm:flex-row gap-3 items-end"><div className="w-full sm:max-w-xs"><label className="block text-sm font-semibold text-slate-700 mb-1">Cerrar hasta</label><input type="date" max={today} value={closedDate} onChange={event=>setClosedDate(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></div><button disabled={!closedDate || Boolean(currentCompany.closedThroughDate && closedDate < currentCompany.closedThroughDate) || closedDate > today} onClick={submitClose} className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-800 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"><LockKeyhole className="w-4 h-4" /> Confirmar cierre irreversible</button></div>
        <p className="text-xs text-slate-500">El cierre es progresivo e irreversible desde esta pantalla. Para reabrir un período debe existir autorización formal y un procedimiento auditado de administrador; no se habilita una reapertura informal.</p>
      </section>
    </div>
  );
};
