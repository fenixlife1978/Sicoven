import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LockKeyhole, ShieldCheck, Undo2 } from 'lucide-react';
import { useAccounting, type AccountingAuditEvent } from '../context/AccountingContext';
import { formatBs, formatUsd, formatDate } from '../utils/formatters';
import { buildReversalItems, validateSaleInventoryReturnReconciliation } from '../types/journalReversal';

export const ReversionFiscalView: React.FC = () => {
  const {
    currentCompany, accounts, journalEntries, sales, purchases, movements, products, addMovement,
    bankStatementMovements, creditSettlements, getCreditBalance, getAuditEvents, reverseJournalEntry, closeAccountingPeriod
  } = useAccounting();
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [selectedId, setSelectedId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [reason, setReason] = useState('');
  const [workpaperNote, setWorkpaperNote] = useState('');
  const [retainedEarningsCode, setRetainedEarningsCode] = useState('');
  const [correctionMovementId, setCorrectionMovementId] = useState('');
  const [correctionQuantity, setCorrectionQuantity] = useState('1');
  const [correctionDate, setCorrectionDate] = useState(today);
  const [correctionDocumentRef, setCorrectionDocumentRef] = useState('');
  const [closedDate, setClosedDate] = useState(currentCompany.closedThroughDate || '');
  const [feedback, setFeedback] = useState<{kind:'success'|'error'; message:string}|null>(null);

  const [auditEvents, setAuditEvents] = useState<AccountingAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const refreshAuditEvents = async () => {
    setAuditLoading(true);
    try {
      setAuditEvents(await getAuditEvents(200));
      setAuditError(null);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'No se pudo leer el historial de auditoría.');
    } finally {
      setAuditLoading(false);
    }
  };
  useEffect(() => { void refreshAuditEvents(); }, []);

  const source = journalEntries.find(entry => entry.id === selectedId);
  const isPriorPeriod = Boolean(source && currentCompany.closedThroughDate && source.date <= currentCompany.closedThroughDate);
  const retainedEarningsAccounts = accounts.filter(account => account.type === 'PATRIMONIO' && account.isMovement);
  const accountMap = useMemo(() => new Map(accounts.map(account => [account.code, account])), [accounts]);
  const hasReversal = (entryId: string) => journalEntries.some(entry => entry.reversalOfEntryId === entryId) ||
    Boolean(journalEntries.find(entry => entry.id === entryId)?.reversedByEntryId);

  const previewResult = useMemo(() => {
    if (!source) return { items: [], error: null as string | null };
    try {
      const items = buildReversalItems(source, accounts, isPriorPeriod, retainedEarningsCode)
        .map(item => ({
          ...item,
          targetCode: item.accountCode,
          targetName: item.accountName,
          toRetained: Boolean(item.description?.startsWith('AIA · '))
        }));
      return { items, error: null as string | null };
    } catch (error) {
      return {
        items: [],
        error: error instanceof Error ? error.message : 'No se pudo validar el asiento original.'
      };
    }
  }, [source, accounts, isPriorPeriod, retainedEarningsCode]);
  const preview = previewResult.items;
  const previewError = previewResult.error;

  const linkedSale = source ? sales.find(sale => sale.journalEntryId === source.id || (source.type === 'VENTA' && source.referenceDoc === 'FAC-' + sale.invoiceNumber)) : undefined;
  const linkedPurchase = source ? purchases.find(purchase => purchase.journalEntryId === source.id || (source.type === 'COMPRA' && source.referenceDoc === 'FAC-' + purchase.invoiceNumber)) : undefined;
  const linkedInvoiceNumber = linkedSale?.invoiceNumber || linkedPurchase?.invoiceNumber;
  const linkedInventoryMovements = source
    ? movements.filter(movement => movement.companyId === currentCompany.id &&
        (movement.journalEntryId === source.id || Boolean(linkedInvoiceNumber &&
          (movement.documentRef.trim().toLocaleUpperCase() === linkedInvoiceNumber.trim().toLocaleUpperCase() ||
           movement.documentRef.trim().toLocaleUpperCase() === ('FAC-' + linkedInvoiceNumber).toLocaleUpperCase()))))
    : [];
  const saleInventoryReadiness = linkedSale && source
    ? validateSaleInventoryReturnReconciliation({
        companyId: currentCompany.id, invoiceNumber: linkedSale.invoiceNumber,
        source, movements, products, journalEntries
      })
    : null;
  const requiresInventoryReview = linkedInventoryMovements.length > 0 &&
    (!linkedSale || Boolean(linkedPurchase) || !saleInventoryReadiness?.ready);
  const linkedBankMovements = source
    ? bankStatementMovements.filter(movement => movement.companyId === currentCompany.id &&
        (movement.reconciledWithJournalEntryId === source.id ||
          movement.reconciledJournalEntryIds?.includes(source.id)))
    : [];
  const linkedDocumentId = linkedSale?.id || linkedPurchase?.id;
  const linkedSettlementKind = linkedSale ? 'SALE_COLLECTION' : linkedPurchase ? 'PURCHASE_PAYMENT' : undefined;
  const linkedCreditBalance = linkedDocumentId && linkedSettlementKind
    ? (() => { try { return getCreditBalance(linkedDocumentId, linkedSettlementKind); } catch { return null; } })()
    : null;
  const activeLinkedSettlements = linkedDocumentId && linkedSettlementKind
    ? creditSettlements.filter(item => item.companyId === currentCompany.id &&
        item.documentId === linkedDocumentId && item.kind === linkedSettlementKind && !item.isReversed)
    : [];
  const reversalBlockReasons = [
    ...(requiresInventoryReview ? [saleInventoryReadiness?.reason || 'Hay movimientos de Kardex relacionados que requieren una reversión coordinada de inventario y costo.'] : []),
    ...(linkedBankMovements.length ? ['Hay movimientos bancarios que fueron conciliados con este asiento. La desconciliación no borra ese vínculo histórico. El flujo de reversión bancaria coordinada todavía no está habilitado, por lo que el contra-asiento permanece bloqueado.'] : []),
    ...(activeLinkedSettlements.length ? ['La factura tiene ' + activeLinkedSettlements.length + ' cobro(s)/pago(s) vigente(s) que deben reversarse antes.'] : [])
  ];
  const reversalDisabled = !source || Boolean(previewError) || hasReversal(source.id) || reversalBlockReasons.length > 0 ||
    reason.trim().length < 10 || workpaperNote.trim().length < 10 ||
    (isPriorPeriod && !retainedEarningsAccounts.some(account => account.code === retainedEarningsCode)) ||
    !effectiveDate || effectiveDate < (source?.date || today) ||
    Boolean(currentCompany.closedThroughDate && effectiveDate <= currentCompany.closedThroughDate);

  const purchaseLineReconciliation = useMemo(() => {
    if (!linkedPurchase) return null;
    const lines = linkedPurchase.inventoryLines || [];
    const purchaseJournal = journalEntries.find(entry => entry.id === linkedPurchase.journalEntryId);
    const lineTotal = lines.reduce((sum,line) => sum + Number(line.quantity || 0) * Number(line.unitCostBs || 0),0);
    const baseTotal = Number(linkedPurchase.taxableBaseBs || 0) + Number(linkedPurchase.exemptAmountBs || 0);
    const linkedMovements = movements.filter(m => m.companyId === currentCompany.id && m.type === 'ENTRADA' && m.concept === 'COMPRA' &&
      m.documentRef.trim().toUpperCase() === ('FAC-' + linkedPurchase.invoiceNumber).trim().toUpperCase() && !m.correctionForMovementId);
    const movementTotal = linkedMovements.reduce((sum,m)=>sum+Number(m.totalCostBs||0),0);
    const movementQuantitiesMatch = lines.length > 0 && lines.every(line => {
      const matching = linkedMovements.filter(m=>m.productId===line.productId);
      return matching.length === 1 && Math.abs(Number(matching[0].quantity)-Number(line.quantity)) <= 1e-8 &&
        Math.abs(Number(matching[0].totalCostBs)-Number(line.quantity)*Number(line.unitCostBs)) <= 0.02;
    }) && linkedMovements.length === lines.length;
    const journalInventoryDebit = purchaseJournal?.items.filter(item=>item.accountCode==='1.1.4.01')
      .reduce((sum,item)=>sum+Number(item.debitBs||0)-Number(item.creditBs||0),0);
    const hasLines = lines.length > 0;
    const linesMatchInvoice = hasLines && Math.abs(lineTotal-baseTotal)<=0.02;
    const journalMatchesInvoice = Number.isFinite(journalInventoryDebit) && Math.abs(Number(journalInventoryDebit)-baseTotal)<=0.02;
    const movementMatchesLines = movementQuantitiesMatch && Math.abs(movementTotal-lineTotal)<=0.02;
    return {hasLines,lineTotal,baseTotal,movementTotal,journalInventoryDebit:Number(journalInventoryDebit||0),linesMatchInvoice,journalMatchesInvoice,movementMatchesLines,ok:hasLines&&linesMatchInvoice&&journalMatchesInvoice&&movementMatchesLines};
  }, [linkedPurchase, journalEntries, movements, currentCompany.id]);

  const correctableMovements = linkedInventoryMovements.filter(movement => {
    const matchesDocumentFlow = linkedSale
      ? movement.type === 'SALIDA' && movement.concept === 'VENTA'
      : linkedPurchase ? movement.type === 'ENTRADA' && movement.concept === 'COMPRA' : false;
    if (!matchesDocumentFlow) return false;
    const corrected = movements.filter(item => item.companyId === currentCompany.id && item.correctionForMovementId === movement.id)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return Number(movement.quantity) - corrected > 1e-8;
  });
  const selectedCorrectionSource = correctableMovements.find(movement => movement.id === correctionMovementId);
  const remainingCorrectionQuantity = selectedCorrectionSource
    ? Math.max(0, selectedCorrectionSource.quantity - movements.filter(item => item.companyId === currentCompany.id && item.correctionForMovementId === selectedCorrectionSource.id).reduce((sum, item) => sum + Number(item.quantity || 0), 0))
    : 0;

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

  const registerInventoryCorrection = () => {
    if (linkedPurchase && !linkedSale) {
      setFeedback({kind:'error', message:'La devolución física a proveedor no se automatiza desde la reversión de factura: el contra-asiento ya revierte CxP y el asiento original. Registrar aquí otra devolución podría duplicar el efecto contable. Requiere conciliación documentada de la cuenta de inventario antes de generar el movimiento físico.'});
      return;
    }
    const original = selectedCorrectionSource;
    if (!original) {
      setFeedback({kind:'error', message:'Seleccione un movimiento original de Kardex que admita devolución.'});
      return;
    }
    const quantity = Number(correctionQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remainingCorrectionQuantity + 1e-8) {
      setFeedback({kind:'error', message:'La cantidad debe ser positiva y no superar las unidades pendientes del movimiento original (' + remainingCorrectionQuantity + ').'});
      return;
    }
    const latestProductMovementDate = movements
      .filter(item => item.companyId === currentCompany.id && item.productId === original.productId)
      .reduce((latest, item) => item.date > latest ? item.date : latest, original.date);
    if (!correctionDate || correctionDate < original.date || correctionDate < latestProductMovementDate || correctionDocumentRef.trim().length < 4) {
      setFeedback({kind:'error', message:'La fecha debe ser válida y no anterior al último movimiento del Kardex (' + latestProductMovementDate + '); indique también una referencia documental de al menos 4 caracteres.'});
      return;
    }
    const product = products.find(item => item.id === original.productId && item.companyId === currentCompany.id);
    if (!product) {
      setFeedback({kind:'error', message:'No se encontró el artículo original en la empresa activa.'});
      return;
    }
    const isCustomerReturn = Boolean(linkedSale);
    if (!isCustomerReturn && product.costingMethod === 'PEPS') {
      setFeedback({kind:'error', message:'La devolución a proveedor con PEPS requiere identificar el lote de origen. No se registró el movimiento.'});
      return;
    }
    try {
      const rate = Number(original.bcvRate || currentCompany.bcvRate);
      addMovement({
        productId: original.productId, productName: original.productName, productCode: original.productCode,
        date: correctionDate, type: isCustomerReturn ? 'ENTRADA' : 'SALIDA',
        concept: isCustomerReturn ? 'DEVOLUCION_CLIENTE' : 'DEVOLUCION_COMPRA',
        documentRef: correctionDocumentRef.trim(), documentType: 'Soporte de devolución física',
        counterpartyRif: original.counterpartyRif || (linkedSale ? linkedSale.customerRif : linkedPurchase?.supplierRif) || '',
        counterpartyName: original.counterpartyName || (linkedSale ? linkedSale.customerName : linkedPurchase?.supplierName) || '',
        bcvRate: rate, quantity, unitCostBs: original.unitCostBs, unitCostUsd: original.unitCostUsd,
        totalCostBs: quantity * original.unitCostBs, totalCostUsd: quantity * original.unitCostUsd,
        balanceQty: product.currentStock, balanceTotalBs: product.currentStock * product.avgCostBs,
        balanceTotalUsd: product.currentStock * product.avgCostUsd,
        correctionForMovementId: original.id
      });
      setFeedback({kind:'success', message:'Devolución física registrada y enlazada al movimiento original del Kardex. El asistente volverá a comprobar si todas las cantidades de la factura fueron devueltas y si cada asiento de costo concilia; una devolución parcial no habilita la reversión total.'});
      setCorrectionQuantity('1');
      setCorrectionMovementId('');
      setCorrectionDocumentRef('');
    } catch (error) {
      setFeedback({kind:'error', message:error instanceof Error ? error.message : 'No se pudo registrar la corrección de inventario.'});
    }
  };

  const submitReversal = () => {
    if (!source || reversalDisabled) return;
    const confirmed = window.confirm(
      'Se registrará un contra-asiento nuevo e inmutable. No se borrará el asiento original. La reversión contable no sustituye la nota de crédito ni la rectificación fiscal que legalmente corresponda. ¿Desea continuar?'
    );
    if (!confirmed) return;
    try {
      const entry = reverseJournalEntry(
        source.id, effectiveDate, reason,
        workpaperNote,
        isPriorPeriod, isPriorPeriod ? retainedEarningsCode : undefined
      );
      setFeedback({kind:'success', message:'Contra-asiento '+entry.entryNumber+' registrado y enlazado al asiento '+source.entryNumber+'. El original permanece en el historial.'});
      setReason('');
      setWorkpaperNote('');
      setSelectedId('');
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
              <select value={selectedId} onChange={event=>{setSelectedId(event.target.value);setFeedback(null);}} className="w-full rounded-lg border border-slate-300 p-2.5 text-sm bg-white">
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
                {requiresInventoryReview && <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 space-y-2"><p className="font-bold">Atención: hay {linkedInventoryMovements.length} movimiento(s) de inventario relacionado(s) con esta factura.</p><ul className="list-disc pl-5">{linkedInventoryMovements.map(movement=><li key={movement.id}>{movement.date} · {movement.type} · {movement.quantity} · {movement.productCode} · {movement.documentRef}{movement.journalEntryId ? ' · asiento de inventario vinculado' : ''}</li>)}</ul><p>La reversión de esta factura no modifica automáticamente el Kardex ni revierte sus asientos de costo de venta/ajuste. Debe conciliar y registrar por separado la compensación de cada movimiento, respetando las existencias disponibles y el método de costo.</p><div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                  <p className="font-bold text-slate-900">Registrar devolución física trazable (si corresponde)</p>
                  <p className="text-xs text-slate-600">Use esta acción solo para unidades que efectivamente regresaron del cliente o que efectivamente se devolvieron al proveedor. No registre aquí mercancía vendida, consumida, dañada o no localizada.</p>
                  {linkedPurchase && !linkedSale ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 space-y-2"><strong>Devolución a proveedor: conciliación y flujo separado</strong>
                    {purchaseLineReconciliation?.ok ? <p className="text-emerald-800">Conciliación técnica aprobada: líneas, entradas de Kardex y débito de inventario del asiento coinciden por artículo, cantidad y costo.</p> : <p className="text-rose-800">Conciliación no aprobada: faltan líneas de mercancía o existen diferencias entre factura, Kardex y asiento. No se habilitará devolución automática desde aquí.</p>}
                    {purchaseLineReconciliation && <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs"><span>Líneas registradas: <strong>{linkedPurchase?.inventoryLines?.length || 0}</strong></span><span>Base + exento: <strong>{formatBs(purchaseLineReconciliation.baseTotal)}</strong></span><span>Total líneas: <strong>{formatBs(purchaseLineReconciliation.lineTotal)}</strong></span><span>Total Kardex: <strong>{formatBs(purchaseLineReconciliation.movementTotal)}</strong></span><span>Débito inventario del asiento: <strong>{formatBs(purchaseLineReconciliation.journalInventoryDebit)}</strong></span><span>Resultado: <strong>{purchaseLineReconciliation.ok ? 'CONCILIADO' : 'PENDIENTE'}</strong></span></div>}
                    <p>La reversión total de esta factura ya revierte CxP y el asiento original. No ejecute además una devolución que vuelva a debitar CxP: duplicaría el efecto. Para devoluciones parciales, el flujo de Inventario solo acepta operaciones con líneas de compra, entrada de Kardex y asiento de inventario conciliados; por ahora bloquea facturas con IVA, retenciones o IGTF porque aún no calcula toda la nota de crédito fiscal. En esos casos no registre una salida que cree un asiento parcial: requiere completar ese flujo fiscal. La regularización requiere el documento válido.</p></div> : correctableMovements.length > 0 ? <>
                    <label className="block font-semibold">Movimiento original</label>
                    <select value={correctionMovementId} onChange={event=>setCorrectionMovementId(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm">
                      <option value="">Seleccione movimiento de Kardex…</option>
                      {correctableMovements.map(movement => {
                        const corrected = movements.filter(item => item.companyId === currentCompany.id && item.correctionForMovementId === movement.id).reduce((sum,item)=>sum+Number(item.quantity||0),0);
                        return <option key={movement.id} value={movement.id}>{movement.productCode} · {movement.productName} · original {movement.quantity} · pendiente {Math.max(0,movement.quantity-corrected)}</option>;
                      })}
                    </select>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div><label className="block text-xs font-semibold mb-1">Cantidad devuelta</label><input type="number" min="0.000001" max={remainingCorrectionQuantity || undefined} step="0.000001" value={correctionQuantity} onChange={event=>setCorrectionQuantity(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm" /></div>
                      <div><label className="block text-xs font-semibold mb-1">Fecha del movimiento</label><input type="date" min={selectedCorrectionSource?.date} value={correctionDate} onChange={event=>setCorrectionDate(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm" /></div>
                      <div><label className="block text-xs font-semibold mb-1">Ref. nota/soporte</label><input value={correctionDocumentRef} onChange={event=>setCorrectionDocumentRef(event.target.value)} maxLength={120} placeholder="NC-000123" className="w-full rounded-lg border border-slate-300 p-2 text-sm" /></div>
                    </div>
                    {selectedCorrectionSource && !linkedSale && products.find(item=>item.id===selectedCorrectionSource.productId)?.costingMethod === 'PEPS' && <p className="text-xs text-amber-800">PEPS: la devolución al proveedor queda bloqueada hasta identificar el lote original; no se descargará un lote aproximado.</p>}
                    <button type="button" onClick={registerInventoryCorrection} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">Registrar devolución y asiento de inventario</button>
                  </> : <p className="text-xs text-slate-600">No hay unidades pendientes que coincidan con una salida por venta o una entrada por compra. Si la mercancía no regresó físicamente, documente su disposición en el papel de trabajo sin alterar existencias.</p>}
                </div>
                <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900"><strong>Control de seguridad:</strong> una casilla o una referencia escrita no sustituyen la conciliación técnica. Mientras existan movimientos de Kardex vinculados, el contra-asiento de la factura permanecerá bloqueado hasta completar el flujo coordinado de inventario, costo y documento fiscal.</div></div>}
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
              {previewError && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"><strong>No se puede simular una reversión válida:</strong> {previewError}</div>}
              {reversalBlockReasons.length > 0 && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 space-y-1"><strong>Reversión bloqueada por integridad cruzada</strong>{reversalBlockReasons.map((message,index)=><p key={index}>• {message}</p>)}<p className="font-medium">No basta con marcar una revisión manual: el sistema debe comprobar la reversión de los auxiliares y su asiento vinculado antes de permitir la aprobación.</p></div>}
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
                {(linkedBankMovements.length > 0 || activeLinkedSettlements.length > 0) && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 space-y-1"><strong>Conciliación de auxiliares pendiente</strong><p>Movimientos bancarios vinculados histórica o actualmente: {linkedBankMovements.length}</p><p>Cobros/pagos vigentes vinculados: {activeLinkedSettlements.length}</p><p>Estos importes no se compensarán por el solo hecho de generar un contra-asiento del Libro Diario.</p></div>}
                {saleInventoryReadiness?.ready && saleInventoryReadiness.originalMovementCount > 0 && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1"><strong>Kardex de venta conciliado</strong><p>Salidas originales: {saleInventoryReadiness.originalMovementCount} · devoluciones con asiento conciliado: {saleInventoryReadiness.returnedMovementCount}</p><p>Se verificó la devolución total de las cantidades y la contrapartida de inventario/costo. La reversión de la factura aún requiere su soporte fiscal legal.</p></div>}
                {linkedCreditBalance && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 space-y-1"><strong>Auxiliar {linkedSale ? 'Cuentas por Cobrar' : 'Cuentas por Pagar'}</strong><p>Principal original: {formatBs(linkedCreditBalance.originalAmountBs)} · {formatUsd(linkedCreditBalance.originalAmountUsd)}</p><p>Liquidado vigente: {formatBs(linkedCreditBalance.settledAmountBs)} · {formatUsd(linkedCreditBalance.settledAmountUsd)}</p><p>Saldo pendiente actual: <strong>{formatBs(linkedCreditBalance.outstandingBsAtInvoiceRate)} · {formatUsd(linkedCreditBalance.outstandingUsd)}</strong></p><p className="text-xs text-slate-600">La reversión sólo se habilita cuando no existan liquidaciones vigentes; el saldo auxiliar no se considera cancelado por una simple simulación.</p></div>}
                <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-sm text-sky-950 space-y-1">
                  <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Balance previsto</p>
                  <p>La contrapartida invierte Debe/Haber por línea y conserva la partida doble en Bs. y USD.</p>
                  <p><strong>Balance General · movimiento neto:</strong> {formatBs(balanceSheetImpactBs)} · {formatUsd(balanceSheetImpactUsd)}. Es el efecto de las líneas del contra-asiento en cuentas de activo, pasivo y patrimonio; no sustituye el balance completo.</p>
                  <p><strong>Estado de Resultados · movimiento neto:</strong> {formatBs(profitLossImpactBs)} · {formatUsd(profitLossImpactUsd)} en ingresos, costos y gastos. En AIA esas cuentas se reclasifican a resultados acumulados.</p>
                  <div className="space-y-1"><p><strong>Libro de Compras/Ventas e IVA:</strong> {linkedSale ? 'Venta '+linkedSale.invoiceNumber+' · base '+formatBs(linkedSale.taxableBaseBs)+' · IVA '+formatBs(linkedSale.vatAmountBs)+' · retención IVA '+formatBs(linkedSale.vatWithheldBs)+' · IGTF '+formatBs(linkedSale.igtfAmountBs || 0) : linkedPurchase ? 'Compra '+linkedPurchase.invoiceNumber+' · base '+formatBs(linkedPurchase.taxableBaseBs)+' · IVA '+formatBs(linkedPurchase.vatAmountBs)+' · retención IVA '+formatBs(linkedPurchase.vatWithheldBs)+' · retención ISLR '+formatBs(linkedPurchase.islrWithheldBs || 0)+' · IGTF '+formatBs(linkedPurchase.igtfAmountBs || 0) : 'No se detectó una factura fiscal vinculada directamente.'}</p><p className="font-semibold text-amber-900">Estado fiscal: pendiente de regularización documental. Esta simulación no altera los importes históricos de los libros legales ni sustituye la nota de crédito/débito o declaración que corresponda.</p></div>
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

      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><ShieldCheck className="w-6 h-6 text-emerald-700" /><div><h2 className="font-bold text-slate-900">Pista de auditoría local SQLite</h2><p className="text-sm text-slate-500">Eventos append-only de asientos, reversiones, documentos fiscales y liquidaciones.</p></div></div>
          <button type="button" onClick={() => void refreshAuditEvents()} disabled={auditLoading} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">{auditLoading ? 'Actualizando…' : 'Actualizar historial'}</button>
        </div>
        {auditError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{auditError}</div>}
        {!auditError && auditEvents.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{auditLoading ? 'Consultando eventos locales…' : 'Todavía no hay eventos de auditoría registrados.'}</p>}
        <div className="space-y-2">
          {auditEvents.map(event => {
            const details = event.details || {};
            const title = event.eventType === 'journal_entry_reversed' ? 'Contra-asiento registrado'
              : event.eventType === 'journal_entry_posted' ? 'Asiento contabilizado'
              : event.eventType === 'fiscal_document_reversal_marked' ? 'Documento fiscal marcado como reversado contablemente'
              : event.eventType === 'credit_settlement_reversed' ? 'Liquidación de crédito reversada'
              : event.eventType === 'bank_statement_reconciled' ? 'Movimiento bancario conciliado'
              : event.eventType === 'accounting_period_closed' ? 'Período contable cerrado'
              : event.eventType === 'factory_reset' ? 'Reinicio de datos operativos'
              : event.eventType === 'state_saved' ? 'Estado contable persistido en SQLite'
              : event.eventType.replace(/_/g, ' ');
            return <article key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-slate-900">{title}</strong><span className="font-mono text-slate-500">#{event.id} · {event.createdAt}</span></div>
              {details.entryNumber != null && <p>Asiento #{String(details.entryNumber)} · {String(details.date || '')} · {String(details.referenceDoc || '')}</p>}
              {Boolean(details.reversalOfEntryId) && <p>Asiento original: {String(details.reversalOfEntryId)}</p>}
              {Boolean(details.invoiceNumber) && <p>Factura: {String(details.invoiceNumber)} · {String(details.collection || '')}</p>}
              {Boolean(details.reversalReason) && <p><strong>Motivo:</strong> {String(details.reversalReason)}</p>}
              {Boolean(details.workpaperNote) && <p className="whitespace-pre-wrap"><strong>Papel de trabajo:</strong> {String(details.workpaperNote)}</p>}
              {Boolean(details.cancellationReason) && <p><strong>Motivo de regularización:</strong> {String(details.cancellationReason)}</p>}
              {Boolean(details.documentId) && <p>Documento vinculado: {String(details.documentId)}</p>}
              {Boolean(details.closedThroughDate) && <p>Cierre hasta: {String(details.closedThroughDate)}</p>}
              {Boolean(details.statementMovementId) && <p>Extracto: {String(details.statementMovementId)} · asiento vinculado: {String(details.journalEntryId || '')} · referencia: {String(details.reference || '')}</p>}
            </article>;
          })}
        </div>
        <p className="text-[11px] text-slate-500">Se muestran los últimos 200 eventos. El historial se almacena en SQLite y el reinicio operativo no lo elimina.</p>
      </section>
    </div>
  );
};
