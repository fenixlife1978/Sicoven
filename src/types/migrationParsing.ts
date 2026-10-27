export type MigrationRow = Record<string, unknown>;

export const normalizeMigrationValue = (value: unknown): string =>
  String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const splitDelimited = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new Error('El archivo delimitado contiene comillas sin cerrar.');
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
};

export const parseDelimitedRecords = (text: string, requestedDelimiter?: string): MigrationRow[] => {
  const candidates = requestedDelimiter ? [requestedDelimiter] : [',', ';', '\t', '|'];
  const scored = candidates.map(delimiter => {
    const rows = splitDelimited(text, delimiter);
    const headerCount = rows[0]?.length ?? 0;
    const consistent = rows.slice(1).filter(row => row.length === headerCount).length;
    return { delimiter, rows, score: headerCount > 1 ? consistent * 100 + headerCount : 0 };
  }).sort((a, b) => b.score - a.score);
  const parsed = scored[0];
  if (!parsed || parsed.rows.length < 2 || parsed.rows[0].length < 2) return [];
  const headers = parsed.rows[0].map((header, index) => header || 'columna_' + (index + 1));
  const normalizedHeaders = headers.map(normalizeMigrationValue);
  const seenHeaders = new Set<string>();
  const duplicateHeaders = new Set<string>();
  for (const header of normalizedHeaders) {
    if (seenHeaders.has(header)) duplicateHeaders.add(header);
    seenHeaders.add(header);
  }
  if (duplicateHeaders.size) {
    throw new Error('El archivo contiene encabezados duplicados o equivalentes tras normalizar: ' +
      [...duplicateHeaders].join(', ') + '. Renombra las columnas antes de importar.');
  }
  return parsed.rows.slice(1).map(values => {
    const record: MigrationRow = {};
    headers.forEach((header, index) => { record[header] = values[index] ?? ''; });
    return record;
  }).filter(record => Object.values(record).some(value => String(value ?? '').trim() !== ''));
};

export const parseMigrationNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  let raw = String(value).trim().replace(/[\s\u00a0]/g, '').replace(/[^0-9,().+\-]/g, '');
  if (!/\d/.test(raw)) return NaN;
  if (raw.startsWith('(') && raw.endsWith(')')) raw = '-' + raw.slice(1, -1);
  const commas = (raw.match(/,/g) || []).length;
  const dots = (raw.match(/\./g) || []).length;
  if (commas && dots) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
  } else if (commas) {
    if (commas > 1 || /,\d{3}$/.test(raw)) raw = raw.replace(/,/g, '');
    else raw = raw.replace(',', '.');
  } else if (dots > 1 || /\.\d{3}$/.test(raw)) {
    raw = raw.replace(/\./g, '');
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};
