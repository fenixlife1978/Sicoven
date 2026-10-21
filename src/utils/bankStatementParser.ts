import * as XLSX from 'xlsx';
import { BankMovementType } from '../types/accounting';

export interface ParsedBankStatementRow {
  rowNumber: number;
  date: string; // YYYY-MM-DD
  day?: string | number;
  reference: string;
  description: string;
  movementTypeLabel?: string;
  type: BankMovementType; // 'DEBIT' | 'CREDIT'
  amountBs: number;
  amountUsd: number;
  balanceBs?: number;
  raw: Record<string, any>;
}

export interface BankStatementSummaryMetadata {
  initialBalance?: number;
  finalBalance?: number;
  totalCredits?: number;
  totalDebits?: number;
  totalCredit?: number;
  totalDebit?: number;
  averageBalance?: number;
}

export interface BankStatementParseResult {
  success: boolean;
  error?: string;
  fileName: string;
  sheetName: string;
  headerRowIndex: number;
  detectedColumns: {
    day?: string;
    date?: string;
    reference?: string;
    description?: string;
    movementType?: string;
    credit?: string;
    debit?: string;
    balance?: string;
    initialBalance?: string;
    finalBalance?: string;
    totalCredit?: string;
    totalDebit?: string;
    averageBalance?: string;
  };
  rows: ParsedBankStatementRow[];
  summary: BankStatementSummaryMetadata;
}

/**
 * Normaliza una cadena para comparaciones de encabezados
 */
function normalizeHeader(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]/g, ''); // Solo alfanumérico
}

/**
 * Convierte cualquier formato numérico (incluyendo formato venezolano 1.250,50 o con paréntesis)
 */
export function parseNumericValue(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim();
  if (!str) return 0;

  // Detectar signo negativo por paréntesis ej: (120,50)
  const isNegative = str.startsWith('(') && str.endsWith(')') || str.startsWith('-');
  str = str.replace(/[()\-Bs\$\s]/gi, '').trim();

  // Si tiene puntos y comas: "1.250,50" -> "1250.50"
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    // Caso "1250,50"
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

/**
 * Convierte un valor de fecha (Serial Excel, DD/MM/YYYY, YYYY-MM-DD, etc.) a YYYY-MM-DD
 */
export function parseExcelDate(val: any, fallbackYear = 2026, fallbackMonth = 10): string {
  if (val === null || val === undefined || val === '') {
    return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-01`;
  }

  // 1. Número serial de Excel (ej: 46315)
  if (typeof val === 'number') {
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj && dateObj.y && dateObj.m && dateObj.d) {
        return `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
      }
    } catch {
      // fallback
    }
  }

  // 2. Si ya es instancia de Date
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }

  // 3. Cadena de texto
  const str = String(val).trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmyMatch) {
    const day = String(dmyMatch[1]).padStart(2, '0');
    const month = String(dmyMatch[2]).padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${String(ymdMatch[2]).padStart(2, '0')}-${String(ymdMatch[3]).padStart(2, '0')}`;
  }

  // Si solo es el día (ej: "15" o "5")
  if (/^\d{1,2}$/.test(str)) {
    const dayNum = parseInt(str, 10);
    if (dayNum >= 1 && dayNum <= 31) {
      return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }
  }

  return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-01`;
}

/**
 * Analiza un archivo Excel / CSV de estado de cuenta bancario
 */
export async function parseBankStatementExcel(
  file: File,
  bcvRate: number = 68.50
): Promise<BankStatementParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return {
      success: false,
      error: 'El archivo Excel no contiene ninguna hoja de cálculo válida.',
      fileName: file.name,
      sheetName: '',
      headerRowIndex: -1,
      detectedColumns: {},
      rows: [],
      summary: {}
    };
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawSheetData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawSheetData.length === 0) {
    return {
      success: false,
      error: 'La hoja de cálculo está vacía.',
      fileName: file.name,
      sheetName,
      headerRowIndex: -1,
      detectedColumns: {},
      rows: [],
      summary: {}
    };
  }

  // 1. DETECTAR FILA DE ENCABEZADOS (Score-based detection)
  let bestRowIndex = 0;
  let maxScore = 0;

  const keywords = [
    'dia', 'fecha', 'referencia', 'ref', 'descripcion', 'concepto', 'tipo',
    'movimiento', 'credito', 'abono', 'debito', 'cargo', 'saldo', 'balance'
  ];

  for (let r = 0; r < Math.min(rawSheetData.length, 25); r++) {
    const row = rawSheetData[r];
    if (!Array.isArray(row)) continue;

    let score = 0;
    for (const cell of row) {
      const norm = normalizeHeader(cell);
      if (keywords.some(kw => norm.includes(kw))) {
        score++;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestRowIndex = r;
    }
  }

  const headerRow = rawSheetData[bestRowIndex] || [];
  const headerMap: Record<number, string> = {};
  const detectedCols: BankStatementParseResult['detectedColumns'] = {};

  // 2. MAPEAR COLUMNAS SEGÚN ESPECIFICACIÓN DEL USUARIO:
  // "Día Referencia Descripción Fecha Tipo de Movimiento Crédito Débito Saldo Saldo Inicial Saldo Final Total Crédito Todal Débito Saldo Promedio"
  headerRow.forEach((cell, colIdx) => {
    const rawName = String(cell || '').trim();
    const norm = normalizeHeader(cell);
    headerMap[colIdx] = rawName;

    if (!norm) return;

    if (norm === 'dia') {
      detectedCols.day = rawName;
    } else if (norm.includes('fecha') && !norm.includes('valor')) {
      detectedCols.date = rawName;
    } else if (norm.includes('referencia') || norm === 'ref' || norm.includes('numdoc') || norm.includes('documento')) {
      detectedCols.reference = rawName;
    } else if (norm.includes('descripcion') || norm.includes('concepto') || norm.includes('detalle')) {
      detectedCols.description = rawName;
    } else if (norm.includes('tipodemovimiento') || norm.includes('tipomov') || norm === 'tipo') {
      detectedCols.movementType = rawName;
    } else if (norm.includes('saldoinicial')) {
      detectedCols.initialBalance = rawName;
    } else if (norm.includes('saldofinal')) {
      detectedCols.finalBalance = rawName;
    } else if (norm.includes('totalcredito') || norm.includes('todalcredito')) {
      detectedCols.totalCredit = rawName;
    } else if (norm.includes('totaldebito') || norm.includes('todaldebito')) {
      detectedCols.totalDebit = rawName;
    } else if (norm.includes('saldopromedio')) {
      detectedCols.averageBalance = rawName;
    } else if (norm.includes('credito') || norm.includes('abono') || norm.includes('deposito')) {
      detectedCols.credit = rawName;
    } else if (norm.includes('debito') || norm.includes('cargo') || norm.includes('retiro')) {
      detectedCols.debit = rawName;
    } else if (norm === 'saldo' || norm.includes('saldodisponible') || norm === 'balance') {
      detectedCols.balance = rawName;
    }
  });

  // Índices mapeados
  const colIndexMap: { [key: string]: number } = {};
  headerRow.forEach((cell, idx) => {
    const raw = String(cell || '').trim();
    if (raw === detectedCols.day) colIndexMap.day = idx;
    if (raw === detectedCols.date) colIndexMap.date = idx;
    if (raw === detectedCols.reference) colIndexMap.reference = idx;
    if (raw === detectedCols.description) colIndexMap.description = idx;
    if (raw === detectedCols.movementType) colIndexMap.movementType = idx;
    if (raw === detectedCols.credit) colIndexMap.credit = idx;
    if (raw === detectedCols.debit) colIndexMap.debit = idx;
    if (raw === detectedCols.balance) colIndexMap.balance = idx;
    if (raw === detectedCols.initialBalance) colIndexMap.initialBalance = idx;
    if (raw === detectedCols.finalBalance) colIndexMap.finalBalance = idx;
    if (raw === detectedCols.totalCredit) colIndexMap.totalCredit = idx;
    if (raw === detectedCols.totalDebit) colIndexMap.totalDebit = idx;
    if (raw === detectedCols.averageBalance) colIndexMap.averageBalance = idx;
  });

  // Si no se detectó fecha pero sí día
  if (colIndexMap.date === undefined && colIndexMap.day !== undefined) {
    colIndexMap.date = colIndexMap.day;
  }

  // 3. EXTRAER FILAS DE MOVIMIENTOS
  const rows: ParsedBankStatementRow[] = [];
  const summary: BankStatementSummaryMetadata = {};

  for (let r = bestRowIndex + 1; r < rawSheetData.length; r++) {
    const row = rawSheetData[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Convertir fila a objeto crudo
    const rawObj: Record<string, any> = {};
    row.forEach((cell, cIdx) => {
      const headerName = headerMap[cIdx] || `Col_${cIdx}`;
      rawObj[headerName] = cell;
    });

    const refVal = colIndexMap.reference !== undefined ? String(row[colIndexMap.reference] || '').trim() : '';
    const descVal = colIndexMap.description !== undefined ? String(row[colIndexMap.description] || '').trim() : '';
    const dateCell = colIndexMap.date !== undefined ? row[colIndexMap.date] : '';
    const dayCell = colIndexMap.day !== undefined ? row[colIndexMap.day] : '';
    const movTypeCell = colIndexMap.movementType !== undefined ? String(row[colIndexMap.movementType] || '').trim() : '';

    const combinedText = `${refVal} ${descVal} ${movTypeCell}`.toUpperCase();

    // 4. DETECTAR FILAS DE TOTALES / RESUMEN (No son transacciones)
    if (
      combinedText.includes('TOTAL') ||
      combinedText.includes('SALDO INICIAL') ||
      combinedText.includes('SALDO FINAL') ||
      combinedText.includes('SALDO PROMEDIO') ||
      combinedText.includes('RESUMEN DE CUENTA')
    ) {
      if (colIndexMap.initialBalance !== undefined) summary.initialBalance = parseNumericValue(row[colIndexMap.initialBalance]);
      if (colIndexMap.finalBalance !== undefined) summary.finalBalance = parseNumericValue(row[colIndexMap.finalBalance]);
      if (colIndexMap.totalCredit !== undefined) summary.totalCredit = parseNumericValue(row[colIndexMap.totalCredit]);
      if (colIndexMap.totalDebit !== undefined) summary.totalDebit = parseNumericValue(row[colIndexMap.totalDebit]);
      if (colIndexMap.averageBalance !== undefined) summary.averageBalance = parseNumericValue(row[colIndexMap.averageBalance]);
      continue;
    }

    // Extraer montos
    const creditVal = colIndexMap.credit !== undefined ? parseNumericValue(row[colIndexMap.credit]) : 0;
    const debitVal = colIndexMap.debit !== undefined ? parseNumericValue(row[colIndexMap.debit]) : 0;
    const balanceVal = colIndexMap.balance !== undefined ? parseNumericValue(row[colIndexMap.balance]) : undefined;

    // Si ambos son 0 y no hay descripción relevante, saltar
    if (creditVal === 0 && debitVal === 0 && !descVal) {
      continue;
    }

    // Determinar Naturaleza (DEBIT vs CREDIT)
    let type: BankMovementType = 'CREDIT';
    let amountBs = 0;

    if (creditVal > 0) {
      type = 'CREDIT';
      amountBs = creditVal;
    } else if (debitVal > 0) {
      type = 'DEBIT';
      amountBs = debitVal;
    } else {
      // Si el archivo usa signo o Tipo de Movimiento
      const movNorm = normalizeHeader(movTypeCell);
      if (
        movNorm.includes('deb') ||
        movNorm.includes('nd') ||
        movNorm.includes('cargo') ||
        movNorm.includes('chq') ||
        movNorm.includes('comis') ||
        movNorm.includes('igtf')
      ) {
        type = 'DEBIT';
        amountBs = Math.abs(debitVal || creditVal);
      } else {
        type = 'CREDIT';
        amountBs = Math.abs(creditVal || debitVal);
      }
    }

    if (amountBs <= 0) continue;

    // Parsear fecha
    const parsedDate = parseExcelDate(dateCell || dayCell);

    // Formatear referencia
    let cleanRef = refVal;
    if (!cleanRef || cleanRef === '0') {
      cleanRef = `OP-${parsedDate.replace(/-/g, '')}-${r}`;
    }

    // Descripción por defecto si viene vacía
    const cleanDesc = descVal || (type === 'CREDIT' ? 'Depósito / Abono en cuenta' : 'Cargo / Nota de Débito bancaria');

    const rate = bcvRate > 0 ? bcvRate : 68.50;
    const amountUsd = Number((amountBs / rate).toFixed(2));

    rows.push({
      rowNumber: r + 1,
      date: parsedDate,
      day: dayCell,
      reference: cleanRef,
      description: cleanDesc,
      movementTypeLabel: movTypeCell || (type === 'CREDIT' ? 'NC / Abono' : 'ND / Cargo'),
      type,
      amountBs: Number(amountBs.toFixed(2)),
      amountUsd,
      balanceBs: balanceVal !== undefined ? Number(balanceVal.toFixed(2)) : undefined,
      raw: rawObj
    });
  }

  // Si no se extrajeron resúmenes de filas separadas, calcularlos
  if (!summary.totalCredit) {
    summary.totalCredit = Number(rows.filter(r => r.type === 'CREDIT').reduce((s, r) => s + r.amountBs, 0).toFixed(2));
  }
  if (!summary.totalDebit) {
    summary.totalDebit = Number(rows.filter(r => r.type === 'DEBIT').reduce((s, r) => s + r.amountBs, 0).toFixed(2));
  }

  return {
    success: rows.length > 0,
    error: rows.length === 0 ? 'No se identificaron transacciones válidas en el archivo Excel.' : undefined,
    fileName: file.name,
    sheetName,
    headerRowIndex: bestRowIndex,
    detectedColumns: detectedCols,
    rows,
    summary
  };
}

/**
 * Genera un archivo Excel .xlsx de ejemplo con el formato estándar venezolano
 */
export function generateSampleBankStatementWorkbook(
  bankName = 'Banco Nacional de Crédito (BNC)',
  accountNumber = '0191-0001-23-4567890123'
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Columnas exactas solicitadas por el usuario:
  // Día, Referencia, Descripción, Fecha, Tipo de Movimiento, Crédito, Débito, Saldo, Saldo Inicial, Saldo Final, Total Crédito, Todal Débito, Saldo Promedio
  const sampleData = [
    // Metadatos de cabecera bancaria (común en bancos venezolanos)
    [`ESTADO DE CUENTA BANCARIO - ${bankName.toUpperCase()}`],
    [`Cuenta N°: ${accountNumber} • RIF: J-30492817-4`],
    [`Período: 01/10/2026 al 31/10/2026 • Moneda: Bolívares (Bs.)`],
    [], // Fila vacía
    // Fila de encabezados de datos
    [
      'Día',
      'Referencia',
      'Descripción',
      'Fecha',
      'Tipo de Movimiento',
      'Crédito',
      'Débito',
      'Saldo',
      'Saldo Inicial',
      'Saldo Final',
      'Total Crédito',
      'Todal Débito',
      'Saldo Promedio'
    ],
    // Fila 1: Saldo inicial
    ['01', '00000000', 'SALDO INICIAL DEL MES', '01/10/2026', 'SI', 0, 0, 185000.00, 185000.00, 0, 0, 0, 185000.00],
    // Movimientos reales coincidentes con los asientos del sistema
    ['02', '1049281', 'DEPOSITO CHEQUE COBRO FACTURA V-1029', '02/10/2026', 'DEP', 45000.00, 0, 230000.00, '', '', '', '', ''],
    ['05', '984021', 'PAGO PROVEEDOR DISTRIBUIDORA ANDINA', '05/10/2026', 'TRANSF', 0, 28000.00, 202000.00, '', '', '', '', ''],
    ['08', '773019', 'PAGO MOVIL C2P VENTA DE CONTADO', '08/10/2026', 'PAGOMOVIL', 12500.50, 0, 214500.50, '', '', '', '', ''],
    ['12', 'CHQ-504', 'CHEQUE DE GERENCIA PAGO ALQUILER', '12/10/2026', 'CHQ', 0, 35000.00, 179500.50, '', '', '', '', ''],
    ['15', '004928', 'TRANSFERENCIA RECIBIDA CLIENTE INVERSIONES', '15/10/2026', 'TRANSF', 58400.00, 0, 237900.50, '', '', '', '', ''],
    ['18', '991024', 'COMISION POR MANTENIMIENTO DE CUENTA', '18/10/2026', 'ND', 0, 120.00, 237780.50, '', '', '', '', ''],
    ['20', '881092', 'DEBITO I.G.T.F. LEY IMPUESTO GRANDES TRANSACC.', '20/10/2026', 'ND', 0, 560.00, 237220.50, '', '', '', '', ''],
    ['25', '604928', 'PAGO DE NOMINA QUINCENAL EMPLEADOS', '25/10/2026', 'TRANSF', 0, 42000.00, 195220.50, '', '', '', '', ''],
    ['28', '330192', 'ABONO INTERESES GANADOS MES OCTUBRE', '28/10/2026', 'NC', 850.00, 0, 196070.50, '', '', '', '', ''],
    ['30', '110294', 'COBRO PUNTO DE VENTA LIQUIDACION DIARIA', '30/10/2026', 'PUNTOVENTA', 34200.00, 0, 230270.50, '', '', '', '', ''],
    // Fila de resumen al pie
    ['31', '99999999', 'TOTALES Y SALDO FINAL DEL PERIODO', '31/10/2026', 'TOTAL', 150950.50, 105680.00, 230270.50, 185000.00, 230270.50, 150950.50, 105680.00, 212500.00]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);

  // Anchos de columna automáticos
  ws['!cols'] = [
    { wch: 8 },  // Día
    { wch: 16 }, // Referencia
    { wch: 42 }, // Descripción
    { wch: 14 }, // Fecha
    { wch: 20 }, // Tipo Movimiento
    { wch: 16 }, // Crédito
    { wch: 16 }, // Débito
    { wch: 16 }, // Saldo
    { wch: 16 }, // Saldo Inicial
    { wch: 16 }, // Saldo Final
    { wch: 16 }, // Total Crédito
    { wch: 16 }, // Todal Débito
    { wch: 16 }  // Saldo Promedio
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'EstadoDeCuenta');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as unknown as Uint8Array;
}
