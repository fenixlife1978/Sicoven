import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { ShoppingCart, X, Check, Calculator, ShieldCheck } from 'lucide-react';
import { ISLR_CONCEPTS, calculateIslrRetention } from '../../data/islrConcepts';
import { formatBs, formatUsd, cleanRif, formatRif } from '../../utils/formatters';
import { calculatePurchaseIgtf, type PurchasePaymentMethod } from '../../types/purchaseTaxes';

interface NewPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewPurchaseModal: React.FC<NewPurchaseModalProps> = ({ isOpen, onClose }) => {
  const { currentCompany, products, movements, addPurchase, addMovement, runAtomicInvoiceImport } = useAccounting();

  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [supplierRif, setSupplierRif] = useState<string>('J-');
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierAddress, setSupplierAddress] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [controlNumber, setControlNumber] = useState<string>('');
  const [documentType, setDocumentType] = useState<'01' | '02' | '03'>('01');
  const [affectedInvoiceNumber, setAffectedInvoiceNumber] = useState<string>('');

  // Amounts
  const [taxableBaseBs, setTaxableBaseBs] = useState<number>(0);
  const [exemptAmountBs, setExemptAmountBs] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(16);

  // IVA Withholding
  const isSpecial = currentCompany.taxpayerType === 'ESPECIAL';
  const [retentionRate, setRetentionRate] = useState<number>(isSpecial ? currentCompany.defaultIvaRetentionRate : 0);

  // ISLR Withholding
  const [applyIslr, setApplyIslr] = useState<boolean>(true);
  const [islrConceptCode, setIslrConceptCode] = useState<string>('011');

  // Currency
  const [bcvRate, setBcvRate] = useState<number>(currentCompany.bcvRate || 0);
  const [notes, setNotes] = useState<string>('');
  const [linkInventory, setLinkInventory] = useState(false);
  const [inventoryLines, setInventoryLines] = useState<Array<{productId:string; quantity:string; unitCostBs:string}>>([{productId:'',quantity:'1',unitCostBs:''}]);
  const [paymentTerm, setPaymentTerm] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [creditDays, setCreditDays] = useState<number>(7);
  const [currencyPricingMode, setCurrencyPricingMode] = useState<'USD_FIJO' | 'BS_AJUSTABLE' | 'REVISION_MANUAL'>('USD_FIJO');
  const [fiscalAdjustmentMode, setFiscalAdjustmentMode] = useState<'IVA_ORIGINAL_DIF_CAMBIARIA' | 'AJUSTE_BASE_IVA' | 'REVISION_CONTADOR'>('REVISION_CONTADOR');
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('BS');
  const [applyIgtf, setApplyIgtf] = useState(false);
  const dueDate = (() => { const d = new Date(invoiceDate + 'T12:00:00'); d.setDate(d.getDate() + creditDays); return d.toISOString().slice(0, 10); })();

  if (!isOpen) return null;

  // Real-time calculations
  const vatAmountBs = Math.round(taxableBaseBs * (taxRate / 100) * 100) / 100;
  const invoiceSubtotalBs = Math.round((taxableBaseBs + exemptAmountBs + vatAmountBs) * 100) / 100;
  const igtfCalculation = calculatePurchaseIgtf(invoiceSubtotalBs, paymentMethod, applyIgtf, 3, paymentTerm);
  const igtfApplicable = igtfCalculation.applicable;
  const igtfAmountBs = igtfCalculation.amountBs;
  const totalAmountBs = Math.round((invoiceSubtotalBs + igtfAmountBs) * 100) / 100;
  const vatWithheldBs = Math.round(vatAmountBs * (retentionRate / 100) * 100) / 100;

  // ISLR calculation
  const selectedConcept = ISLR_CONCEPTS.find(c => c.code === islrConceptCode);
  let islrWithheldBs = 0;
  let islrSubtrahendBs = 0;
  let islrRate = 0;

  if (applyIslr && selectedConcept && taxableBaseBs > 0) {
    const calc = calculateIslrRetention(taxableBaseBs, selectedConcept);
    islrRate = calc.rate;
    islrSubtrahendBs = calc.subtrahendBs;
    islrWithheldBs = calc.withheldAmountBs;
  }

  // Net payable
  const netPayableBs = totalAmountBs - vatWithheldBs - islrWithheldBs;

  // USD conversions
  const totalAmountUsd = bcvRate > 0 ? totalAmountBs / bcvRate : 0;
  const taxableBaseUsd = bcvRate > 0 ? taxableBaseBs / bcvRate : 0;
  const vatAmountUsd = bcvRate > 0 ? vatAmountBs / bcvRate : 0;
  const vatWithheldUsd = bcvRate > 0 ? vatWithheldBs / bcvRate : 0;
  const islrWithheldUsd = bcvRate > 0 ? islrWithheldBs / bcvRate : 0;

  const inventoryLineTotal = inventoryLines.reduce((sum,line) => sum + Math.max(0,Number(line.quantity)||0) * Math.max(0,Number(line.unitCostBs)||0),0);
  const inventoryLinesValid = !linkInventory || (
    inventoryLines.length > 0 &&
    inventoryLines.every(line => products.some(p => p.id === line.productId && p.companyId === currentCompany.id) &&
      Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0 &&
      Number.isFinite(Number(line.unitCostBs)) && Number(line.unitCostBs) > 0) &&
    Math.abs(inventoryLineTotal - (taxableBaseBs + exemptAmountBs)) <= 0.02 &&
    new Set(inventoryLines.map(line=>line.productId)).size === inventoryLines.length
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierRif.trim() || !supplierName.trim() || !invoiceNumber.trim()) {
      window.alert('Completa el RIF, nombre del proveedor y número de factura.');
      return;
    }
    if (!Number.isFinite(bcvRate) || bcvRate <= 0) {
      window.alert('No se puede registrar la compra sin una tasa BCV manual válida mayor que cero. Verifica la tasa de la empresa e inténtalo de nuevo.');
      return;
    }
    if (!Number.isFinite(totalAmountBs) || totalAmountBs <= 0) {
      window.alert('El total de la factura debe ser un importe válido mayor que cero.');
      return;
    }
    if (![taxableBaseBs, exemptAmountBs, vatAmountBs, igtfAmountBs, vatWithheldBs, islrWithheldBs].every(value => Number.isFinite(value) && value >= 0)) {
      window.alert('Hay importes fiscales inválidos. Revisa base imponible, exento, IVA, IGTF y retenciones.');
      return;
    }
    if (!inventoryLinesValid) {
      window.alert('Las líneas deben usar artículos existentes, cantidades y costos válidos, sin repetir artículos, y conciliar con la base imponible más el monto exento. Si hay gastos no inventariables, no marques la vinculación total al Kardex.');
      return;
    }
    if (linkInventory) {
      for (const line of inventoryLines) {
        const product = products.find(p => p.id === line.productId && p.companyId === currentCompany.id);
        if (!product) { window.alert('Un artículo seleccionado ya no existe en la empresa activa.'); return; }
        const latest = movements.filter(m => m.companyId === currentCompany.id && m.productId === product.id)
          .reduce((value,m) => m.date > value ? m.date : value, '');
        if (latest && invoiceDate < latest) {
          window.alert('La fecha de compra es anterior al último movimiento del Kardex de ' + product.code + ' (' + latest + '). Registra los períodos en orden cronológico.');
          return;
        }
      }
    }
    if (vatWithheldBs + islrWithheldBs > totalAmountBs + 0.005) {
      window.alert('Las retenciones no pueden superar el total de la factura.');
      return;
    }

    try {
      runAtomicInvoiceImport(() => {
      addPurchase({
      invoiceDate,
      supplierRif: formatRif(supplierRif),
      supplierName: supplierName.trim().toUpperCase(),
      supplierAddress: supplierAddress.trim() || undefined,
      invoiceNumber: invoiceNumber.trim(),
      controlNumber: controlNumber.trim() || `00-${invoiceNumber.trim()}`,
      documentType,
      affectedInvoiceNumber: affectedInvoiceNumber.trim() || undefined,
      totalAmountBs,
      paymentMethod,
      igtfApplicable,
      igtfRate: igtfApplicable ? 3 : 0,
      igtfAmountBs,
      igtfAmountUsd: bcvRate > 0 ? igtfAmountBs / bcvRate : 0,
      exemptAmountBs,
      taxableBaseBs,
      taxRate,
      vatAmountBs,
      retentionRate,
      vatWithheldBs,
      islrConceptCode: applyIslr ? selectedConcept?.code : undefined,
      islrConceptName: applyIslr ? selectedConcept?.description : undefined,
      islrRate: applyIslr ? islrRate : 0,
      islrSubtrahendBs: applyIslr ? islrSubtrahendBs : 0,
      islrWithheldBs: applyIslr ? islrWithheldBs : 0,
      bcvRate,
      totalAmountUsd,
      taxableBaseUsd,
      vatAmountUsd,
      vatWithheldUsd,
      islrWithheldUsd,
      notes: notes.trim() || undefined,
      paymentTerm,
      creditDays: paymentTerm === 'CREDITO' ? creditDays : 0,
      dueDate: paymentTerm === 'CREDITO' ? dueDate : invoiceDate,
      currencyPricingMode,
      fiscalAdjustmentMode,
      inventoryLines: linkInventory ? inventoryLines.map(line => ({productId:line.productId,quantity:Number(line.quantity),unitCostBs:Number(line.unitCostBs)})) : undefined
      });
      if (linkInventory) {
        for (const line of inventoryLines) {
          const product = products.find(p => p.id === line.productId && p.companyId === currentCompany.id)!;
          const quantity = Number(line.quantity);
          const unitCostBs = Number(line.unitCostBs);
          addMovement({
            productId: product.id, productName: product.name, productCode: product.code,
            date: invoiceDate, type: 'ENTRADA', concept: 'COMPRA',
            documentRef: 'FAC-' + invoiceNumber.trim(), documentType: 'Factura de compra',
            counterpartyRif: formatRif(supplierRif), counterpartyName: supplierName.trim().toUpperCase(),
            bcvRate, quantity, unitCostBs, unitCostUsd: unitCostBs / bcvRate,
            totalCostBs: quantity * unitCostBs, totalCostUsd: quantity * unitCostBs / bcvRate,
            balanceQty: product.currentStock + quantity,
            balanceTotalBs: (product.currentStock + quantity) * product.avgCostBs,
            balanceTotalUsd: (product.currentStock + quantity) * product.avgCostUsd
          });
        }
      }
      });
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo registrar la compra. Verifica los datos e inténtalo nuevamente.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Registrar Factura de Compra (SENIAT)</h3>
              <p className="text-xs text-slate-400">
                Alimentará el Libro de Compras, generará el Asiento Contable y Comprobantes de Retención
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Supplier Info */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider block">
              1. Datos del Proveedor y Factura
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">RIF Proveedor *</label>
                <input
                  type="text"
                  required
                  placeholder="J-12345678-9"
                  value={supplierRif}
                  onChange={e => setSupplierRif(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg uppercase font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Nombre / Razón Social *</label>
                <input
                  type="text"
                  required
                  placeholder="PROVEEDOR NACIONAL, C.A."
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg uppercase focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Documento</label>
                <select
                  value={documentType}
                  onChange={e => setDocumentType(e.target.value as any)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="01">01 - Factura</option>
                  <option value="02" disabled>02 - Nota de Débito (flujo contable pendiente)</option>
                  <option value="03" disabled>03 - Nota de Crédito (usar Devolver en factura original)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fecha Emisión *</label>
                <input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">N° de Factura *</label>
                <input
                  type="text"
                  required
                  placeholder="00012345"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">N° de Control *</label>
                <input
                  type="text"
                  required
                  placeholder="00-001234"
                  value={controlNumber}
                  onChange={e => setControlNumber(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Tax Base & VAT */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider block">
                2. Montos e Impuesto al Valor Agregado (IVA)
              </span>
              <div className="text-slate-500 font-mono-nums">
                Tasa BCV: <strong>Bs. {bcvRate.toFixed(2)}</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Base Imponible (Bs.) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={taxableBaseBs || ''}
                  onChange={e => setTaxableBaseBs(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-500 font-mono">
                  {formatUsd(taxableBaseUsd)}
                </span>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Monto Exento / Exonerado (Bs.)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={exemptAmountBs || ''}
                  onChange={e => setExemptAmountBs(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alícuota IVA</label>
                <select
                  value={taxRate}
                  onChange={e => setTaxRate(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value={16}>16% (Alícuota General SENIAT)</option>
                  <option value={8}>8% (Alícuota Reducida)</option>
                  <option value={31}>31% (Alícuota General + Adicional Lujo)</option>
                  <option value={0}>0% (Exento)</option>
                </select>
              </div>
            </div>

            {/* Retention IVA Option */}
            <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Porcentaje de Retención de IVA
                </label>
                <select
                  value={retentionRate}
                  onChange={e => setRetentionRate(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value={0}>0% (Sin Retención - Contribuyente Ordinario)</option>
                  <option value={75}>75% (General para Contribuyentes Especiales)</option>
                  <option value={100}>100% (Retención Total SENIAT)</option>
                </select>
              </div>

              <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-emerald-800 block font-medium">IVA Retenido (Bs.):</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">{formatBs(vatWithheldBs)}</span>
                </div>
                <div className="text-right text-[11px] text-emerald-800 font-mono">
                  {formatUsd(vatWithheldUsd)}
                </div>
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider block">3. Método de pago e IGTF</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block font-semibold text-slate-700 mb-1">Método de pago previsto</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  <option value="BS">Bolívares / medios nacionales</option><option value="FOREIGN_CASH">Divisas en efectivo</option><option value="ZELLE">Zelle</option><option value="INTERNATIONAL_TRANSFER">Transferencia internacional</option><option value="CRYPTO">Criptoactivos</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-slate-700 font-semibold"><input type="checkbox" checked={applyIgtf} onChange={e => setApplyIgtf(e.target.checked)} disabled={paymentMethod === 'BS' || paymentTerm === 'CREDITO'} className="rounded text-amber-600"/> Aplicar IGTF 3% (confirmación fiscal)</label>
            </div>
            <div className="flex justify-between items-center text-sm"><span>IGTF calculado sobre subtotal</span><strong className="font-mono">{formatBs(igtfAmountBs)}</strong></div>\n            {paymentTerm === 'CREDITO' && <p className="text-xs text-amber-900 bg-amber-100 border border-amber-300 rounded-lg p-3">El IGTF no se anticipa en una factura a crédito. La obligación se evalúa cuando se realice el débito o se cancele la deuda; registre el impuesto en el flujo de pago cuando esté habilitado y conciliado.</p>}
            <p className="text-[11px] text-amber-900">Antes de activar el cálculo del IGTF, el contador debe validar que la operación esté sujeta al impuesto, la base imponible aplicable y el tratamiento contable y tributario vigente. El método de pago por sí solo no determina la obligación fiscal; active esta opción únicamente después de esa revisión.</p>
          </div>

          {/* ISLR Withholding Option */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyIslr}
                  onChange={e => setApplyIslr(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                3. Aplicar Retención de ISLR (Decreto 1808)
              </label>
              {applyIslr && (
                <span className="text-xs text-slate-500 font-mono">
                  Tarifa: <strong>{selectedConcept?.rate}%</strong>
                </span>
              )}
            </div>

            {applyIslr && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Concepto de Retención Oficial:
                  </label>
                  <select
                    value={islrConceptCode}
                    onChange={e => setIslrConceptCode(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    {ISLR_CONCEPTS.map(c => (
                      <option key={c.code} value={c.code}>
                        Cod. {c.code} ({c.rate}%) - {c.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-purple-50 p-2.5 rounded-lg border border-purple-200 text-xs">
                  <div>
                    <span className="text-[11px] text-purple-800 block">Sustraendo Legal (Bs.):</span>
                    <span className="font-mono font-bold text-purple-900">{formatBs(islrSubtrahendBs)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-purple-800 block">Monto ISLR a Retener:</span>
                    <span className="font-mono font-bold text-purple-900">{formatBs(islrWithheldBs)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl space-y-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider block">Vista previa del asiento contable</span>
            <div className="grid grid-cols-3 gap-2 font-semibold text-slate-600 border-b border-sky-200 pb-1"><span>Cuenta / concepto</span><span className="text-right">Debe (Bs.)</span><span className="text-right">Haber (Bs.)</span></div>
            {[
              {name: taxableBaseBs > 0 ? 'Inventario / compra' : 'Gasto / operación', debit: taxableBaseBs, credit: 0},
              ...(exemptAmountBs > 0 ? [{name:'Monto exento', debit:exemptAmountBs, credit:0}] : []),
              ...(vatAmountBs > 0 ? [{name:'Crédito fiscal IVA', debit:vatAmountBs, credit:0}] : []),
              ...(igtfAmountBs > 0 ? [{name:'Gasto por IGTF', debit:igtfAmountBs, credit:0}] : []),
              ...(vatWithheldBs > 0 ? [{name:'Retención IVA por enterar', debit:0, credit:vatWithheldBs}] : []),
              ...(islrWithheldBs > 0 ? [{name:'Retención ISLR por enterar', debit:0, credit:islrWithheldBs}] : []),
              {name:'Cuenta por pagar proveedor', debit:0, credit:Math.max(0,totalAmountBs-vatWithheldBs-islrWithheldBs)}
            ].map((line, index) => <div key={index} className="grid grid-cols-3 gap-2 text-slate-700"><span>{line.name}</span><span className="text-right font-mono">{formatBs(line.debit)}</span><span className="text-right font-mono">{formatBs(line.credit)}</span></div>)}
            <div className="grid grid-cols-3 gap-2 border-t border-sky-200 pt-2 font-bold"><span>Totales</span><span className="text-right font-mono">{formatBs(taxableBaseBs+exemptAmountBs+vatAmountBs+igtfAmountBs)}</span><span className="text-right font-mono">{formatBs(vatWithheldBs+islrWithheldBs+Math.max(0,totalAmountBs-vatWithheldBs-islrWithheldBs))}</span></div>
            <p className="text-[11px] text-slate-600">Vista previa estimada; la validación definitiva se ejecuta al guardar.</p>
          </div>

          {/* Condiciones de crédito y ajuste cambiario */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider block">4. Condiciones de pago/cobro y ajuste cambiario</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block font-semibold text-slate-700 mb-1">Condición de la operación</label><select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value as 'CONTADO' | 'CREDITO')} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"><option value="CONTADO" disabled>Contado (bloqueado hasta conciliar caja/banco)</option><option value="CREDITO">A crédito</option></select></div>
              {paymentTerm === 'CREDITO' && <div><label className="block font-semibold text-slate-700 mb-1">Plazo del crédito (días)</label><input type="number" min="1" max="3650" value={creditDays} onChange={e => setCreditDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"/><span className="text-[11px] text-slate-600">Vencimiento calculado: {dueDate}</span></div>}
            </div>
            {paymentTerm === 'CONTADO' && <p className="text-xs text-amber-900 bg-amber-100 border border-amber-300 rounded-lg p-3">El registro de compras de contado está temporalmente bloqueado: SICOVEN todavía no vincula de forma verificable el pago con la cuenta real de caja o banco. Selecciona “A crédito” únicamente si la factura realmente quedó pendiente con el proveedor. No registres como crédito una compra ya pagada.</p>}
            {paymentTerm === 'CREDITO' && <>
              <div><label className="block font-semibold text-slate-700 mb-1">Condición contractual del precio</label><select value={currencyPricingMode} onChange={e => setCurrencyPricingMode(e.target.value as typeof currencyPricingMode)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"><option value="USD_FIJO">Precio fijo en USD; liquidación según contrato</option><option value="BS_AJUSTABLE">Precio en Bs. ajustable por tasa BCV al liquidar</option><option value="REVISION_MANUAL">Otra condición; requiere revisión manual</option></select></div>
              <div><label className="block font-semibold text-slate-700 mb-1">Tratamiento del ajuste fiscal</label><select value={fiscalAdjustmentMode} onChange={e => setFiscalAdjustmentMode(e.target.value as typeof fiscalAdjustmentMode)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"><option value="IVA_ORIGINAL_DIF_CAMBIARIA">Conservar IVA original y evaluar diferencia cambiaria</option><option value="AJUSTE_BASE_IVA">Evaluar ajuste de base e IVA mediante documento aplicable</option><option value="REVISION_CONTADOR">Revisión del contador antes de registrar ajuste fiscal</option></select></div>
              <div className="rounded-lg bg-white border border-amber-200 p-3 text-[11px] text-slate-700">{currencyPricingMode === 'USD_FIJO' ? 'Se conserva el importe contractual en USD; se evaluará la diferencia cambiaria al liquidar.' : currencyPricingMode === 'BS_AJUSTABLE' ? 'Se calculará una variación preliminar del precio en Bs.; el efecto fiscal debe validarse antes de emitir documentos.' : 'La liquidación y el ajuste quedarán sujetos a revisión manual.'} La selección no modifica la factura original ni autoriza por sí sola emitir notas fiscales.</div>
            </>}
          </div>
          <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
            <div className="flex items-start gap-2">
              <input id="linkInventory" type="checkbox" checked={linkInventory} onChange={e=>setLinkInventory(e.target.checked)} className="mt-1" />
              <label htmlFor="linkInventory" className="font-bold text-slate-800">Vincular mercancía de esta factura con artículos existentes del Kardex</label>
            </div>
            <p className="text-[11px] text-slate-600">Actívalo solo si toda la base imponible y el monto exento corresponden a mercancía inventariable. Se crearán entradas de Kardex con referencia FAC-{invoiceNumber || 'número de factura'}; no se crearán artículos automáticamente.</p>
            {linkInventory && <>
              {inventoryLines.map((line,index)=><div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end rounded-lg bg-white border border-indigo-100 p-2">
                <div className="sm:col-span-6"><label className="block font-semibold mb-1">Artículo existente</label><select required value={line.productId} onChange={e=>setInventoryLines(prev=>prev.map((item,i)=>i===index?{...item,productId:e.target.value,unitCostBs:item.unitCostBs || String(products.find(p=>p.id===e.target.value)?.avgCostBs || 0)}:item))} className="w-full rounded border border-slate-300 p-2"><option value="">Seleccionar artículo…</option>{products.filter(p=>p.companyId===currentCompany.id).map(p=><option key={p.id} value={p.id}>{p.code} · {p.name} · Existencia {p.currentStock}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="block font-semibold mb-1">Cantidad</label><input required type="number" min="0.000001" step="0.000001" value={line.quantity} onChange={e=>setInventoryLines(prev=>prev.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))} className="w-full rounded border border-slate-300 p-2"/></div>
                <div className="sm:col-span-3"><label className="block font-semibold mb-1">Costo unitario Bs.</label><input required type="number" min="0.000001" step="0.01" value={line.unitCostBs} onChange={e=>setInventoryLines(prev=>prev.map((item,i)=>i===index?{...item,unitCostBs:e.target.value}:item))} className="w-full rounded border border-slate-300 p-2"/></div>
                <div className="sm:col-span-1"><button type="button" disabled={inventoryLines.length===1} onClick={()=>setInventoryLines(prev=>prev.filter((_,i)=>i!==index))} className="w-full rounded border border-red-200 px-2 py-2 text-red-700 disabled:opacity-30" aria-label="Eliminar línea">×</button></div>
              </div>)}
              <button type="button" onClick={()=>setInventoryLines(prev=>[...prev,{productId:'',quantity:'1',unitCostBs:''}])} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 font-semibold text-indigo-800">+ Añadir artículo</button>
              <div className={Math.abs(inventoryLineTotal-(taxableBaseBs+exemptAmountBs))<=0.02 && inventoryLinesValid?'text-emerald-700':'text-rose-700'}>
                <strong>Total líneas:</strong> {formatBs(inventoryLineTotal)} · <strong>Base + exento:</strong> {formatBs(taxableBaseBs+exemptAmountBs)}
              </div>
              {!inventoryLinesValid && <p className="text-rose-700 font-semibold">Las líneas no concilian; no se permitirá guardar.</p>}
            </>}
          </div>

          {/* Summary Box */}
          <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Total Compra con IVA:</span>
              <span className="font-mono font-bold">{formatBs(totalAmountBs)} ({formatUsd(totalAmountUsd)})</span>
            </div>
            <div className="flex justify-between items-center text-xs text-rose-300">
              <span>(-) Retención IVA ({retentionRate}%):</span>
              <span className="font-mono">-{formatBs(vatWithheldBs)}</span>
            </div>
            {applyIslr && (
              <div className="flex justify-between items-center text-xs text-purple-300">
                <span>(-) Retención ISLR:</span>
                <span className="font-mono">-{formatBs(islrWithheldBs)}</span>
              </div>
            )}
            <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm font-bold text-emerald-400">
              <span>(=) Neto a Cancelar al Proveedor:</span>
              <span className="font-mono">{formatBs(netPayableBs)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={totalAmountBs <= 0}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              Guardar Compra y Generar Asientos
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
