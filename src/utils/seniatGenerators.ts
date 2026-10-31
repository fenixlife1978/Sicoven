import { Company, VatRetentionVoucher, IslrRetentionVoucher, PurchaseRecord } from '../types/accounting';
import type { IslrFiscalEvent } from '../types/islrFiscalEvent';
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
type IslrOperationRow = {
  supplierRif: string; invoiceNumber: string; controlNumber: string; invoiceDate: string;
  conceptCode: string; baseAmountBs: number; retentionRate: number;
  subtrahendBs: number; withheldAmountBs: number; key: string;
};

/** Eventos inmutables primero; compras y comprobantes completan únicamente el legado. */
function buildIslrOperationRows(
  company: Company, purchases: PurchaseRecord[], vouchers: IslrRetentionVoucher[],
  period: string, events?: IslrFiscalEvent[]
): IslrOperationRow[] {
  const purchaseById = new Map(purchases.map(p => [p.id, p]));
  const eventPurchaseIds = new Set<string>();
  const rows: IslrOperationRow[] = [];
  for (const event of events || []) {
    if (event.companyId !== company.id || event.fiscalDate.slice(0, 7).replace('-', '') !== period || event.kind === 'REVERSAL') continue;
    for (const allocation of event.allocations) {
      const purchase = purchaseById.get(allocation.purchaseId);
      if (!purchase) continue;
      eventPurchaseIds.add(purchase.id);
      rows.push({
        supplierRif: event.supplierRif, invoiceNumber: purchase.invoiceNumber,
        controlNumber: purchase.controlNumber, invoiceDate: event.fiscalDate,
        conceptCode: event.conceptCode, baseAmountBs: Number(allocation.baseAmountBs),
        retentionRate: Number(purchase.islrRate || 0),
        subtrahendBs: Number(purchase.islrSubtrahendBs || 0),
        withheldAmountBs: Number(purchase.islrWithheldBs || 0),
        key: 'EVENT:' + event.id + ':' + allocation.purchaseId
      });
    }
  }
  for (const purchase of purchases) {
    if (purchase.companyId !== company.id || purchase.documentType !== '01' ||
        purchase.invoiceDate.slice(0, 7).replace('-', '') !== period ||
        !purchase.islrConceptCode || purchase.isCancelled || eventPurchaseIds.has(purchase.id)) continue;
    rows.push({
      supplierRif: purchase.supplierRif, invoiceNumber: purchase.invoiceNumber,
      controlNumber: purchase.controlNumber, invoiceDate: purchase.invoiceDate,
      conceptCode: purchase.islrConceptCode, baseAmountBs: Number(purchase.taxableBaseBs),
      retentionRate: Number(purchase.islrRate || 0),
      subtrahendBs: Number(purchase.islrSubtrahendBs || 0),
      withheldAmountBs: Number(purchase.islrWithheldBs || 0),
      key: [purchase.supplierRif, purchase.invoiceNumber, purchase.invoiceDate, purchase.islrConceptCode].join('|')
    });
  }
  const known = new Set(rows.map(row => row.key));
  const eventVoucherIds = new Set((events || []).filter(event => event.voucherId).map(event => event.voucherId));
  for (const voucher of vouchers) {
    const key = [voucher.supplierRif, voucher.invoiceNumber, voucher.invoiceDate, voucher.conceptCode].join('|');
    const linkedPurchase = purchases.find(p => p.companyId === company.id && p.supplierRif === voucher.supplierRif &&
      p.invoiceNumber === voucher.invoiceNumber && p.invoiceDate === voucher.invoiceDate && p.islrConceptCode === voucher.conceptCode);
    if (voucher.companyId !== company.id || voucher.period !== period || known.has(key) ||
        eventVoucherIds.has(voucher.id) || (linkedPurchase && eventPurchaseIds.has(linkedPurchase.id))) continue;
    rows.push({
      supplierRif: voucher.supplierRif, invoiceNumber: voucher.invoiceNumber,
      controlNumber: voucher.controlNumber, invoiceDate: voucher.invoiceDate,
      conceptCode: voucher.conceptCode, baseAmountBs: Number(voucher.baseAmountBs),
      retentionRate: Number(voucher.retentionRate), subtrahendBs: Number(voucher.subtrahendBs),
      withheldAmountBs: Number(voucher.withheldAmountBs), key
    });
    known.add(key);
  }
  return rows.sort((x, y) => x.invoiceDate.localeCompare(y.invoiceDate) || x.invoiceNumber.localeCompare(y.invoiceNumber));
}

export function generateSeniatIslrOperationsXml(
  company: Company, purchases: PurchaseRecord[], vouchers: IslrRetentionVoucher[],
  period: string, events?: IslrFiscalEvent[]
): string {
  const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  let xml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n';
  xml += '<RelacionRetencionesISLR RifAgente="' + esc(cleanRif(company.rif)) + '" Periodo="' + esc(period) + '">\n';
  for (const row of buildIslrOperationRows(company, purchases, vouchers, period, events)) {
    const parts = row.invoiceDate.split('-');
    const date = parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : row.invoiceDate;
    xml += '  <DetalleRetencion>\n';
    xml += '    <RifRetenido>' + esc(cleanRif(row.supplierRif)) + '</RifRetenido>\n';
    xml += '    <NumeroFactura>' + esc(row.invoiceNumber) + '</NumeroFactura>\n';
    xml += '    <NumeroControl>' + esc(row.controlNumber) + '</NumeroControl>\n';
    xml += '    <FechaOperacion>' + esc(date) + '</FechaOperacion>\n';
    xml += '    <CodigoConcepto>' + esc(row.conceptCode.padStart(3, '0')) + '</CodigoConcepto>\n';
    xml += '    <MontoOperacion>' + row.baseAmountBs.toFixed(2) + '</MontoOperacion>\n';
    xml += '    <PorcentajeRetencion>' + row.retentionRate.toFixed(2) + '</PorcentajeRetencion>\n';
    xml += '  </DetalleRetencion>\n';
  }
  return xml + '</RelacionRetencionesISLR>';
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
 * TXT auxiliar de operaciones ISLR: conserva la misma población del XML mensual,
 * incluidas las operaciones cuyo importe retenido sea cero.
 */
export function generateSeniatIslrOperationsTxt(
  company: Company, purchases: PurchaseRecord[], vouchers: IslrRetentionVoucher[],
  period: string, events?: IslrFiscalEvent[]
): string {
  return buildIslrOperationRows(company, purchases, vouchers, period, events).map(row => {
    const parts = row.invoiceDate.split('-');
    const date = parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : row.invoiceDate;
    return [
      cleanRif(company.rif), period, cleanRif(row.supplierRif), row.conceptCode.padStart(3, '0'),
      row.invoiceNumber, row.controlNumber, date, row.baseAmountBs.toFixed(2),
      row.retentionRate.toFixed(2), row.subtrahendBs.toFixed(2), row.withheldAmountBs.toFixed(2)
    ].join('\t');
  }).join('\r\n');
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
