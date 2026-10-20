/**
 * Format amounts to Venezuelan Bolivars (Bs.)
 */
export function formatBs(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Bs. 0,00';
  return (
    'Bs. ' +
    amount.toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Format amounts to US Dollars ($ USD)
 */
export function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '$ 0.00';
  return (
    '$ ' +
    amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Format dual currency string: e.g. "Bs. 1.250,00 ($ 18.25)"
 */
export function formatDualCurrency(amountBs: number, bcvRate: number): string {
  const amountUsd = bcvRate > 0 ? amountBs / bcvRate : 0;
  return `${formatBs(amountBs)} (${formatUsd(amountUsd)})`;
}

/**
 * Format raw number with 2 decimals in Venezuelan notation (1.234,56)
 */
export function formatNumberVe(amount: number): string {
  return amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Clean RIF to SENIAT standard format without dashes: e.g., "J408921823"
 */
export function cleanRif(rif: string): string {
  return rif.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Format standard displayed RIF: e.g. "J-40892182-3"
 */
export function formatRif(rif: string): string {
  const clean = cleanRif(rif);
  if (clean.length < 2) return clean;
  const letter = clean[0];
  const digits = clean.slice(1);
  if (digits.length <= 8) {
    return `${letter}-${digits}`;
  }
  return `${letter}-${digits.slice(0, 8)}-${digits.slice(8, 9)}`;
}

/**
 * Formats a 14-digit voucher number AAAAMMDDDDDDDD
 */
export function formatVoucherNumber(year: number, month: number, sequence: number): string {
  const yStr = String(year);
  const mStr = String(month).padStart(2, '0');
  const sStr = String(sequence).padStart(8, '0');
  return `${yStr}${mStr}${sStr}`;
}

/**
 * Format dates to DD/MM/YYYY
 */
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}
