import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  FileText,
  Download,
  Eye,
  Trash2,
  Code,
  Search,
  CheckCircle2,
  Receipt
} from 'lucide-react';
import { formatBs, formatUsd, formatDate, cleanRif } from '../../utils/formatters';
import { IslrRetentionVoucher } from '../../types/accounting';
import { IslrVoucherModal } from './IslrVoucherModal';
import {
  generateSeniatIslrXml,
  generateSeniatIslrTxt,
  downloadFile
} from '../../utils/seniatGenerators';

export const RetencionesIslrView: React.FC = () => {
  const { currentCompany, islrVouchers, deleteIslrVoucher, displayCurrency } = useAccounting();

  const [selectedVoucher, setSelectedVoucher] = useState<IslrRetentionVoucher | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showXmlPreview, setShowXmlPreview] = useState(false);

  const filteredVouchers = islrVouchers
    .filter(v => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          v.voucherNumber.toLowerCase().includes(term) ||
          v.supplierName.toLowerCase().includes(term) ||
          v.supplierRif.toLowerCase().includes(term) ||
          v.conceptDescription.toLowerCase().includes(term) ||
          v.invoiceNumber.toLowerCase().includes(term)
        );
      }
      return true;
    })
    .sort((a, b) => b.voucherNumber.localeCompare(a.voucherNumber));

  const totalRetenidoBs = filteredVouchers.reduce((s, v) => s + v.withheldAmountBs, 0);
  const totalRetenidoUsd = filteredVouchers.reduce((s, v) => s + v.withheldAmountUsd, 0);
  const totalBaseBs = filteredVouchers.reduce((s, v) => s + v.baseAmountBs, 0);

  const generatedXml = generateSeniatIslrXml(currentCompany, filteredVouchers);
  const generatedTxt = generateSeniatIslrTxt(currentCompany, filteredVouchers);

  const handleDownloadXml = () => {
    if (filteredVouchers.length === 0) {
      alert('No hay retenciones de ISLR para generar el archivo XML.');
      return;
    }
    const cleanR = cleanRif(currentCompany.rif);
    const period = filteredVouchers[0]?.period || `${currentCompany.fiscalYear}10`;
    downloadFile(generatedXml, `RetencionesISLR_${cleanR}_${period}.xml`, 'application/xml;charset=utf-8');
  };

  const handleDownloadTxt = () => {
    if (filteredVouchers.length === 0) {
      alert('No hay retenciones de ISLR para generar el archivo TXT.');
      return;
    }
    const cleanR = cleanRif(currentCompany.rif);
    const period = filteredVouchers[0]?.period || `${currentCompany.fiscalYear}10`;
    downloadFile(generatedTxt, `RetencionesISLR_${cleanR}_${period}.txt`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {currentCompany.taxpayerType === 'ESPECIAL' ? 'Contribuyente Especial' : 'Contribuyente Ordinario'}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-600">
                RIF: {currentCompany.rif}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              Comprobantes de Retención de ISLR & Archivos SENIAT (XML / TXT)
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Conforme al Decreto 1808 (Reglamento de Retenciones de ISLR) para personas naturales, jurídicas y formato XML oficial para el portal SENIAT.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowXmlPreview(!showXmlPreview)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300"
            >
              <Code className="w-3.5 h-3.5" />
              {showXmlPreview ? 'Ocultar XML' : 'Previsualizar XML'}
            </button>
            <button
              onClick={handleDownloadTxt}
              disabled={filteredVouchers.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-xl transition cursor-pointer border border-slate-300"
              title="Descargar versión TXT"
            >
              <Download className="w-3.5 h-3.5" />
              TXT ISLR
            </button>
            <button
              onClick={handleDownloadXml}
              disabled={filteredVouchers.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition shadow cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Descargar XML SENIAT
            </button>
          </div>
        </div>

        {/* Metric summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200">
            <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide block">
              Total ISLR Retenido a Enterar al SENIAT
            </span>
            <div className="text-lg font-bold font-mono text-indigo-900 mt-1">
              {formatBs(totalRetenidoBs)}
            </div>
            <div className="text-xs font-mono text-indigo-700">
              {formatUsd(totalRetenidoUsd)}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
              Comprobantes Emitidos
            </span>
            <div className="text-lg font-bold text-slate-900 mt-1">
              {filteredVouchers.length} Comprobantes
            </div>
            <div className="text-xs text-slate-500">
              Formatos de retención legal (Decreto 1808)
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
              Base Imponible de Retención
            </span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-1">
              {formatBs(totalBaseBs)}
            </div>
            <div className="text-xs text-slate-500">
              Operaciones comerciales y honorarios
            </div>
          </div>
        </div>

        {filteredVouchers.some(voucher => voucher.requiresFiscalCorrection) && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Hay comprobantes vinculados a notas de crédito o reversiones que requieren revisión fiscal. Se conservan como documentos históricos; el archivo SENIAT todavía incluye sus datos originales. Verifique la rectificación aplicable antes de declarar.
          </div>
        )}

        {/* XML Preview Card */}
        {showXmlPreview && (
          <div className="mt-6 p-4 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-300">
                  Estructura XML Oficial SENIAT para Carga Masiva de Retenciones de ISLR
                </span>
              </div>
              <button
                onClick={handleDownloadXml}
                className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Descargar XML
              </button>
            </div>
            <pre className="p-3 bg-black/60 rounded-lg text-[11px] font-mono text-emerald-400 overflow-x-auto whitespace-pre max-h-52 border border-slate-800">
              {generatedXml}
            </pre>
            <p className="text-[10px] text-slate-400 italic">
              Etiquetas requeridas por el portal: &lt;RelacionRetencionesISLR RifAgente Periodo&gt; • &lt;DetalleRetencion&gt; • RifRetenido • NumeroFactura • NumeroControl • FechaOperacion • CodigoConcepto • MontoOperacion • PorcentajeRetencion
            </p>
          </div>
        )}

        {/* Search */}
        <div className="pt-6 border-t border-slate-200 mt-6">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por comprobante, beneficiario, factura o concepto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Vouchers List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold whitespace-nowrap">
                <th className="py-2.5 px-4 w-36">N° Comprobante</th>
                <th className="py-2.5 px-4 w-24">Fecha</th>
                <th className="py-2.5 px-4 w-28">RIF Beneficiario</th>
                <th className="py-2.5 px-4 min-w-[200px]">Nombre o Razón Social</th>
                <th className="py-2.5 px-4 w-24">N° Factura</th>
                <th className="py-2.5 px-4 min-w-[180px]">Concepto Decreto 1808</th>
                <th className="py-2.5 px-4 text-right w-32">Base Imponible</th>
                <th className="py-2.5 px-2 text-center w-16">% Tarifa</th>
                <th className="py-2.5 px-4 text-right w-28">Sustraendo</th>
                <th className="py-2.5 px-4 text-right w-36 text-indigo-800">ISLR Retenido</th>
                <th className="py-2.5 px-4 text-center w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay comprobantes de retención de ISLR emitidos.
                  </td>
                </tr>
              ) : (
                filteredVouchers.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4 font-mono font-bold text-indigo-900 bg-indigo-50/30 whitespace-nowrap">
                      {v.voucherNumber}{v.requiresFiscalCorrection && <span title={v.correctionNote || 'Revisar regularización fiscal'} className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">REVISAR</span>}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(v.date)}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-800 whitespace-nowrap">
                      {v.supplierRif}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 truncate max-w-xs" title={v.supplierName}>
                      {v.supplierName}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {v.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 truncate max-w-xs" title={v.conceptDescription}>
                      <span className="font-mono font-bold mr-1 text-slate-900">Cod. {v.conceptCode}:</span>
                      {v.conceptDescription}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {formatBs(v.baseAmountBs)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono font-bold text-indigo-700">
                      {v.retentionRate}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-600 whitespace-nowrap">
                      {v.subtrahendBs > 0 ? formatBs(v.subtrahendBs) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-black text-indigo-900 bg-indigo-50/50 whitespace-nowrap">
                      {formatBs(v.withheldAmountBs)}
                      {displayCurrency !== 'BS' && (
                        <div className="text-[10px] text-indigo-600/70 font-normal">
                          {formatUsd(v.withheldAmountUsd)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedVoucher(v)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition cursor-pointer"
                          title="Ver e Imprimir Comprobante Oficial"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar comprobante N° ${v.voucherNumber}?`)) {
                              deleteIslrVoucher(v.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Eliminar comprobante"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for official printable voucher */}
      <IslrVoucherModal
        voucher={selectedVoucher}
        company={currentCompany}
        onClose={() => setSelectedVoucher(null)}
      />
    </div>
  );
};
