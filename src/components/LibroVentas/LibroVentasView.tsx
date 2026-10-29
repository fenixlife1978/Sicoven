import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  TrendingUp,
  Plus,
  Printer,
  Search,
  Trash2,
  Calendar,
  CheckCircle2,
  Receipt,
  Download
} from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';
import { NewSaleModal } from './NewSaleModal';
import { CreditSettlementModal } from '../shared/CreditSettlementModal';
import { CompanyLogoHeader } from '../CompanyLogoHeader';
import { exportVentasPdf } from '../../utils/pdfGenerator';

export const LibroVentasView: React.FC = () => {
  const {
    currentCompany,
    sales,
    deleteSale,
    displayCurrency
  } = useAccounting();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState<{id:string; number:string; party:string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportVentasPdf(currentCompany, filteredSales, monthFilter);
    } catch (err) {
      console.error('Error exporting Ventas PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const filteredSales = sales
    .filter(s => {
      if (monthFilter && !s.invoiceDate.startsWith(monthFilter)) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          s.customerName.toLowerCase().includes(term) ||
          s.customerRif.toLowerCase().includes(term) ||
          s.invoiceNumber.toLowerCase().includes(term) ||
          s.controlNumber.toLowerCase().includes(term) ||
          (s.retentionVoucherNumber && s.retentionVoucherNumber.toLowerCase().includes(term))
        );
      }
      return true;
    })
    .sort((a, b) => a.opNumber - b.opNumber);

  // Totals for SENIAT Forma 30
  const totalVentasConIvaBs = filteredSales.reduce((s, x) => s + x.totalAmountBs, 0);
  const totalExentoBs = filteredSales.reduce((s, x) => s + (x.exemptAmountBs || 0), 0);
  const totalBaseBs = filteredSales.reduce((s, x) => s + x.taxableBaseBs, 0);
  const totalIvaDebitoBs = filteredSales.reduce((s, x) => s + x.vatAmountBs, 0);
  const totalIvaRetenidoBs = filteredSales.reduce((s, x) => s + (x.vatWithheldBs || 0), 0);
  const totalIgtfBs = filteredSales.reduce((s, x) => s + (x.igtfAmountBs || 0), 0);

  const totalVentasConIvaUsd = filteredSales.reduce((s, x) => s + x.totalAmountUsd, 0);
  const totalBaseUsd = filteredSales.reduce((s, x) => s + x.taxableBaseUsd, 0);
  const totalIvaDebitoUsd = filteredSales.reduce((s, x) => s + x.vatAmountUsd, 0);
  const totalIvaRetenidoUsd = filteredSales.reduce((s, x) => s + (x.vatWithheldUsd || 0), 0);

  return (
    <div className="space-y-6">
      {/* Official SENIAT Header with Company Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <CompanyLogoHeader
          company={currentCompany}
          reportTitle="Libro de Ventas (SENIAT)"
          subtitle="Conforme al Art. 76 del Reglamento de la Ley de Impuesto al Valor Agregado"
          periodText={`Período Impositivo: ${monthFilter || `${currentCompany.fiscalYear}-10`}`}
        />

        {/* Action buttons (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Facturas Registradas: <strong className="text-slate-900">{filteredSales.length}</strong></span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">Libro Fiscal Reglamentario</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || filteredSales.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300 shadow-sm"
              title="Descargar archivo PDF oficial del Libro de Ventas con logo y márgenes SENIAT"
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
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Registrar Venta
            </button>
          </div>
        </div>

        {/* Toolbar (no-print) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 no-print">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por RIF, cliente o factura..."
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
            <span>Facturas Emitidas: <strong className="text-slate-800">{filteredSales.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold whitespace-nowrap">
                <th className="py-2.5 px-3 text-center w-12">Op. N°</th>
                <th className="py-2.5 px-3 w-24">Fecha</th>
                <th className="py-2.5 px-3 min-w-[150px]">Condición / Vencimiento</th>
                <th className="py-2.5 px-3 w-28">RIF Cliente</th>
                <th className="py-2.5 px-3 min-w-[200px]">Nombre o Razón Social</th>
                <th className="py-2.5 px-3 w-28">N° Factura</th>
                <th className="py-2.5 px-3 w-28">N° Control</th>
                <th className="py-2.5 px-3 text-right w-32">Total Ventas (Bs.)</th>
                <th className="py-2.5 px-3 text-right w-28">Exento (Bs.)</th>
                <th className="py-2.5 px-3 text-right w-32">Base Imponible</th>
                <th className="py-2.5 px-2 text-center w-14">% Alíc.</th>
                <th className="py-2.5 px-3 text-right w-28 text-emerald-800">IVA (Débito)</th>
                <th className="py-2.5 px-3 text-right w-28 text-purple-800">IVA Retenido</th>
                <th className="py-2.5 px-3 w-32">N° Comprobante Ret.</th>
                <th className="py-2.5 px-3 w-28">Fecha Ret.</th>
                <th className="py-2.5 px-3 text-right w-28">IGTF (Bs.)</th>
                <th className="py-2.5 px-2 text-center w-12 no-print">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={17} className="py-12 text-center text-slate-400">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay facturas de ventas emitidas en este período.
                  </td>
                </tr>
              ) : (
                filteredSales.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="py-2 px-3 text-center font-mono font-bold text-slate-600 bg-slate-50/50">
                      {s.opNumber}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(s.invoiceDate)}
                    </td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">
                      <span className={`inline-flex rounded px-1.5 py-0.5 font-semibold ${s.paymentTerm === 'CREDITO' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{s.paymentTerm === 'CREDITO' ? 'CRÉDITO' : s.paymentTerm === 'CONTADO' ? 'CONTADO' : 'SIN DEFINIR'}</span>
                      {s.paymentTerm === 'CREDITO' && <div className="text-slate-500 mt-1">Vence: {s.dueDate ? formatDate(s.dueDate) : 'Sin fecha'}</div>}
                      {s.paymentTerm === 'CREDITO' && <div className="text-slate-400">{s.currencyPricingMode === 'USD_FIJO' ? 'USD fijo' : s.currencyPricingMode === 'BS_AJUSTABLE' ? 'Bs. ajustable' : 'Revisión manual'}</div>}
                    </td>
                    <td className="py-2 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                      {s.customerRif}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 truncate max-w-xs" title={s.customerName}>
                      {s.customerName}
                    </td>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {s.invoiceNumber}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {s.controlNumber}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      {formatBs(s.totalAmountBs)}
                      {displayCurrency !== 'BS' && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          {formatUsd(s.totalAmountUsd)}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      {s.exemptAmountBs > 0 ? formatBs(s.exemptAmountBs) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {formatBs(s.taxableBaseBs)}
                      {displayCurrency !== 'BS' && (
                        <div className="text-[10px] text-slate-400 font-normal">
                          {formatUsd(s.taxableBaseUsd)}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-slate-600">
                      {s.taxRate}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap bg-emerald-50/30">
                      {formatBs(s.vatAmountBs)}
                      {displayCurrency !== 'BS' && (
                        <div className="text-[10px] text-emerald-600/70 font-normal">
                          {formatUsd(s.vatAmountUsd)}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-purple-700 whitespace-nowrap bg-purple-50/30">
                      {s.vatWithheldBs > 0 ? (
                        <>
                          {formatBs(s.vatWithheldBs)}
                          {s.retentionRate ? <span className="text-[10px] block text-purple-500 font-normal">({s.retentionRate}%)</span> : null}
                        </>
                      ) : '-'}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-purple-700 whitespace-nowrap">
                      {s.retentionVoucherNumber || '-'}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-purple-700 whitespace-nowrap">
                      {s.retentionVoucherDate ? formatDate(s.retentionVoucherDate) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sky-700 whitespace-nowrap">
                      {(s.igtfAmountBs || 0) > 0 ? formatBs(s.igtfAmountBs || 0) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center no-print">
                      {s.paymentTerm === 'CREDITO' && <button onClick={() => setSettlementTarget({id:s.id, number:s.invoiceNumber, party:s.customerName})} className="mr-1 rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100" title="Registrar cobro parcial o total">Cobrar</button>}
                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar factura de venta N° ${s.invoiceNumber}?`)) {
                            deleteSale(s.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Eliminar registro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold border-t border-slate-800 whitespace-nowrap">
                <td colSpan={7} className="py-3 px-3 text-right text-slate-300">
                  TOTALES LIBRO DE VENTAS (SENIAT):
                </td>
                <td className="py-3 px-3 text-right font-mono text-emerald-400">
                  {formatBs(totalVentasConIvaBs)}
                  {displayCurrency !== 'BS' && (
                    <div className="text-[10px] text-slate-400">{formatUsd(totalVentasConIvaUsd)}</div>
                  )}
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
                  {formatBs(totalIvaDebitoBs)}
                  {displayCurrency !== 'BS' && (
                    <div className="text-[10px] text-slate-400">{formatUsd(totalIvaDebitoUsd)}</div>
                  )}
                </td>
                <td className="py-3 px-3 text-right font-mono text-purple-300 bg-slate-850">
                  {formatBs(totalIvaRetenidoBs)}
                  {displayCurrency !== 'BS' && (
                    <div className="text-[10px] text-slate-400">{formatUsd(totalIvaRetenidoUsd)}</div>
                  )}
                </td>
                <td></td>
                <td></td>
                <td className="py-3 px-3 text-right font-mono text-sky-300 bg-slate-850">{formatBs(totalIgtfBs)}</td>
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
          Resumen de Ventas para Declaración de IVA (Forma 30 SENIAT)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono-nums">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block">Total Ventas Internas Gravadas:</span>
            <span className="text-base font-bold text-white mt-1 block">{formatBs(totalBaseBs)}</span>
            <span className="text-[10px] text-slate-400">{formatUsd(totalBaseUsd)}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block">Débito Fiscal Generado (16%):</span>
            <span className="text-base font-bold text-emerald-400 mt-1 block">{formatBs(totalIvaDebitoBs)}</span>
            <span className="text-[10px] text-slate-400">{formatUsd(totalIvaDebitoUsd)}</span>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <span className="text-[11px] text-slate-400 block">Retenciones de IVA Recibidas por Compensar:</span>
            <span className="text-base font-bold text-purple-300 mt-1 block">{formatBs(totalIvaRetenidoBs)}</span>
            <span className="text-[10px] text-slate-400">{formatUsd(totalIvaRetenidoUsd)}</span>
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

      <NewSaleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      {settlementTarget && <CreditSettlementModal documentId={settlementTarget.id} documentNumber={settlementTarget.number} partyName={settlementTarget.party} kind="SALE_COLLECTION" onClose={() => setSettlementTarget(null)} />}
    </div>
  );
};
