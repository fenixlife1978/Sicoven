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
 * Prefijos válidos para RIF según la estructura legal venezolana (SENIAT).
 * V = Venezolano (persona natural)
 * J = Jurídico (empresas / sociedades comerciales)
 * G = Gubernamental (entes del Estado)
 * E = Extranjero (persona natural extranjera residente)
 * P = Pasaporte (persona extranjera no residente)
 */
export const VALID_RIF_PREFIXES = ['V', 'J', 'G', 'E', 'P'] as const;
export type RifPrefix = (typeof VALID_RIF_PREFIXES)[number];

export interface RifValidationResult {
  isValid: boolean;
  error: string | null;
  formattedRif: string;
}

/**
 * Clean RIF to SENIAT standard format without dashes: e.g., "J408921823"
 */
export function cleanRif(rif: string): string {
  return rif.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Valida que un RIF cumpla con la estructura legal venezolana:
 * - Debe iniciar con una letra válida: V, J, G, E o P (insensible a mayúsculas/minúsculas).
 * - La sección numérica posterior al prefijo debe contener exactamente 8 o 9 dígitos.
 * - Admite entradas con o sin guiones (ej. "J-12345678-9", "V133135215", "G-20000000-1").
 */
export function validateVenezuelanRif(rawRif: string | null | undefined): RifValidationResult {
  if (!rawRif || !rawRif.trim()) {
    return {
      isValid: false,
      error: 'El RIF es obligatorio.',
      formattedRif: '',
    };
  }

  const clean = cleanRif(rawRif);

  if (clean.length === 0) {
    return {
      isValid: false,
      error: 'El RIF no contiene caracteres válidos.',
      formattedRif: '',
    };
  }

  const prefix = clean[0];
  if (!VALID_RIF_PREFIXES.includes(prefix as RifPrefix)) {
    return {
      isValid: false,
      error: `Prefijo inválido '${prefix}'. El RIF debe iniciar con V, J, G, E o P según la estructura legal venezolana.`,
      formattedRif: clean,
    };
  }

  const digits = clean.slice(1);
  if (!/^\d+$/.test(digits)) {
    return {
      isValid: false,
      error: 'Los caracteres posteriores al prefijo deben ser exclusivamente dígitos numéricos.',
      formattedRif: clean,
    };
  }

  if (digits.length < 8) {
    return {
      isValid: false,
      error: `El RIF está incompleto. Debe tener al menos 8 dígitos numéricos (ej. ${prefix}-1234567-8 o ${prefix}-12345678-9).`,
      formattedRif: clean,
    };
  }

  if (digits.length > 9) {
    return {
      isValid: false,
      error: `El RIF excede la longitud legal máxima de 9 dígitos numéricos (actualmente tiene ${digits.length} dígitos).`,
      formattedRif: clean,
    };
  }

  const formattedRif =
    digits.length === 9
      ? `${prefix}-${digits.slice(0, 8)}-${digits.slice(8)}`
      : `${prefix}-${digits.slice(0, 7)}-${digits.slice(7)}`;

  return {
    isValid: true,
    error: null,
    formattedRif,
  };
}

/**
 * Retorna true si el RIF cumple la estructura legal venezolana (V, J, G, E, P).
 */
export function isValidVenezuelanRif(rif: string | null | undefined): boolean {
  return validateVenezuelanRif(rif).isValid;
}

/**
 * Format standard displayed RIF: e.g. "J-40892182-3"
 */
export function formatRif(rif: string): string {
  const validation = validateVenezuelanRif(rif);
  if (validation.isValid) {
    return validation.formattedRif;
  }
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
