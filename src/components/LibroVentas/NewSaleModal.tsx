import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { TrendingUp, X, Check } from 'lucide-react';
import { formatBs, formatUsd, formatRif } from '../../utils/formatters';

interface NewSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewSaleModal: React.FC<NewSaleModalProps> = ({ isOpen, onClose }) => {
  const { currentCompany, addSale } = useAccounting();

  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customerRif, setCustomerRif] = useState<string>('J-');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [controlNumber, setControlNumber] = useState<string>('');
  const [documentType, setDocumentType] = useState<'01' | '02' | '03'>('01');
  const [affectedInvoiceNumber, setAffectedInvoiceNumber] = useState<string>('');

  // Amounts
  const [taxableBaseBs, setTaxableBaseBs] = useState<number>(0);
  const [exemptAmountBs, setExemptAmountBs] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(16);

  // Client Withholding
  const [clientIsSpecial, setClientIsSpecial] = useState<boolean>(false);
  const [retentionRate, setRetentionRate] = useState<number>(75);
  const [retentionVoucherNumber, setRetentionVoucherNumber] = useState<string>('');

  // Currency
  const [bcvRate, setBcvRate] = useState<number>(currentCompany.bcvRate || 68.50);
  const [notes, setNotes] = useState<string>('');
  const [paymentTerm, setPaymentTerm] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [creditDays, setCreditDays] = useState<number>(7);
  const [currencyPricingMode, setCurrencyPricingMode] = useState<'USD_FIJO' | 'BS_AJUSTABLE' | 'REVISION_MANUAL'>('USD_FIJO');
  const [fiscalAdjustmentMode, setFiscalAdjustmentMode] = useState<'IVA_ORIGINAL_DIF_CAMBIARIA' | 'AJUSTE_BASE_IVA' | 'REVISION_CONTADOR'>('REVISION_CONTADOR');
  const dueDate = (() => { const d = new Date(invoiceDate + 'T12:00:00'); d.setDate(d.getDate() + creditDays); return d.toISOString().slice(0, 10); })();

  if (!isOpen) return null;

  // Real-time calculations
  const vatAmountBs = Math.round(taxableBaseBs * (taxRate / 100) * 100) / 100;
  const totalAmountBs = Math.round((taxableBaseBs + exemptAmountBs + vatAmountBs) * 100) / 100;
  const vatWithheldBs = clientIsSpecial
    ? Math.round(vatAmountBs * (retentionRate / 100) * 100) / 100
    : 0;

  const totalAmountUsd = bcvRate > 0 ? totalAmountBs / bcvRate : 0;
  const taxableBaseUsd = bcvRate > 0 ? taxableBaseBs / bcvRate : 0;
  const vatAmountUsd = bcvRate > 0 ? vatAmountBs / bcvRate : 0;
  const vatWithheldUsd = bcvRate > 0 ? vatWithheldBs / bcvRate : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerRif.trim() || !customerName.trim() || !invoiceNumber.trim()) return;
    if (totalAmountBs <= 0) return;

    addSale({
      invoiceDate,
      customerRif: formatRif(customerRif),
      customerName: customerName.trim().toUpperCase(),
      customerAddress: customerAddress.trim() || undefined,
      invoiceNumber: invoiceNumber.trim(),
      controlNumber: controlNumber.trim() || `00-${invoiceNumber.trim()}`,
      documentType,
      affectedInvoiceNumber: affectedInvoiceNumber.trim() || undefined,
      totalAmountBs,
      exemptAmountBs,
      taxableBaseBs,
      taxRate,
      vatAmountBs,
      vatWithheldBs,
      retentionRate: clientIsSpecial ? retentionRate : 0,
      retentionVoucherNumber: clientIsSpecial ? retentionVoucherNumber.trim() : undefined,
      bcvRate,
      totalAmountUsd,
      taxableBaseUsd,
      vatAmountUsd,
      vatWithheldUsd,
      notes: notes.trim() || undefined,
      paymentTerm,
      creditDays: paymentTerm === 'CREDITO' ? creditDays : 0,
      dueDate: paymentTerm === 'CREDITO' ? dueDate : invoiceDate,
      currencyPricingMode,
      fiscalAdjustmentMode
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Registrar Factura de Venta (SENIAT)</h3>
              <p className="text-xs text-slate-400">
                Alimentará el Libro de Ventas y generará el Asiento Contable correspondiente
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Client Info */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider block">
              1. Datos del Cliente y Factura Emitida
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">RIF Cliente *</label>
                <input
                  type="text"
                  required
                  placeholder="J-12345678-9"
                  value={customerRif}
                  onChange={e => setCustomerRif(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg uppercase font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Razón Social o Nombre *</label>
                <input
                  type="text"
                  required
                  placeholder="CLIENTE COMERCIAL, C.A."
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
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
                  <option value="02">02 - Nota de Débito</option>
                  <option value="03">03 - Nota de Crédito</option>
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
                  placeholder="00008500"
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
                  placeholder="00-001250"
                  value={controlNumber}
                  onChange={e => setControlNumber(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Amounts & Tax */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider block">
              2. Montos e Impuesto al Valor Agregado (Débito Fiscal)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Base Imponible Gravada (Bs.) *</label>
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
                  <option value={16}>16% (Alícuota General)</option>
                  <option value={8}>8% (Alícuota Reducida)</option>
                  <option value={31}>31% (Alícuota General + Adicional Lujo)</option>
                  <option value={0}>0% (Exento)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Client Retention */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <label className="flex items-center gap-2 font-bold text-slate-800 uppercase tracking-wider cursor-pointer">
              <input
                type="checkbox"
                checked={clientIsSpecial}
                onChange={e => setClientIsSpecial(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              3. ¿El cliente es Contribuyente Especial y emitió Comprobante de Retención de IVA?
            </label>

            {clientIsSpecial && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">% Retenido por el Cliente</label>
                  <select
                    value={retentionRate}
                    onChange={e => setRetentionRate(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value={75}>75% (General)</option>
                    <option value={100}>100%</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">N° Comprobante Recibido</label>
                  <input
                    type="text"
                    placeholder="20261000001234"
                    value={retentionVoucherNumber}
                    onChange={e => setRetentionVoucherNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-[11px] text-emerald-800 block">IVA que nos retuvieron:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">{formatBs(vatWithheldBs)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Condiciones de crédito y ajuste cambiario */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <span className="font-bold text-slate-800 uppercase tracking-wider block">4. Condiciones de pago/cobro y ajuste cambiario</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block font-semibold text-slate-700 mb-1">Condición de la operación</label><select value={paymentTerm} onChange={e => setPaymentTerm(e.target.value as 'CONTADO' | 'CREDITO')} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"><option value="CONTADO">Contado</option><option value="CREDITO">A crédito</option></select></div>
              {paymentTerm === 'CREDITO' && <div><label className="block font-semibold text-slate-700 mb-1">Plazo del crédito (días)</label><input type="number" min="1" max="3650" value={creditDays} onChange={e => setCreditDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"/><span className="text-[11px] text-slate-600">Vencimiento calculado: {dueDate}</span></div>}
            </div>
            {paymentTerm === 'CREDITO' && <>
              <div><label className="block font-semibold text-slate-700 mb-1">Condición contractual del precio</label><select value={currencyPricingMode} onChange={e => setCurrencyPricingMode(e.target.value as typeof currencyPricingMode)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"><option value="USD_FIJO">Precio fijo en USD; liquidación según contrato</option><option value="BS_AJUSTABLE">Precio en Bs. ajustable por tasa BCV al liquidar</option><option value="REVISION_MANUAL">Otra condición; requiere revisión manual</option></select></div>
              <div><label className="block font-semibold text-slate-700 mb-1">Tratamiento del ajuste fiscal</label><select value={fiscalAdjustmentMode} onChange={e => setFiscalAdjustmentMode(e.target.value as typeof fiscalAdjustmentMode)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"><option value="IVA_ORIGINAL_DIF_CAMBIARIA">Conservar IVA original y evaluar diferencia cambiaria</option><option value="AJUSTE_BASE_IVA">Evaluar ajuste de base e IVA mediante documento aplicable</option><option value="REVISION_CONTADOR">Revisión del contador antes de registrar ajuste fiscal</option></select></div>
              <div className="rounded-lg bg-white border border-amber-200 p-3 text-[11px] text-slate-700">{currencyPricingMode === 'USD_FIJO' ? 'Se conserva el importe contractual en USD; se evaluará la diferencia cambiaria al liquidar.' : currencyPricingMode === 'BS_AJUSTABLE' ? 'Se calculará una variación preliminar del precio en Bs.; el efecto fiscal debe validarse antes de emitir documentos.' : 'La liquidación y el ajuste quedarán sujetos a revisión manual.'} La selección no modifica la factura original ni autoriza por sí sola emitir notas fiscales.</div>
            </>}
          </div>
          {/* Summary Box */}
          <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Total Factura de Venta con IVA:</span>
              <span className="font-mono font-bold">{formatBs(totalAmountBs)} ({formatUsd(totalAmountUsd)})</span>
            </div>
            {clientIsSpecial && (
              <div className="flex justify-between items-center text-xs text-emerald-300">
                <span>(-) Retención IVA por Compensar:</span>
                <span className="font-mono">-{formatBs(vatWithheldBs)}</span>
              </div>
            )}
            <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm font-bold text-emerald-400">
              <span>(=) Saldo por Cobrar al Cliente:</span>
              <span className="font-mono">{formatBs(totalAmountBs - vatWithheldBs)}</span>
            </div>
          </div>

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
              Guardar Factura de Venta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
