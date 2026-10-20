import { Company, VatRetentionVoucher, IslrRetentionVoucher } from '../types/accounting';
import { cleanRif } from './formatters';

/**
 * Genera el archivo TXT oficial de Retenciones de IVA para el portal SENIAT
 * Formato estándar: Delimitado por tabulaciones (\t)
 */
export function generateSeniatIvaTxt(company: Company, vouchers: VatRetentionVoucher[]): string {
  const agentRif = cleanRif(company.rif);
  const lines: string[] = [];

  for (const v of vouchers) {
    const supplierRif = cleanRif(v.supplierRif);
    const invoiceDate = v.invoiceDate; // YYYY-MM-DD
    const period = v.period; // YYYYMM
    const docType = '01'; // 01=Factura
    const invoiceNum = v.invoiceNumber.trim() || '00000001';
    const controlNum = v.controlNumber.trim() || '00-000001';
    const totalAmount = v.totalAmountBs.toFixed(2);
    const baseAmount = v.taxableBaseBs.toFixed(2);
    const withheldAmount = v.vatWithheldBs.toFixed(2);
    const affectedDoc = '0';
    const voucherNum = v.voucherNumber; // 14 dígitos
    const exemptAmount = (v.exemptAmountBs || 0).toFixed(2);
    const rate = v.taxRate.toFixed(2);
    const expeditionNum = '0';

    // Fila estándar SENIAT
    const line = [
      agentRif,
      period,
      invoiceDate,
      'C', // Operación: Compras
      docType,
      supplierRif,
      invoiceNum,
      controlNum,
      totalAmount,
      baseAmount,
      withheldAmount,
      affectedDoc,
      voucherNum,
      exemptAmount,
      rate,
      expeditionNum
    ].join('\t');

    lines.push(line);
  }

  return lines.join('\r\n');
}

/**
 * Genera el archivo XML oficial de Retenciones de ISLR para el portal SENIAT
 */
export function generateSeniatIslrXml(company: Company, vouchers: IslrRetentionVoucher[]): string {
  const agentRif = cleanRif(company.rif);
  const period = vouchers.length > 0 ? vouchers[0].period : `${company.fiscalYear}10`;

  let xml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n`;
  xml += `<RelacionRetencionesISLR RifAgente="${agentRif}" Periodo="${period}">\n`;

  for (const v of vouchers) {
    const retRif = cleanRif(v.supplierRif);
    const dateParts = v.invoiceDate.split('-');
    const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : v.invoiceDate;

    xml += `  <DetalleRetencion>\n`;
    xml += `    <RifRetenido>${retRif}</RifRetenido>\n`;
    xml += `    <NumeroFactura>${v.invoiceNumber}</NumeroFactura>\n`;
    xml += `    <NumeroControl>${v.controlNumber}</NumeroControl>\n`;
    xml += `    <FechaOperacion>${formattedDate}</FechaOperacion>\n`;
    xml += `    <CodigoConcepto>${v.conceptCode.padStart(3, '0')}</CodigoConcepto>\n`;
    xml += `    <MontoOperacion>${v.baseAmountBs.toFixed(2)}</MontoOperacion>\n`;
    xml += `    <PorcentajeRetencion>${v.retentionRate.toFixed(2)}</PorcentajeRetencion>\n`;
    xml += `  </DetalleRetencion>\n`;
  }

  xml += `</RelacionRetencionesISLR>`;
  return xml;
}

/**
 * Genera el archivo TXT oficial de Retenciones de ISLR para el portal SENIAT
 */
export function generateSeniatIslrTxt(company: Company, vouchers: IslrRetentionVoucher[]): string {
  const agentRif = cleanRif(company.rif);
  const lines: string[] = [];

  for (const v of vouchers) {
    const retRif = cleanRif(v.supplierRif);
    const dateParts = v.invoiceDate.split('-');
    const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : v.invoiceDate;
    
    // Tab separated values
    const line = [
      agentRif,
      v.period,
      retRif,
      v.conceptCode.padStart(3, '0'),
      v.invoiceNumber,
      v.controlNumber,
      formattedDate,
      v.baseAmountBs.toFixed(2),
      v.retentionRate.toFixed(2),
      v.subtrahendBs.toFixed(2),
      v.withheldAmountBs.toFixed(2)
    ].join('\t');

    lines.push(line);
  }

  return lines.join('\r\n');
}

/**
 * Descarga un archivo de texto en el navegador del usuario
 */
export function downloadFile(content: string, fileName: string, contentType: string = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
