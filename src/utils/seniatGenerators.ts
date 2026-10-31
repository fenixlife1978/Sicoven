import { Company, VatRetentionVoucher, IslrRetentionVoucher, PurchaseRecord } from '../types/accounting';
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
 * Construye la relación fiscal mensual desde compras con concepto ISLR declarado.
 * Incluye operaciones con retención cero; los comprobantes históricos se usan
 * como respaldo cuando la compra original no conserva metadatos ISLR.
 */
export function generateSeniatIslrOperationsXml(
  company: Company,
  purchases: PurchaseRecord[],
  vouchers: IslrRetentionVoucher[],
  period: string
): string {
  const agentRif = cleanRif(company.rif);
  const xmlEscape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const operations = purchases
    .filter(p => p.companyId === company.id && p.documentType === '01' && p.invoiceDate.slice(0, 7).replace('-', '') === period && p.islrConceptCode && !p.isCancelled)
    .map(p => ({
      supplierRif: p.supplierRif,
      invoiceNumber: p.invoiceNumber,
      controlNumber: p.controlNumber,
      invoiceDate: p.invoiceDate,
      conceptCode: p.islrConceptCode as string,
      baseAmountBs: Number(p.taxableBaseBs),
      retentionRate: Number(p.islrRate || 0),
      key: [p.supplierRif, p.invoiceNumber, p.invoiceDate, p.islrConceptCode].join('|')
    }));
  const known = new Set(operations.map(item => item.key));
  for (const voucher of vouchers) {
    const key = [voucher.supplierRif, voucher.invoiceNumber, voucher.invoiceDate, voucher.conceptCode].join('|');
    if (voucher.companyId !== company.id || voucher.period !== period || known.has(key)) continue;
    operations.push({
      supplierRif: voucher.supplierRif,
      invoiceNumber: voucher.invoiceNumber,
      controlNumber: voucher.controlNumber,
      invoiceDate: voucher.invoiceDate,
      conceptCode: voucher.conceptCode,
      baseAmountBs: Number(voucher.baseAmountBs),
      retentionRate: Number(voucher.retentionRate),
      key
    });
    known.add(key);
  }
  operations.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
  let xml = `<?xml version="1.0" encoding="ISO-8859-1"?>\\n`;
  xml += `<RelacionRetencionesISLR RifAgente="${xmlEscape(agentRif)}" Periodo="${xmlEscape(period)}">\\n`;
  for (const operation of operations) {
    const parts = operation.invoiceDate.split('-');
    const date = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : operation.invoiceDate;
    xml += `  <DetalleRetencion>\\n`;
    xml += `    <RifRetenido>${xmlEscape(cleanRif(operation.supplierRif))}</RifRetenido>\\n`;
    xml += `    <NumeroFactura>${xmlEscape(operation.invoiceNumber)}</NumeroFactura>\\n`;
    xml += `    <NumeroControl>${xmlEscape(operation.controlNumber)}</NumeroControl>\\n`;
    xml += `    <FechaOperacion>${xmlEscape(date)}</FechaOperacion>\\n`;
    xml += `    <CodigoConcepto>${xmlEscape(operation.conceptCode.padStart(3, '0'))}</CodigoConcepto>\\n`;
    xml += `    <MontoOperacion>${operation.baseAmountBs.toFixed(2)}</MontoOperacion>\\n`;
    xml += `    <PorcentajeRetencion>${operation.retentionRate.toFixed(2)}</PorcentajeRetencion>\\n`;
    xml += `  </DetalleRetencion>\\n`;
  }
  return xml + `</RelacionRetencionesISLR>`;
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
