import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  ShoppingCart,
  Plus,
  Printer,
  Download,
  Search,
  Receipt,
  FileSpreadsheet,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';
import { NewPurchaseModal } from './NewPurchaseModal';
import { CreditSettlementModal } from '../shared/CreditSettlementModal';
import { generateSeniatIvaTxt, downloadFile } from '../../utils/seniatGenerators';
import { CompanyLogoHeader } from '../CompanyLogoHeader';
import { exportComprasPdf } from '../../utils/pdfGenerator';
import { PurchaseCreditNoteModal } from './PurchaseCreditNoteModal';
import type { PurchaseRecord } from '../../types/accounting';

export const LibroComprasView: React.FC = () => {
  const {
    currentCompany,
    purchases,
    vatVouchers,
    isStorageReady,
    displayCurrency
  } = useAccounting();

  const sqliteAvailable = typeof window !== 'undefined' && Boolean(window.sicovenStore?.save);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creditNoteTarget, setCreditNoteTarget] = useState<PurchaseRecord | null>(null);
  const [settlementTarget, setSettlementTarget] = useState<{id:string; number:string; party:string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportComprasPdf(currentCompany, filteredPurchases, monthFilter);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const filteredPurchases = purchases
    .filter(p => {
      if (monthFilter && !p.invoiceDate.startsWith(monthFilter)) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          p.supplierName.toLowerCase().includes(term) ||
          p.supplierRif.toLowerCase().includes(term) ||
          p.invoiceNumber.toLowerCase().includes(term) ||
          p.controlNumber.toLowerCase().includes(term) ||
          (p.voucherNumber && p.voucherNumber.toLowerCase().includes(term))
        );
      }
      return true;
    })
    .sort((a, b) => a.opNumber - b.opNumber);

  // Totals for SENIAT Forma 30
  const sign = (purchase: PurchaseRecord) => purchase.documentType === '03' ? -1 : 1;
  const signed = (purchase: PurchaseRecord, amount: number) => sign(purchase) * Number(amount || 0);
  const totalComprasConIvaBs = filteredPurchases.reduce((s, p) => s + signed(p, p.totalAmountBs), 0);
  const totalIgtfBs = filteredPurchases.reduce((s, p) => s + signed(p, p.igtfAmountBs || 0), 0);
  const totalExentoBs = filteredPurchases.reduce((s, p) => s + signed(p, p.exemptAmountBs || 0), 0);
  const totalBaseBs = filteredPurchases.reduce((s, p) => s + signed(p, p.taxableBaseBs), 0);
  const totalIvaCreditoBs = filteredPurchases.reduce((s, p) => s + signed(p, p.vatAmountBs), 0);
  const totalIvaRetenidoBs = filteredPurchases.reduce((s, p) => s + signed(p, p.vatWithheldBs || 0), 0);
  const totalIslrRetenidoBs = filteredPurchases.reduce((s, p) => s + signed(p, p.islrWithheldBs || 0), 0);

  const totalComprasConIvaUsd = filteredPurchases.reduce((s, p) => s + signed(p, p.totalAmountUsd), 0);
  const totalBaseUsd = filteredPurchases.reduce((s, p) => s + signed(p, p.taxableBaseUsd), 0);
  const totalIvaCreditoUsd = filteredPurchases.reduce((s, p) => s + signed(p, p.vatAmountUsd), 0);
  const totalIvaRetenidoUsd = filteredPurchases.reduce((s, p) => s + signed(p, p.vatWithheldUsd || 0), 0);

  const handleDownloadTxt = () => {
    const periodVouchers = vatVouchers.filter(v => v.companyId === currentCompany.id);
    if (periodVouchers.length === 0) {
      alert('No hay retenciones de IVA registradas para generar el archivo TXT.');
      return;
    }
    const txtContent = generateSeniatIvaTxt(currentCompany, periodVouchers);
    const cleanR = currentCompany.rif.replace(/[^A-Za-z0-9]/g, '');
    const period = periodVouchers[0]?.period || `${currentCompany.fiscalYear}10`;
    downloadFile(txtContent, `RetencionesIVA_${cleanR}_${period}.txt`);
  };

  return (
    <div className="space-y-6">
      {/* Official SENIAT Header with Company Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <CompanyLogoHeader
          company={currentCompany}
          reportTitle="Libro de Compras (SENIAT)"
          subtitle="Conforme al Art. 75 del Reglamento de la Ley de Impuesto al Valor Agregado"
          periodText={`Período Impositivo: ${monthFilter || `${currentCompany.fiscalYear}-10`}`}
        />

        {/* Action buttons (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Documentos Registrados: <strong className="text-slate-900">{filteredPurchases.length}</strong></span>
            <span>•</span>
            <span className="text-indigo-700 font-medium">Libro Fiscal Reglamentario</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || filteredPurchases.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300 shadow-sm"
              title="Descargar archivo PDF oficial del Libro de Compras con logo y márgenes SENIAT"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF Oficial'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Libro
            </button>
            {currentCompany.taxpayerType === 'ESPECIAL' && (
              <button
                onClick={handleDownloadTxt}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition cursor-pointer border border-indigo-200 shadow-sm"
                title="Generar archivo TXT oficial para el portal SENIAT"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar TXT IVA
              </button>
            )}
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Registrar Compra
            </button>
          </div>
        </div>

        {/* Toolbar (no-print) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 no-print">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por RIF, proveedor, factura o comprobante..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <input
              type="month"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              title="Filtrar por período mensual (AAAA-MM)"
            />
          </div>

          <div className="flex items-center justify-end text-xs text-slate-500">
            <span>Facturas Registradas: <strong className="text-slate-800">{filteredPurchases.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold whitespace-nowrap">
                <th className="py-2.5 px-3 text-center w-12">Op. N°</th>
                <th className="py-2.5 px-3 w-24">Fecha</th>
                <th className="py-2.5 px-3 min-w-[150px]">Condición / Vencimiento</th>
                <th className="py-2.5 px-3 w-28">RIF Proveedor</th>
                <th className="py-2.5 px-3 min-w-[200px]">Nombre o Razón Social</th>
                <th className="py-2.5 px-3 w-28">N° Factura</th>
                <th className="py-2.5 px-3 w-28">N° Control</th>
                <th className="py-2.5 px-3 w-32">N° Comprobante Ret.</th>
                <th className="py-2.5 px-3 text-right w-32">Total Compra (Bs.)</th>
                <th className="py-2.5 px-3 text-right w-28 text-amber-800">IGTF (Bs.)</th>
                <th className="py-2.5 px-3 text-right w-28">Exento (Bs.)</th>
                <th className="py-2.5 px-3 text-right w-32">Base Imponible</th>
                <th className="py-2.5 px-2 text-center w-14">% Alíc.</th>
                <th className="py-2.5 px-3 text-right w-28 text-emerald-800">IVA (Crédito)</th>
                <th className="py-2.5 px-3 text-right w-28 text-purple-800">IVA Retenido</th>
                <th className="py-2.5 px-3 text-right w-28 text-indigo-800">ISLR Retenido</th>
                <th className="py-2.5 px-2 text-center w-12 no-print">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={17} className="py-12 text-center text-slate-400">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay facturas de compras registradas en este período.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-600 bg-slate-50/50">
                      {p.opNumber}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(p.invoiceDate)}
                    </td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">
                      <span className={`inline-flex rounded px-1.5 py-0.5 font-semibold ${p.paymentTerm === 'CREDITO' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{p.paymentTerm === 'CREDITO' ? 'CRÉDITO' : p.paymentTerm === 'CONTADO' ? 'CONTADO' : 'SIN DEFINIR'}</span>
                      {p.paymentTerm === 'CREDITO' && <div className="text-slate-500 mt-1">Vence: {p.dueDate ? formatDate(p.dueDate) : 'Sin fecha'}</div>}
                      {p.paymentTerm === 'CREDITO' && <div className="text-slate-400">{p.currencyPricingMode === 'USD_FIJO' ? 'USD fijo' : p.currencyPricingMode === 'BS_AJUSTABLE' ? 'Bs. ajustable' : 'Revisión manual'}</div>}
                    </td>
                    <td className="py-2 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                      {p.supplierRif}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 truncate max-w-xs" title={p.supplierName}>
                      {p.supplierName}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {p.documentType === '03' ? 'NC · ' : p.documentType === '02' ? 'ND · ' : ''}{p.invoiceNumber}
                      {p.documentType === '03' && <span className="ml-1 inline-flex rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-800">NOTA CRÉDITO</span>}
                      {p.affectedInvoiceNumber && <span className="block text-[10px] text-slate-500">Afecta: {p.affectedInvoiceNumber}</span>}
                      {p.isCancelled && <span title={p.cancellationNote || 'Pendiente regularización fiscal'} className="ml-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">REVERSADA CONTABLE</span>}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {p.controlNumber}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-purple-700 whitespace-nowrap font-medium">
                      {p.voucherNumber || '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      {formatBs(signed(p, p.totalAmountBs))}
                      {displayCurrency !== 'BS' && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          {formatUsd(signed(p, p.totalAmountUsd))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-amber-700 whitespace-nowrap">
                      {Number(p.igtfAmountBs || 0) > 0 ? formatBs(signed(p, Number(p.igtfAmountBs))) : '-'}
                      {p.paymentMethod && <div className="text-[10px] text-slate-400 font-normal">{({BS:'Bs./nacional',FOREIGN_CASH:'Divisas efectivo',ZELLE:'Zelle',INTERNATIONAL_TRANSFER:'Transferencia intl.',CRYPTO:'Cripto'} as Record<string,string>)[p.paymentMethod] || p.paymentMethod}</div>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      {p.exemptAmountBs > 0 ? formatBs(signed(p, p.exemptAmountBs)) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {formatBs(signed(p, p.taxableBaseBs))}
                      {displayCurrency !== 'BS' && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          {formatUsd(signed(p, p.taxableBaseUsd))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-slate-600">
                      {p.taxRate}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap bg-emerald-50/30">
                      {formatBs(signed(p, p.vatAmountBs))}
                      {displayCurrency !== 'BS' && (
                        <div className="text-[10px] text-emerald-600/70 font-normal">
                          {formatUsd(signed(p, p.vatAmountUsd))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-purple-700 whitespace-nowrap bg-purple-50/30">
                      {p.vatWithheldBs > 0 ? (
                        <>
                          {formatBs(signed(p, p.vatWithheldBs))}
                          <span className="text-[10px] block text-purple-500 font-normal">({p.retentionRate}%)</span>
                        </>
                      ) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-indigo-700 whitespace-nowrap">
                      {p.islrWithheldBs && p.islrWithheldBs > 0 ? (
                        <>
                          {formatBs(signed(p, p.islrWithheldBs))}
                          <span className="text-[10px] block text-indigo-400">({p.islrRate}%)</span>
                        </>
                      ) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center no-print">
                      {p.documentType === '01' && p.paymentTerm === 'CREDITO' && <button onClick={() => setSettlementTarget({id:p.id, number:p.invoiceNumber, party:p.supplierName})} className="mr-1 rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100" title="Registrar pago parcial o total">Pagar</button>}
                      {p.documentType === '01' && !p.isCancelled && <button
                        onClick={() => setCreditNoteTarget(p)}
                        disabled={!sqliteAvailable || !isStorageReady || p.paymentTerm !== 'CREDITO' || !p.inventoryLines?.length}
                        className="mr-1 inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title={p.paymentTerm !== 'CREDITO' ? 'Compras de contado requieren conciliación de caja/bancos' : !p.inventoryLines?.length ? 'Factura sin líneas de inventario conciliables' : 'Registrar nota de crédito y devolución física'}
                      ><RotateCcw className="h-3 w-3" />Devolver</button>}
                      {p.documentType === '01' && <button
                        onClick={() => window.alert('Esta factura ya está contabilizada y no se puede eliminar físicamente. Para corregirla debe habilitarse el flujo de anulación con asiento reverso y ajuste de los libros fiscales.')}
                        className="p-1 text-slate-400 hover:text-amber-600 transition cursor-pointer"
                        title="Anulación con reversión contable pendiente"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold border-t border-slate-800 whitespace-nowrap">
                <td colSpan={8} className="py-3 px-3 text-right text-slate-300">
                  TOTALES LIBRO DE COMPRAS (SENIAT):
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-400">
                  {formatBs(totalComprasConIvaBs)}
                  {displayCurrency !== 'BS' && (
                    <div className="text-[10px] text-slate-400">{formatUsd(totalComprasConIvaUsd)}</div>
                  )}
                </td>
                <td className="py-3 px-3 text-right font-mono text-amber-300">
                  {formatBs(totalIgtfBs)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-slate-300">
                  {formatBs(totalExentoBs)}
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-400">
                  {formatBs(totalBaseBs)}
                  {displayCurrency !== 'BS' && (
                    <div className="text-[10px] text-slate-400">{formatUsd(totalBaseUsd)}</div>
                  )}
                </td>
                <td></td>
                <td className="py-3 px-3 text-right font-mono text-emerald-400 bg-slate-850">
                  {formatBs(totalIvaCreditoBs)}
                  {displayCurrency !== 'BS' && (
                    <div className="text-[10px] text-slate-400">{formatUsd(totalIvaCreditoUsd)}</div>
                  )}
                </td>
                <td className="py-3 px-3 text-right font-mono text-purple-300 bg-slate-850">
                  {formatBs(totalIvaRetenidoBs)}
                  {displayCurrency !== 'BS' && (
                    <div className="text-[10px] text-slate-400">{formatUsd(totalIvaRetenidoUsd)}</div>
                  )}
                </td>
                <td className="py-3 px-3 text-right font-mono text-indigo-300">
                  {formatBs(totalIslrRetenidoBs)}
                </td>
                <td className="no-print"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Forma 30 SENIAT Summary Card */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-850 text-white p-5 rounded-2xl shadow-md border border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Resumen para la Declaración Mensual del IVA (Forma 30 SENIAT)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono-nums">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block">Total Compras Internas Gravadas:</span>
            <span className="text-base font-bold text-white mt-1 block">{formatBs(totalBaseBs)}</span>
            <span className="text-[10px] text-slate-400">{formatUsd(totalBaseUsd)}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block">Crédito Fiscal Total (16%):</span>
            <span className="text-base font-bold text-emerald-400 mt-1 block">{formatBs(totalIvaCreditoBs)}</span>
            <span className="text-[10px] text-slate-400">{formatUsd(totalIvaCreditoUsd)}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block">Retenciones de IVA Enteradas:</span>
            <span className="text-base font-bold text-purple-300 mt-1 block">{formatBs(totalIvaRetenidoBs)}</span>
            <span className="text-[10px] text-slate-400">{formatUsd(totalIvaRetenidoUsd)}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block">Compras Exentas y No Sujetas:</span>
            <span className="text-base font-bold text-slate-300 mt-1 block">{formatBs(totalExentoBs)}</span>
          </div>
        </div>
      </div>

      {/* Official Signatures block (print-only) */}
      <div className="hidden print:grid grid-cols-2 gap-12 pt-12 pb-6 text-xs print-break-inside-avoid">
        <div className="text-center space-y-1">
          <div className="border-t border-slate-900 w-48 mx-auto pt-2 font-bold text-slate-900">
            CONTADOR PÚBLICO COLEGIADO
          </div>
          <div className="text-[11px] text-slate-500">C.P.C. N° ___________</div>
        </div>
        <div className="text-center space-y-1">
          <div className="border-t border-slate-900 w-48 mx-auto pt-2 font-bold text-slate-900">
            REPRESENTANTE LEGAL
          </div>
          <div className="text-[11px] text-slate-500">{currentCompany.name}</div>
        </div>
      </div>

      <NewPurchaseModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      {creditNoteTarget && <PurchaseCreditNoteModal purchase={creditNoteTarget} onClose={() => setCreditNoteTarget(null)} />}
      {settlementTarget && <CreditSettlementModal documentId={settlementTarget.id} documentNumber={settlementTarget.number} partyName={settlementTarget.party} kind="PURCHASE_PAYMENT" onClose={() => setSettlementTarget(null)} />}
    </div>
  );
};
