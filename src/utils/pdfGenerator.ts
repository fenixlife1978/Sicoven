import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Company, JournalEntry, PurchaseRecord, SaleRecord } from '../types/accounting';
import { formatBs, formatUsd, formatDate, formatNumberVe } from './formatters';
import { DEFAULT_LOGO_LOS_ANDES } from '../data/defaultLogos';

/**
 * Helper to convert any image or SVG data-uri into PNG data URL for jsPDF
 */
async function getRasterizedLogo(imageSrc?: string): Promise<string | null> {
  const src = imageSrc || DEFAULT_LOGO_LOS_ANDES;
  if (src.startsWith('data:image/png') || src.startsWith('data:image/jpeg')) {
    return src;
  }

  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || 200;
        canvas.height = img.height || 60;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
          return;
        }
      } catch {
        resolve(null);
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Standard Venezuelan Accounting Header for PDF
 */
async function addPdfHeader(
  doc: jsPDF,
  company: Company,
  reportTitle: string,
  subtitle: string
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  let currentY = 14;

  // Render Company Logo
  try {
    const logoData = await getRasterizedLogo(company.logoUrl);
    if (logoData) {
      doc.addImage(logoData, 'PNG', 14, currentY, 48, 15);
    }
  } catch {
    // If image fails, fallback to elegant text block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(company.name.slice(0, 25), 14, currentY + 6);
  }

  // Right-aligned company legal data
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(company.name, pageWidth - 14, currentY + 3, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`RIF: ${company.rif} • ${company.taxpayerType === 'ESPECIAL' ? 'Contribuyente Especial SENIAT' : 'Contribuyente Ordinario'}`, pageWidth - 14, currentY + 7, { align: 'right' });
  doc.text(company.address.slice(0, 60), pageWidth - 14, currentY + 11, { align: 'right' });

  currentY += 19;

  // Separator line
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.8);
  doc.line(14, currentY, pageWidth - 14, currentY);

  currentY += 6;

  // Report Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(reportTitle.toUpperCase(), 14, currentY);

  // Subtitle / Notes & BCV Rate
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, currentY + 4.5);

  const bcvText = `Tasa BCV: Bs. ${company.bcvRate.toFixed(2)}/$ • Moneda: Bs. y USD`;
  doc.text(bcvText, pageWidth - 14, currentY + 4.5, { align: 'right' });

  return currentY + 9;
}

/**
 * Standard Venezuelan Accounting Footer with Signatures & Page Numbers
 */
function addPdfFooter(doc: jsPDF, totalPagesPlaceholder: string = '') {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);

    // Bottom border
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    // Left info
    doc.text(
      'SICOVEN • Sistema Contable VEN-NIF & SENIAT • Normas de Información Financiera de Venezuela',
      14,
      pageHeight - 8
    );

    // Right page number
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: 'right'
    });
  }
}

/**
 * Add signature block on the last page of official statements
 */
function addSignatureBlock(doc: jsPDF, startY: number, company: Company) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // If near bottom, create new page
  if (startY > pageHeight - 45) {
    doc.addPage();
    startY = 35;
  }

  const y = startY + 18;
  const col1X = 25;
  const col2X = pageWidth - 85;
  const lineW = 60;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);

  // Line 1
  doc.line(col1X, y, col1X + lineW, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('CONTADOR PÚBLICO COLEGIADO', col1X + lineW / 2, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('C.P.C. N° ___________', col1X + lineW / 2, y + 8, { align: 'center' });

  // Line 2
  doc.line(col2X, y, col2X + lineW, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('REPRESENTANTE LEGAL', col2X + lineW / 2, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(company.name.slice(0, 30), col2X + lineW / 2, y + 8, { align: 'center' });
}

/**
 * 1. EXPORT LIBRO DIARIO TO PDF
 */
export async function exportDiarioPdf(
  company: Company,
  entries: JournalEntry[],
  displayCurrency: 'BS' | 'USD' | 'DUAL'
) {
  // Landscape is preferred for accounting journals to accommodate dual currencies
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  const startY = await addPdfHeader(
    doc,
    company,
    'Libro Diario General',
    `Ejercicio Económico ${company.fiscalYear} • Principios VEN-NIF (FCCPV)`
  );

  const tableBody: any[] = [];
  let totalDebitBs = 0;
  let totalCreditBs = 0;
  let totalDebitUsd = 0;
  let totalCreditUsd = 0;

  for (const entry of entries) {
    // Entry header row
    tableBody.push([
      {
        content: `Asiento N° ${entry.entryNumber} • Fecha: ${formatDate(entry.date)} • Tipo: ${entry.type} ${entry.referenceDoc ? `(Ref: ${entry.referenceDoc})` : ''} - Glosa: ${entry.description}`,
        colSpan: 6,
        styles: { fillColor: [241, 245, 249], fontStyle: 'bold', textColor: [15, 23, 42] }
      }
    ]);

    for (const item of entry.items) {
      totalDebitBs += item.debitBs || 0;
      totalCreditBs += item.creditBs || 0;
      totalDebitUsd += item.debitUsd || 0;
      totalCreditUsd += item.creditUsd || 0;

      tableBody.push([
        item.accountCode,
        item.accountName,
        item.debitBs > 0 ? formatNumberVe(item.debitBs) : '-',
        item.creditBs > 0 ? formatNumberVe(item.creditBs) : '-',
        item.debitUsd > 0 ? `$ ${item.debitUsd.toFixed(2)}` : '-',
        item.creditUsd > 0 ? `$ ${item.creditUsd.toFixed(2)}` : '-'
      ]);
    }
  }

  // Summary row
  tableBody.push([
    { content: 'TOTALES SUMAS IGUALES:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } },
    { content: formatNumberVe(totalDebitBs), styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } },
    { content: formatNumberVe(totalCreditBs), styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } },
    { content: `$ ${totalDebitUsd.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } },
    { content: `$ ${totalCreditUsd.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [226, 232, 240] } }
  ]);

  autoTable(doc, {
    startY,
    head: [['Código Cuenta', 'Denominación de la Cuenta', 'Debe (Bs.)', 'Haber (Bs.)', 'Debe ($ USD)', 'Haber ($ USD)']],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    columnStyles: {
      0: { cellWidth: 28, font: 'courier' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 32, halign: 'right', font: 'courier' },
      3: { cellWidth: 32, halign: 'right', font: 'courier' },
      4: { cellWidth: 26, halign: 'right', font: 'courier' },
      5: { cellWidth: 26, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Libro_Diario_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 2. EXPORT LIBRO MAYOR TO PDF
 */
export async function exportMayorPdf(
  company: Company,
  accountsWithMovements: any[],
  displayCurrency: 'BS' | 'USD' | 'DUAL'
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const startY = await addPdfHeader(
    doc,
    company,
    'Libro Mayor Analítico',
    `Movimientos y Saldos por Cuenta • Normas VEN-NIF • Ejercicio ${company.fiscalYear}`
  );

  const tableBody: any[] = [];

  for (const acc of accountsWithMovements) {
    // Account section header
    tableBody.push([
      {
        content: `CUENTA: ${acc.code} - ${acc.name} (${acc.type}) | SALDO: ${formatBs(acc.balanceBs)} (${formatUsd(acc.balanceUsd)}) [${acc.balanceNature}]`,
        colSpan: 5,
        styles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
      }
    ]);

    for (const mov of acc.movements) {
      tableBody.push([
        formatDate(mov.date),
        `#${mov.entryNumber}`,
        mov.description,
        mov.debitBs > 0 ? formatNumberVe(mov.debitBs) : '-',
        mov.creditBs > 0 ? formatNumberVe(mov.creditBs) : '-'
      ]);
    }

    // Account total footer
    tableBody.push([
      { content: `TOTAL ${acc.code}:`, colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: formatNumberVe(acc.totalDebitBs), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: formatNumberVe(acc.totalCreditBs), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } }
    ]);
  }

  autoTable(doc, {
    startY,
    head: [['Fecha', 'Asiento', 'Concepto / Operación', 'Debe (Bs.)', 'Haber (Bs.)']],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22, font: 'courier' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 32, halign: 'right', font: 'courier' },
      4: { cellWidth: 32, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Libro_Mayor_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 3. EXPORT BALANCE DE COMPROBACIÓN TO PDF
 */
export async function exportBalanceComprobacionPdf(company: Company, accounts: any[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const startY = await addPdfHeader(
    doc,
    company,
    'Balance de Comprobación de Sumas y Saldos',
    `Al ${new Date().toLocaleDateString('es-VE')} • Normas VEN-NIF (FCCPV)`
  );

  const activeAccounts = accounts.filter(a => a.hasMovement);
  const tableBody: any[] = [];

  let sumDebit = 0;
  let sumCredit = 0;
  let sumBalDebit = 0;
  let sumBalCredit = 0;

  for (const acc of activeAccounts) {
    sumDebit += acc.totalDebitBs;
    sumCredit += acc.totalCreditBs;
    sumBalDebit += acc.adjustedDebitBs;
    sumBalCredit += acc.adjustedCreditBs;

    tableBody.push([
      acc.code,
      acc.name,
      acc.totalDebitBs > 0 ? formatNumberVe(acc.totalDebitBs) : '-',
      acc.totalCreditBs > 0 ? formatNumberVe(acc.totalCreditBs) : '-',
      acc.adjustedDebitBs > 0 ? formatNumberVe(acc.adjustedDebitBs) : '-',
      acc.adjustedCreditBs > 0 ? formatNumberVe(acc.adjustedCreditBs) : '-'
    ]);
  }

  // Grand totals
  tableBody.push([
    { content: 'TOTALES Y COMPROBACIÓN:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(sumDebit), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [52, 211, 153] } },
    { content: formatNumberVe(sumCredit), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [52, 211, 153] } },
    { content: formatNumberVe(sumBalDebit), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [56, 189, 248] } },
    { content: formatNumberVe(sumBalCredit), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [56, 189, 248] } }
  ]);

  autoTable(doc, {
    startY,
    head: [
      [
        { content: 'Código', rowSpan: 2 },
        { content: 'Cuenta Contable', rowSpan: 2 },
        { content: 'SUMAS DEL MAYOR', colSpan: 2, styles: { halign: 'center' } },
        { content: 'SALDOS AJUSTADOS', colSpan: 2, styles: { halign: 'center' } }
      ],
      ['Debe (Bs.)', 'Haber (Bs.)', 'Deudor (Bs.)', 'Acreedor (Bs.)']
    ],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 26, font: 'courier' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28, halign: 'right', font: 'courier' },
      3: { cellWidth: 28, halign: 'right', font: 'courier' },
      4: { cellWidth: 28, halign: 'right', font: 'courier' },
      5: { cellWidth: 28, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Balance_Comprobacion_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 4. EXPORT BALANCE GENERAL & ESTADO DE RESULTADOS TO PDF
 */
export async function exportBalanceGeneralPdf(
  company: Company,
  activoAccounts: any[],
  pasivoAccounts: any[],
  patrimonioAccounts: any[],
  ingresosAccounts: any[],
  costosAccounts: any[],
  gastosAccounts: any[],
  totals: {
    totalActivoBs: number;
    totalPasivoBs: number;
    totalPatrimonioBs: number;
    totalPasivoPatrimonioBs: number;
    totalIngresosBs: number;
    totalCostosBs: number;
    totalGastosBs: number;
    utilidadNetaBs: number;
  }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const startY = await addPdfHeader(
    doc,
    company,
    'Estado de Situación Financiera y Estado de Resultados',
    `Clasificado según VEN-NIF NIC 1 • Al ${new Date().toLocaleDateString('es-VE')}`
  );

  const tableBody: any[] = [];

  // 1. ACTIVOS
  tableBody.push([
    { content: '1. ACTIVO', colSpan: 2, styles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: formatBs(totals.totalActivoBs), styles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
  ]);
  for (const acc of activoAccounts) {
    const bal = acc.adjustedDebitBs - acc.adjustedCreditBs;
    tableBody.push([acc.code, acc.name, formatNumberVe(bal)]);
  }

  // 2. PASIVOS
  tableBody.push([
    { content: '2. PASIVO', colSpan: 2, styles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: formatBs(totals.totalPasivoBs), styles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
  ]);
  for (const acc of pasivoAccounts) {
    const bal = acc.adjustedCreditBs - acc.adjustedDebitBs;
    tableBody.push([acc.code, acc.name, formatNumberVe(bal)]);
  }

  // 3. PATRIMONIO
  tableBody.push([
    { content: '3. PATRIMONIO NETO', colSpan: 2, styles: { fillColor: [168, 85, 247], textColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: formatBs(totals.totalPatrimonioBs), styles: { fillColor: [168, 85, 247], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
  ]);
  for (const acc of patrimonioAccounts) {
    const bal = acc.adjustedCreditBs - acc.adjustedDebitBs;
    tableBody.push([acc.code, acc.name, formatNumberVe(bal)]);
  }
  tableBody.push([
    '3.3.1.02',
    'Resultado Neto del Ejercicio (Ganancia / Pérdida)',
    formatNumberVe(totals.utilidadNetaBs)
  ]);

  // TOTAL PASIVO + PATRIMONIO
  tableBody.push([
    { content: 'TOTAL PASIVO + PATRIMONIO NETO:', colSpan: 2, styles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
    { content: formatBs(totals.totalPasivoPatrimonioBs), styles: { fillColor: [15, 23, 42], textColor: [56, 189, 248], fontStyle: 'bold', halign: 'right' } }
  ]);

  // ESTADO DE RESULTADOS SUMMARY
  tableBody.push([
    { content: 'ESTADO DE RESULTADOS DEL EJERCICIO (GANANCIAS Y PÉRDIDAS)', colSpan: 3, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' } }
  ]);
  tableBody.push(['4.1', '(+) Ingresos Operacionales y Ventas Netas', formatNumberVe(totals.totalIngresosBs)]);
  tableBody.push(['5.1', '(-) Costo de Ventas', `-${formatNumberVe(totals.totalCostosBs)}`]);
  tableBody.push([
    { content: '(=) UTILIDAD BRUTA EN VENTAS:', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: formatNumberVe(totals.totalIngresosBs - totals.totalCostosBs), styles: { fontStyle: 'bold', halign: 'right' } }
  ]);
  tableBody.push(['6.1', '(-) Gastos Operacionales y de Administración', `-${formatNumberVe(totals.totalGastosBs)}`]);
  tableBody.push([
    { content: '(=) RESULTADO NETO INTEGRAL DEL EJERCICIO:', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
    { content: formatBs(totals.utilidadNetaBs), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [5, 150, 105] } }
  ]);

  autoTable(doc, {
    startY,
    head: [['Código', 'Denominación de la Cuenta', 'Monto en Bolívares (Bs.)']],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 26, font: 'courier' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 42, halign: 'right', font: 'courier', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Balance_General_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 5. EXPORT BALANCE DE COMPROBACIÓN AJUSTADO (HOJA DE TRABAJO 6/8 COLUMNAS) TO PDF
 */
export async function exportBalanceAjustadoPdf(company: Company, accounts: any[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  const startY = await addPdfHeader(
    doc,
    company,
    'Balance de Comprobación Ajustado (Hoja de Trabajo)',
    `Al ${new Date().toLocaleDateString('es-VE')} • Normas VEN-NIF (FCCPV)`
  );

  const activeAccounts = accounts.filter(a => a.hasMovement);
  const tableBody: any[] = [];

  let sumPreDebe = 0;
  let sumPreHaber = 0;
  let sumAdjDebe = 0;
  let sumAdjHaber = 0;
  let sumFinalDeudor = 0;
  let sumFinalAcreedor = 0;

  for (const acc of activeAccounts) {
    sumPreDebe += acc.unadjustedDebitBs;
    sumPreHaber += acc.unadjustedCreditBs;
    sumAdjDebe += acc.adjDebitBs;
    sumAdjHaber += acc.adjCreditBs;
    sumFinalDeudor += acc.adjustedDebitBs;
    sumFinalAcreedor += acc.adjustedCreditBs;

    tableBody.push([
      acc.code,
      acc.name,
      acc.unadjustedDebitBs > 0 ? formatNumberVe(acc.unadjustedDebitBs) : '-',
      acc.unadjustedCreditBs > 0 ? formatNumberVe(acc.unadjustedCreditBs) : '-',
      acc.adjDebitBs > 0 ? formatNumberVe(acc.adjDebitBs) : '-',
      acc.adjCreditBs > 0 ? formatNumberVe(acc.adjCreditBs) : '-',
      acc.adjustedDebitBs > 0 ? formatNumberVe(acc.adjustedDebitBs) : '-',
      acc.adjustedCreditBs > 0 ? formatNumberVe(acc.adjustedCreditBs) : '-'
    ]);
  }

  // Grand totals row
  tableBody.push([
    { content: 'TOTALES Y CUADRE:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(sumPreDebe), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(sumPreHaber), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(sumAdjDebe), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [251, 191, 36] } },
    { content: formatNumberVe(sumAdjHaber), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [251, 191, 36] } },
    { content: formatNumberVe(sumFinalDeudor), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [52, 211, 153] } },
    { content: formatNumberVe(sumFinalAcreedor), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [52, 211, 153] } }
  ]);

  autoTable(doc, {
    startY,
    head: [
      [
        { content: 'Código', rowSpan: 2 },
        { content: 'Cuenta Contable', rowSpan: 2 },
        { content: 'SALDOS PREVIOS', colSpan: 2, styles: { halign: 'center' } },
        { content: 'AJUSTES DEL PERÍODO', colSpan: 2, styles: { halign: 'center' } },
        { content: 'SALDOS AJUSTADOS', colSpan: 2, styles: { halign: 'center' } }
      ],
      ['Debe (Bs.)', 'Haber (Bs.)', 'Debe (Bs.)', 'Haber (Bs.)', 'Deudor (Bs.)', 'Acreedor (Bs.)']
    ],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8, font: 'helvetica' },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 24, font: 'courier' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26, halign: 'right', font: 'courier' },
      3: { cellWidth: 26, halign: 'right', font: 'courier' },
      4: { cellWidth: 26, halign: 'right', font: 'courier' },
      5: { cellWidth: 26, halign: 'right', font: 'courier' },
      6: { cellWidth: 26, halign: 'right', font: 'courier' },
      7: { cellWidth: 26, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Balance_Comprobacion_Ajustado_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 6. EXPORT CÉDULA DE CONCILIACIÓN BANCARIA TO PDF
 */
export async function exportConciliacionPdf(
  company: Company,
  bankAccount: any,
  cutoffDate: string,
  data: {
    bankStatementBalanceBs: number;
    depositsInTransit: any[];
    checksInTransit: any[];
    adjustedBankBalanceBs: number;
    bookBalanceBs: number;
    bankCreditsNotInBooks: any[];
    bankDebitsNotInBooks: any[];
    adjustedBookBalanceBs: number;
    differenceBs: number;
  }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const startY = await addPdfHeader(
    doc,
    company,
    'Cédula de Conciliación Bancaria',
    `Banco: ${bankAccount.bankName} • Cta: ${bankAccount.accountNumber} • Al ${formatDate(cutoffDate)}`
  );

  const tableBody: any[] = [];

  // SECCIÓN 1: SALDO SEGÚN EXTRACTO BANCARIO
  tableBody.push([
    { content: '1. SALDO SEGÚN ESTADO DE CUENTA BANCARIO', colSpan: 2, styles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: formatBs(data.bankStatementBalanceBs), styles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
  ]);

  tableBody.push([
    { content: '(+) Depósitos en Tránsito (Cargados en Libros no Acreditados en Banco):', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }
  ]);
  if (data.depositsInTransit.length === 0) {
    tableBody.push(['-', 'Sin depósitos en tránsito a la fecha de corte', '0,00']);
  } else {
    for (const d of data.depositsInTransit) {
      tableBody.push([formatDate(d.date), `${d.description} ${d.referenceDoc ? `(Ref: ${d.referenceDoc})` : ''}`, formatNumberVe(d.debitBs)]);
    }
  }

  tableBody.push([
    { content: '(-) Cheques y Transferencias en Tránsito (Emitidos en Libros no Cobrados en Banco):', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }
  ]);
  if (data.checksInTransit.length === 0) {
    tableBody.push(['-', 'Sin cheques ni pagos pendientes en banco', '0,00']);
  } else {
    for (const c of data.checksInTransit) {
      tableBody.push([formatDate(c.date), `${c.description} ${c.referenceDoc ? `(Ref: ${c.referenceDoc})` : ''}`, `-${formatNumberVe(c.creditBs)}`]);
    }
  }

  tableBody.push([
    { content: '(=) SALDO BANCARIO CONCILIADO / AJUSTADO:', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'right' } },
    { content: formatBs(data.adjustedBankBalanceBs), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'right', textColor: [5, 150, 105] } }
  ]);

  // SECCIÓN 2: SALDO SEGÚN LIBROS DE CONTABILIDAD
  tableBody.push([
    { content: '2. SALDO SEGÚN LIBROS DE CONTABILIDAD (MAYOR GENERAL)', colSpan: 2, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' } },
    { content: formatBs(data.bookBalanceBs), styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } }
  ]);

  tableBody.push([
    { content: '(+) Notas de Crédito Bancarias no Registradas en Libros (Intereses / Abonos Directos):', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }
  ]);
  if (data.bankCreditsNotInBooks.length === 0) {
    tableBody.push(['-', 'Sin créditos bancarios pendientes de registrar', '0,00']);
  } else {
    for (const cr of data.bankCreditsNotInBooks) {
      tableBody.push([formatDate(cr.date), `${cr.description} (Ref: ${cr.reference})`, formatNumberVe(cr.amountBs)]);
    }
  }

  tableBody.push([
    { content: '(-) Notas de Débito Bancarias no Registradas en Libros (Comisiones / IGTF / Gastos):', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }
  ]);
  if (data.bankDebitsNotInBooks.length === 0) {
    tableBody.push(['-', 'Sin débitos bancarios pendientes de registrar', '0,00']);
  } else {
    for (const db of data.bankDebitsNotInBooks) {
      tableBody.push([formatDate(db.date), `${db.description} (Ref: ${db.reference})`, `-${formatNumberVe(db.amountBs)}`]);
    }
  }

  tableBody.push([
    { content: '(=) SALDO EN LIBROS CONCILIADO / AJUSTADO:', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'right' } },
    { content: formatBs(data.adjustedBookBalanceBs), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'right', textColor: [5, 150, 105] } }
  ]);

  // DIFERENCIA DE CONCILIACIÓN
  const isSquare = data.differenceBs < 0.05;
  tableBody.push([
    { content: isSquare ? 'ESTADO: CONCILIACIÓN CUADRADA CON ÉXITO' : 'DIFERENCIA PENDIENTE POR CONCILIAR:', colSpan: 2, styles: { fontStyle: 'bold', fillColor: isSquare ? [220, 252, 231] : [254, 226, 226], textColor: isSquare ? [22, 101, 52] : [153, 27, 27], halign: 'right' } },
    { content: formatBs(data.differenceBs), styles: { fontStyle: 'bold', fillColor: isSquare ? [220, 252, 231] : [254, 226, 226], textColor: isSquare ? [22, 101, 52] : [153, 27, 27], halign: 'right' } }
  ]);

  autoTable(doc, {
    startY,
    head: [['Fecha / Ref', 'Descripción del Concepto Bancario / Contable', 'Monto en Bolívares (Bs.)']],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 26, font: 'courier' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 44, halign: 'right', font: 'courier', fontStyle: 'bold' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Conciliacion_Bancaria_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 7. EXPORT LIBRO DE COMPRAS FISCAL TO PDF (SENIAT)
 */
export async function exportComprasPdf(
  company: Company,
  purchases: PurchaseRecord[],
  monthFilter?: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  const periodLabel = monthFilter
    ? `Período Fiscal: ${monthFilter}`
    : `Ejercicio Económico ${company.fiscalYear}`;

  const startY = await addPdfHeader(
    doc,
    company,
    'Libro de Compras Fiscal',
    `${periodLabel} • Providencia Administrativa SNAT/2015/0049 • SENIAT`
  );

  let totalMonto = 0;
  let totalExento = 0;
  let totalBase = 0;
  let totalIva = 0;
  let totalRetenido = 0;
  let totalIslrRetenido = 0;
  let totalIgtf = 0;

  const tableBody: any[] = purchases.map(p => {
    const sign = p.documentType === '03' ? -1 : 1;
    totalMonto += sign * (p.totalAmountBs || 0);
    totalExento += sign * (p.exemptAmountBs || 0);
    totalBase += sign * (p.taxableBaseBs || 0);
    totalIva += sign * (p.vatAmountBs || 0);
    totalRetenido += sign * (p.vatWithheldBs || 0);
    totalIslrRetenido += sign * (p.islrWithheldBs || 0);
    totalIgtf += sign * Number(p.igtfAmountBs || 0);

    return [
      p.opNumber,
      formatDate(p.invoiceDate),
      p.supplierRif,
      p.supplierName.slice(0, 32),
      (p.documentType === '03' ? 'NC ' : p.documentType === '02' ? 'ND ' : '') + p.invoiceNumber,
      p.controlNumber,
      formatNumberVe(sign * (p.totalAmountBs || 0)),
      Number(p.igtfAmountBs || 0) > 0 ? formatNumberVe(sign * Number(p.igtfAmountBs)) : '-',
      p.exemptAmountBs > 0 ? formatNumberVe(sign * p.exemptAmountBs) : '-',
      formatNumberVe(sign * p.taxableBaseBs),
      `${p.taxRate}%`,
      formatNumberVe(sign * p.vatAmountBs),
      p.retentionRate > 0 ? `${p.retentionRate}%` : '0%',
      p.vatWithheldBs > 0 ? formatNumberVe(sign * p.vatWithheldBs) : '-',
      p.islrWithheldBs > 0 ? formatNumberVe(sign * p.islrWithheldBs) : '-'
    ];
  });

  // Totals row
  tableBody.push([
    { content: 'TOTALES DEL PERÍODO:', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(totalMonto), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(totalIgtf), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [251, 191, 36] } },
    { content: formatNumberVe(totalExento), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(totalBase), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: '', styles: { fillColor: [15, 23, 42] } },
    { content: formatNumberVe(totalIva), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [52, 211, 153] } },
    { content: '', styles: { fillColor: [15, 23, 42] } },
    { content: formatNumberVe(totalRetenido), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [192, 132, 252] } },
    { content: formatNumberVe(totalIslrRetenido), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [129, 140, 248] } }
  ]);

  autoTable(doc, {
    startY,
    head: [[
      'Op.',
      'Fecha',
      'RIF Proveedor',
      'Razón Social',
      'N° Factura',
      'N° Control',
      'Total Compras (Bs.)',
      'IGTF (Bs.)',
      'Exento (Bs.)',
      'Base Imp. (Bs.)',
      '% Alíc.',
      'IVA Débito (Bs.)',
      '% Ret.',
      'IVA Retenido (Bs.)',
      'ISLR Retenido (Bs.)'
    ]],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 18, font: 'courier' },
      2: { cellWidth: 22, font: 'courier' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 20, font: 'courier' },
      5: { cellWidth: 20, font: 'courier' },
      6: { cellWidth: 24, halign: 'right', font: 'courier', fontStyle: 'bold' },
      7: { cellWidth: 17, halign: 'right', font: 'courier' },
      8: { cellWidth: 20, halign: 'right', font: 'courier' },
      9: { cellWidth: 22, halign: 'right', font: 'courier' },
      10: { cellWidth: 12, halign: 'center' },
      11: { cellWidth: 22, halign: 'right', font: 'courier' },
      12: { cellWidth: 12, halign: 'center' },
      13: { cellWidth: 20, halign: 'right', font: 'courier' },
      14: { cellWidth: 20, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Libro_Compras_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/**
 * 8. EXPORT LIBRO DE VENTAS FISCAL TO PDF (SENIAT)
 */
export async function exportVentasPdf(
  company: Company,
  sales: SaleRecord[],
  monthFilter?: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  const periodLabel = monthFilter
    ? `Período Fiscal: ${monthFilter}`
    : `Ejercicio Económico ${company.fiscalYear}`;

  const startY = await addPdfHeader(
    doc,
    company,
    'Libro de Ventas Fiscal',
    `${periodLabel} • Providencia Administrativa SNAT/2015/0049 • SENIAT`
  );

  let totalMonto = 0;
  let totalExento = 0;
  let totalBase = 0;
  let totalIva = 0;
  let totalRetenido = 0;
  let totalIgtf = 0;

  const tableBody: any[] = sales.map(s => {
    totalMonto += s.totalAmountBs || 0;
    totalExento += s.exemptAmountBs || 0;
    totalBase += s.taxableBaseBs || 0;
    totalIva += s.vatAmountBs || 0;
    totalRetenido += s.vatWithheldBs || 0;
    totalIgtf += s.igtfAmountBs || 0;

    return [
      s.opNumber,
      formatDate(s.invoiceDate),
      s.customerRif,
      s.customerName.slice(0, 32),
      s.invoiceNumber,
      s.controlNumber,
      formatNumberVe(s.totalAmountBs),
      s.exemptAmountBs > 0 ? formatNumberVe(s.exemptAmountBs) : '-',
      formatNumberVe(s.taxableBaseBs),
      `${s.taxRate}%`,
      formatNumberVe(s.vatAmountBs),
      s.vatWithheldBs > 0 ? formatNumberVe(s.vatWithheldBs) : '-',
      s.retentionVoucherNumber || '-',
      s.retentionVoucherDate ? formatDate(s.retentionVoucherDate) : '-',
      (s.igtfAmountBs || 0) > 0 ? formatNumberVe(s.igtfAmountBs || 0) : '-'
    ];
  });

  // Totals row
  tableBody.push([
    { content: 'TOTALES DEL PERÍODO:', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(totalMonto), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(totalExento), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: formatNumberVe(totalBase), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
    { content: '', styles: { fillColor: [15, 23, 42] } },
    { content: formatNumberVe(totalIva), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [52, 211, 153] } },
    { content: formatNumberVe(totalRetenido), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [192, 132, 252] } },
    { content: '', styles: { fillColor: [15, 23, 42] } },
    { content: '', styles: { fillColor: [15, 23, 42] } },
    { content: formatNumberVe(totalIgtf), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [125, 211, 252] } }
  ]);

  autoTable(doc, {
    startY,
    head: [[
      'Op.',
      'Fecha',
      'RIF Cliente',
      'Nombre o Razón Social',
      'N° Factura',
      'N° Control',
      'Total Ventas (Bs.)',
      'Exento (Bs.)',
      'Base Imp. (Bs.)',
      '% Alíc.',
      'IVA Débito (Bs.)',
      'IVA Retenido (Bs.)',
      'Comprobante Ret.',
      'Fecha Ret.',
      'IGTF (Bs.)'
    ]],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 18, font: 'courier' },
      2: { cellWidth: 22, font: 'courier' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 20, font: 'courier' },
      5: { cellWidth: 20, font: 'courier' },
      6: { cellWidth: 24, halign: 'right', font: 'courier', fontStyle: 'bold' },
      7: { cellWidth: 20, halign: 'right', font: 'courier' },
      8: { cellWidth: 22, halign: 'right', font: 'courier' },
      9: { cellWidth: 12, halign: 'center' },
      10: { cellWidth: 22, halign: 'right', font: 'courier' },
      11: { cellWidth: 22, halign: 'right', font: 'courier' },
      12: { cellWidth: 24, font: 'courier' },
      13: { cellWidth: 18, font: 'courier' },
      14: { cellWidth: 18, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14, bottom: 20 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;
  addSignatureBlock(doc, finalY, company);
  addPdfFooter(doc);

  const cleanName = company.name.replace(/[^A-Za-z0-9]/g, '_').slice(0, 20);
  doc.save(`Libro_Ventas_${cleanName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}


