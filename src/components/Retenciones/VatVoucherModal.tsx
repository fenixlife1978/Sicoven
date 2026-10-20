import React from 'react';
import { Company, VatRetentionVoucher } from '../../types/accounting';
import { X, Printer, ShieldCheck } from 'lucide-react';
import { formatBs, formatUsd, formatDate, formatNumberVe } from '../../utils/formatters';

interface VatVoucherModalProps {
  voucher: VatRetentionVoucher | null;
  company: Company;
  onClose: () => void;
}

export const VatVoucherModal: React.FC<VatVoucherModalProps> = ({ voucher, company, onClose }) => {
  if (!voucher) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-6 overflow-hidden border border-slate-300">
        {/* Top Control Bar (no-print) */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white no-print">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="font-semibold text-sm">
              Comprobante Oficial de Retención de IVA (Providencia SNAT/2015/0049)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition cursor-pointer shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Comprobante
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Voucher Document */}
        <div className="p-8 text-black bg-white space-y-4 print:p-0 print:space-y-3 font-sans text-xs">
          {/* Header Title */}
          <div className="border border-black p-3 text-center space-y-1">
            <h1 className="font-black text-sm tracking-wide uppercase">
              REPÚBLICA BOLIVARIANA DE VENEZUELA
            </h1>
            <h2 className="font-bold text-xs uppercase text-slate-800">
              COMPROBANTE DE RETENCIÓN DEL IMPUESTO AL VALOR AGREGADO (IVA)
            </h2>
            <p className="text-[10px] text-slate-700 italic">
              (Ley que Establece el Impuesto al Valor Agregado - Art. 11 y Providencia Administrativa SNAT/2015/0049)
            </p>
          </div>

          {/* Identification Box */}
          <div className="grid grid-cols-2 gap-3">
            {/* Voucher and Dates */}
            <div className="border border-black p-2.5 space-y-1">
              <div>
                <span className="font-bold">NÚMERO DE COMPROBANTE: </span>
                <span className="font-mono font-black text-sm text-purple-900 print:text-black">
                  {voucher.voucherNumber}
                </span>
              </div>
              <div>
                <span className="font-bold">FECHA DE EMISIÓN: </span>
                <span className="font-mono">{formatDate(voucher.date)}</span>
              </div>
              <div>
                <span className="font-bold">PERÍODO FISCAL: </span>
                <span className="font-mono">{voucher.period} (Año: {voucher.period.slice(0, 4)} Mes: {voucher.period.slice(4, 6)})</span>
              </div>
            </div>

            {/* Currency conversion memo */}
            <div className="border border-black p-2.5 space-y-1 bg-slate-50 print:bg-transparent">
              <div>
                <span className="font-bold">TASA OFICIAL BCV APLICADA: </span>
                <span className="font-mono font-bold">Bs. {voucher.bcvRate.toFixed(2)} por 1,00 USD</span>
              </div>
              <div>
                <span className="font-bold">NORMA APLICABLE: </span>
                <span>Providencia SNAT / Art. 11 Ley de IVA</span>
              </div>
              <div className="text-[10px] text-slate-600">
                Original: Sujeto Retenido (Proveedor) • Copia: Agente de Retención
              </div>
            </div>
          </div>

          {/* Agente de Retención (Nuestra Empresa) */}
          <div className="border border-black p-2.5 space-y-1">
            <div className="font-bold bg-slate-200 print:bg-slate-300 px-1 py-0.5 uppercase text-[11px]">
              1. DATOS DEL AGENTE DE RETENCIÓN
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="col-span-2">
                <span className="font-bold">NOMBRE O RAZÓN SOCIAL: </span>
                <span className="font-semibold">{company.name}</span>
              </div>
              <div>
                <span className="font-bold">NÚMERO DE RIF: </span>
                <span className="font-mono font-bold">{company.rif}</span>
              </div>
            </div>
            <div>
              <span className="font-bold">DIRECCIÓN FISCAL: </span>
              <span>{company.address}</span>
            </div>
          </div>

          {/* Sujeto Retenido (Proveedor) */}
          <div className="border border-black p-2.5 space-y-1">
            <div className="font-bold bg-slate-200 print:bg-slate-300 px-1 py-0.5 uppercase text-[11px]">
              2. DATOS DEL SUJETO RETENIDO (PROVEEDOR)
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="col-span-2">
                <span className="font-bold">NOMBRE O RAZÓN SOCIAL: </span>
                <span className="font-semibold">{voucher.supplierName}</span>
              </div>
              <div>
                <span className="font-bold">NÚMERO DE RIF: </span>
                <span className="font-mono font-bold">{voucher.supplierRif}</span>
              </div>
            </div>
            <div>
              <span className="font-bold">DIRECCIÓN FISCAL: </span>
              <span>{voucher.supplierAddress || 'Venezuela'}</span>
            </div>
          </div>

          {/* Table of operations */}
          <div className="border border-black overflow-hidden">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-200 print:bg-slate-300 border-b border-black font-bold text-center">
                  <th className="p-1 border-r border-black w-8">Oper.</th>
                  <th className="p-1 border-r border-black w-18">Fecha Factura</th>
                  <th className="p-1 border-r border-black w-20">N° Factura</th>
                  <th className="p-1 border-r border-black w-20">N° Control</th>
                  <th className="p-1 border-r border-black w-24 text-right">Total Factura (Bs.)</th>
                  <th className="p-1 border-r border-black w-20 text-right">Exento (Bs.)</th>
                  <th className="p-1 border-r border-black w-24 text-right">Base Imponible</th>
                  <th className="p-1 border-r border-black w-12 text-center">% Alíc.</th>
                  <th className="p-1 border-r border-black w-24 text-right">Impuesto IVA</th>
                  <th className="p-1 border-r border-black w-14 text-center">% Ret.</th>
                  <th className="p-1 text-right w-24">IVA Retenido (Bs.)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-right border-b border-black">
                  <td className="p-1.5 border-r border-black text-center font-mono">1</td>
                  <td className="p-1.5 border-r border-black text-center font-mono whitespace-nowrap">
                    {formatDate(voucher.invoiceDate)}
                  </td>
                  <td className="p-1.5 border-r border-black text-center font-mono font-bold">
                    {voucher.invoiceNumber}
                  </td>
                  <td className="p-1.5 border-r border-black text-center font-mono">
                    {voucher.controlNumber}
                  </td>
                  <td className="p-1.5 border-r border-black font-mono font-bold">
                    {formatNumberVe(voucher.totalAmountBs)}
                  </td>
                  <td className="p-1.5 border-r border-black font-mono">
                    {formatNumberVe(voucher.exemptAmountBs || 0)}
                  </td>
                  <td className="p-1.5 border-r border-black font-mono">
                    {formatNumberVe(voucher.taxableBaseBs)}
                  </td>
                  <td className="p-1.5 border-r border-black text-center font-mono">
                    {voucher.taxRate}%
                  </td>
                  <td className="p-1.5 border-r border-black font-mono font-bold">
                    {formatNumberVe(voucher.vatAmountBs)}
                  </td>
                  <td className="p-1.5 border-r border-black text-center font-mono font-bold">
                    {voucher.retentionRate}%
                  </td>
                  <td className="p-1.5 font-mono font-black text-black">
                    {formatNumberVe(voucher.vatWithheldBs)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 print:bg-slate-200 font-bold text-right border-t border-black">
                  <td colSpan={4} className="p-1.5 border-r border-black text-center uppercase">
                    TOTALES:
                  </td>
                  <td className="p-1.5 border-r border-black font-mono">
                    {formatNumberVe(voucher.totalAmountBs)}
                  </td>
                  <td className="p-1.5 border-r border-black font-mono">
                    {formatNumberVe(voucher.exemptAmountBs || 0)}
                  </td>
                  <td className="p-1.5 border-r border-black font-mono">
                    {formatNumberVe(voucher.taxableBaseBs)}
                  </td>
                  <td className="p-1.5 border-r border-black"></td>
                  <td className="p-1.5 border-r border-black font-mono">
                    {formatNumberVe(voucher.vatAmountBs)}
                  </td>
                  <td className="p-1.5 border-r border-black"></td>
                  <td className="p-1.5 font-mono font-black text-black">
                    {formatNumberVe(voucher.vatWithheldBs)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Dual currency reference note */}
          <div className="border border-black p-2 flex justify-between items-center text-[11px] bg-slate-50 print:bg-transparent">
            <div>
              <span className="font-bold">TOTAL RETENIDO EN MONEDA NACIONAL: </span>
              <span className="font-mono font-black">{formatBs(voucher.vatWithheldBs)}</span>
            </div>
            <div>
              <span className="font-bold">EQUIVALENTE REFERENCIAL: </span>
              <span className="font-mono font-bold">{formatUsd(voucher.vatWithheldUsd)}</span>
            </div>
          </div>

          {/* Signatures & Stamps */}
          <div className="grid grid-cols-2 gap-8 pt-8">
            <div className="text-center space-y-1">
              <div className="border-t border-black w-64 mx-auto pt-1"></div>
              <p className="font-bold uppercase text-[11px]">{company.name}</p>
              <p className="text-[10px] text-slate-600">FIRMA Y SELLO DEL AGENTE DE RETENCIÓN</p>
            </div>
            <div className="text-center space-y-1">
              <div className="border-t border-black w-64 mx-auto pt-1"></div>
              <p className="font-bold uppercase text-[11px]">{voucher.supplierName}</p>
              <p className="text-[10px] text-slate-600">FIRMA Y SELLO DE RECEPCIÓN (PROVEEDOR)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
