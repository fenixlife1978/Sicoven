import React from 'react';
import { Company, SaleRecord } from '../../types/accounting';
import { formatBs, formatDate } from '../../utils/formatters';
import { DEFAULT_LOGO_LOS_ANDES, getCompanyLogo } from '../../data/defaultLogos';

interface LibroVentasOficialPrintProps {
  company: Company;
  sales: SaleRecord[];
  monthFilter?: string;
}

export const LibroVentasOficialPrint: React.FC<LibroVentasOficialPrintProps> = ({
  company,
  sales,
  monthFilter
}) => {
  const logo = getCompanyLogo(company);

  // Totales oficiales SENIAT
  const totalVentasConIva = sales.reduce((s, x) => s + x.totalAmountBs, 0);
  const totalExento = sales.reduce((s, x) => s + (x.exemptAmountBs || 0), 0);
  const totalBase = sales.reduce((s, x) => s + x.taxableBaseBs, 0);
  const totalIvaDebito = sales.reduce((s, x) => s + x.vatAmountBs, 0);
  const totalIvaRetenido = sales.reduce((s, x) => s + (x.vatWithheldBs || 0), 0);

  // Formato del período impositivo
  const formatPeriodLabel = (filter?: string) => {
    if (!filter) return `AÑO: ${company.fiscalYear} • MES: 10 (OCTUBRE)`;
    const parts = filter.split('-');
    if (parts.length === 2) {
      const months = [
        'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
        'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
      ];
      const mIdx = parseInt(parts[1], 10) - 1;
      return `AÑO: ${parts[0]} • MES: ${parts[1]} (${months[mIdx] || ''})`;
    }
    return filter;
  };

  const currentDateStr = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="w-full bg-white text-black p-2 sm:p-4 font-sans text-[10px] leading-tight">
      {/* 1. ENCABEZADO FORMAL DE LA EMPRESA Y TÍTULO FISCAL */}
      <div className="border-b-2 border-black pb-3 mb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Logo y Datos de la Empresa */}
          <div className="flex items-center gap-3">
            {logo && (
              <img
                src={logo}
                alt={company.name}
                className="h-12 w-auto object-contain max-w-[150px]"
              />
            )}
            <div>
              <h1 className="text-sm font-black uppercase tracking-tight text-black">
                {company.name}
              </h1>
              <div className="font-bold text-xs font-mono">
                RIF: {company.rif}
              </div>
              <div className="text-[9px] uppercase tracking-wide font-semibold text-slate-800">
                {company.taxpayerType === 'ESPECIAL'
                  ? 'CONTRIBUYENTE ESPECIAL (Providencia SNAT/2015/0049)'
                  : 'CONTRIBUYENTE ORDINARIO'}
              </div>
              <div className="text-[9px] text-slate-700 max-w-lg">
                Domicilio Fiscal: {company.address}
              </div>
            </div>
          </div>

          {/* Membrete Legal SENIAT y Período */}
          <div className="text-right">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-700">
              REPÚBLICA BOLIVARIANA DE VENEZUELA
            </div>
            <div className="text-[9px] font-bold text-slate-800">
              SERVICIO NACIONAL INTEGRADO DE ADMINISTRACIÓN ADUANERA Y TRIBUTARIA (SENIAT)
            </div>
            <div className="text-base font-black uppercase tracking-wider text-black mt-0.5">
              LIBRO DE VENTAS
            </div>
            <div className="text-[9px] font-medium text-slate-700">
              Conforme a los Arts. 76 y 77 del Reglamento de la Ley de IVA
            </div>
            <div className="mt-1 font-bold font-mono text-[10px] bg-slate-100 inline-block px-2 py-0.5 border border-slate-300">
              PERÍODO: {formatPeriodLabel(monthFilter)}
            </div>
          </div>
        </div>

        {/* Barra de metadatos del libro */}
        <div className="mt-2 pt-1 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-600 font-mono">
          <div>Moneda de Registro: <strong>Bolívares (Bs.)</strong> • Tasa Referencial BCV: Bs. {company.bcvRate.toFixed(2)}/USD</div>
          <div>Folio N°: <strong>001</strong> • Facturas Emitidas: <strong>{sales.length}</strong></div>
        </div>
      </div>

      {/* 2. TABLA OFICIAL REGLAMENTARIA DE VENTAS */}
      <div className="w-full overflow-visible">
        <table className="w-full border-collapse text-[9px] text-black">
          <thead>
            <tr className="bg-slate-150 border-y border-black font-bold text-center">
              <th className="border border-black p-1 w-7">Op.</th>
              <th className="border border-black p-1 w-16">Fecha</th>
              <th className="border border-black p-1 w-20">RIF Cliente</th>
              <th className="border border-black p-1 text-left min-w-[140px]">Nombre o Razón Social</th>
              <th className="border border-black p-1 w-16">N° Factura</th>
              <th className="border border-black p-1 w-16">N° Control</th>
              <th className="border border-black p-1 text-right w-24">Total Ventas (Bs.)</th>
              <th className="border border-black p-1 text-right w-20">Exento (Bs.)</th>
              <th className="border border-black p-1 text-right w-24">Base Imponible</th>
              <th className="border border-black p-1 w-8">% Alíc.</th>
              <th className="border border-black p-1 text-right w-20">Débito Fiscal</th>
              <th className="border border-black p-1 text-right w-20">IVA Retenido</th>
              <th className="border border-black p-1 w-24">Comprobante Ret.</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={13} className="border border-black p-4 text-center italic text-slate-600">
                  No se registraron operaciones de ventas ni emisión de facturas durante el presente período impositivo.
                </td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id} className="border-b border-slate-300">
                  <td className="border border-black p-1 text-center font-bold font-mono">
                    {sale.opNumber}
                  </td>
                  <td className="border border-black p-1 text-center font-mono whitespace-nowrap">
                    {formatDate(sale.invoiceDate)}
                  </td>
                  <td className="border border-black p-1 text-center font-mono font-medium whitespace-nowrap">
                    {sale.customerRif}
                  </td>
                  <td className="border border-black p-1 text-left uppercase truncate max-w-[180px]">
                    {sale.customerName}
                  </td>
                  <td className="border border-black p-1 text-center font-mono font-bold whitespace-nowrap">
                    {sale.invoiceNumber}
                  </td>
                  <td className="border border-black p-1 text-center font-mono whitespace-nowrap">
                    {sale.controlNumber}
                  </td>
                  <td className="border border-black p-1 text-right font-mono font-bold whitespace-nowrap">
                    {formatBs(sale.totalAmountBs)}
                  </td>
                  <td className="border border-black p-1 text-right font-mono whitespace-nowrap">
                    {sale.exemptAmountBs > 0 ? formatBs(sale.exemptAmountBs) : '0,00'}
                  </td>
                  <td className="border border-black p-1 text-right font-mono font-semibold whitespace-nowrap">
                    {formatBs(sale.taxableBaseBs)}
                  </td>
                  <td className="border border-black p-1 text-center font-mono">
                    {sale.taxRate}%
                  </td>
                  <td className="border border-black p-1 text-right font-mono font-bold whitespace-nowrap">
                    {formatBs(sale.vatAmountBs)}
                  </td>
                  <td className="border border-black p-1 text-right font-mono whitespace-nowrap">
                    {sale.vatWithheldBs > 0 ? formatBs(sale.vatWithheldBs) : '0,00'}
                  </td>
                  <td className="border border-black p-1 text-center font-mono text-[8px] whitespace-nowrap">
                    {sale.retentionVoucherNumber || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black bg-slate-100 font-bold font-mono">
              <td colSpan={6} className="border border-black p-1.5 text-right font-sans uppercase">
                TOTALES DEL LIBRO DE VENTAS:
              </td>
              <td className="border border-black p-1.5 text-right font-black">
                {formatBs(totalVentasConIva)}
              </td>
              <td className="border border-black p-1.5 text-right">
                {formatBs(totalExento)}
              </td>
              <td className="border border-black p-1.5 text-right font-black">
                {formatBs(totalBase)}
              </td>
              <td className="border border-black p-1.5 text-center">-</td>
              <td className="border border-black p-1.5 text-right font-black">
                {formatBs(totalIvaDebito)}
              </td>
              <td className="border border-black p-1.5 text-right font-black">
                {formatBs(totalIvaRetenido)}
              </td>
              <td className="border border-black p-1.5 text-center">-</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 3. RESUMEN FISCAL DE VENTAS PARA LA DECLARACIÓN DE IVA (FORMA 30) */}
      <div className="mt-4 pt-3 border-t border-black print-break-inside-avoid">
        <div className="font-bold uppercase tracking-wider text-[9px] mb-1.5 text-slate-800">
          RESUMEN DEL PERÍODO PARA LA DECLARACIÓN DE IVA (FORMA 30 SENIAT)
        </div>
        <div className="grid grid-cols-4 gap-2 border border-black p-2 bg-slate-50 font-mono text-[9px]">
          <div>
            <div className="text-[8px] text-slate-600 uppercase font-sans">Total Ventas Internas Gravadas:</div>
            <div className="font-bold text-black mt-0.5">Bs. {formatBs(totalBase)}</div>
          </div>
          <div>
            <div className="text-[8px] text-slate-600 uppercase font-sans">Total Ventas Exentas / Exoneradas:</div>
            <div className="font-bold text-black mt-0.5">Bs. {formatBs(totalExento)}</div>
          </div>
          <div>
            <div className="text-[8px] text-slate-600 uppercase font-sans">Débito Fiscal Causado (16%):</div>
            <div className="font-bold text-black mt-0.5">Bs. {formatBs(totalIvaDebito)}</div>
          </div>
          <div>
            <div className="text-[8px] text-slate-600 uppercase font-sans">Retenciones de IVA Recibidas:</div>
            <div className="font-bold text-black mt-0.5">Bs. {formatBs(totalIvaRetenido)}</div>
          </div>
        </div>
      </div>

      {/* 4. CERTIFICACIÓN LEGAL Y BLOQUE DE FIRMAS */}
      <div className="mt-8 pt-4 border-t border-slate-400 print-break-inside-avoid">
        <p className="text-[8.5px] text-slate-700 italic text-center mb-8 max-w-3xl mx-auto">
          "De conformidad con lo dispuesto en el Código Orgánico Tributario, la Ley de Impuesto al Valor Agregado y su Reglamento, certificamos bajo fe de juramento que las operaciones registradas en el presente Libro de Ventas corresponden íntegramente a las facturas y documentos equivalentes emitidos por la empresa durante el período fiscal señalado."
        </p>

        <div className="grid grid-cols-2 gap-16 px-12 text-center text-[10px]">
          <div>
            <div className="border-t border-black pt-1.5 font-bold uppercase">
              CONTADOR PÚBLICO COLEGIADO
            </div>
            <div className="text-[9px] text-slate-600 font-mono">C.P.C. N° ____________________</div>
            <div className="text-[8px] text-slate-500 mt-0.5">Firma y Sello Profesional</div>
          </div>

          <div>
            <div className="border-t border-black pt-1.5 font-bold uppercase">
              REPRESENTANTE LEGAL
            </div>
            <div className="text-[9px] text-slate-600 font-mono">{company.name}</div>
            <div className="text-[8px] text-slate-500 mt-0.5">Firma y Sello Húmedo de la Empresa</div>
          </div>
        </div>

        <div className="text-right text-[8px] text-slate-500 font-mono mt-6">
          Fecha y Hora de Emisión del Libro: {currentDateStr} • Sistema Contable SICOVEN VEN-NIF
        </div>
      </div>
    </div>
  );
};
