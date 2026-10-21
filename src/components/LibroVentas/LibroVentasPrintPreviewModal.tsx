import React from 'react';
import { Company, SaleRecord } from '../../types/accounting';
import { LibroVentasOficialPrint } from './LibroVentasOficialPrint';
import { Printer, Download, X, Eye, FileText, CheckCircle2 } from 'lucide-react';

interface LibroVentasPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  sales: SaleRecord[];
  monthFilter?: string;
  onExportPdf: () => void;
  isExportingPdf: boolean;
}

export const LibroVentasPrintPreviewModal: React.FC<LibroVentasPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  company,
  sales,
  monthFilter,
  onExportPdf,
  isExportingPdf
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 no-print animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[96vh] flex flex-col overflow-hidden border border-slate-700">
        {/* Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-850 text-white border-b border-slate-700 gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-100">
                  Libro de Ventas Oficial de la Empresa
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Formato SENIAT Legal
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {company.name} • RIF: {company.rif} • {sales.length} facturas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onExportPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition border border-slate-600 cursor-pointer"
              title="Descargar versión en archivo PDF"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF'}
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition shadow shadow-emerald-700/30 cursor-pointer"
              title="Enviar directamente a la impresora"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Libro de la Empresa</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Cerrar vista previa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Container Preview */}
        <div className="flex-1 overflow-auto p-3 sm:p-6 bg-slate-950/70 flex justify-center">
          <div className="bg-white rounded shadow-2xl w-full max-w-5xl border border-slate-300 overflow-x-auto min-h-[500px]">
            <LibroVentasOficialPrint
              company={company}
              sales={sales}
              monthFilter={monthFilter}
            />
          </div>
        </div>

        {/* Footer Note */}
        <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between flex-shrink-0">
          <span className="flex items-center gap-1.5 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Al pulsar "Imprimir", el sistema enviará exclusivamente el Libro de Ventas reglamentario sin barras ni menús web.
          </span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
            Orientación recomendada: Horizontal (Landscape)
          </span>
        </div>
      </div>
    </div>
  );
};
