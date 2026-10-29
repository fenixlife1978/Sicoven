/**
 * Sincronización de tasa BCV mediante bcv.today.
 * Una respuesta inválida o un fallo de red nunca debe sustituir la última tasa válida.
 */
export interface BcvSyncResult {
  success: boolean;
  usd: number;
  eur?: number;
  cny?: number;
  effectiveDate: string;
  updatedAt: string;
  sourceUrl: string;
  syncedAt: string;
  error?: string;
}

const BCV_API_ENDPOINTS = [
  'https://bcv.today/api/rate.json',
  'https://bcv.today/api/v1/rate.json',
];

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function positiveRate(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function validDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

/** Consulta la tasa publicada; no inventa una fecha ni acepta tasas cero, negativas o no finitas. */
export async function fetchBcvTodayRate(): Promise<BcvSyncResult> {
  let lastError = 'No se pudo conectar a los servidores de bcv.today';

  for (const endpoint of BCV_API_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status} en ${endpoint}`;
        continue;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        lastError = `Respuesta JSON inválida en ${endpoint}`;
        continue;
      }

      const data = asRecord(payload);
      const rates = asRecord(data.rates);
      const usdRate = positiveRate(data.USD, data.usd, rates.USD, data.rate);
      if (!usdRate) {
        lastError = `La respuesta de ${endpoint} no contiene una tasa USD válida`;
        continue;
      }

      const eurRate = positiveRate(data.EUR, rates.EUR);
      const cnyRate = positiveRate(data.CNY, rates.CNY);
      const publishedDate = validDate(data.effective_date) || validDate(data.date);
      const updatedAt = typeof data.updated_at === 'string' && Number.isFinite(Date.parse(data.updated_at))
        ? data.updated_at
        : new Date().toISOString();

      return {
        success: true,
        usd: Number(usdRate.toFixed(4)),
        eur: eurRate ? Number(eurRate.toFixed(4)) : undefined,
        cny: cnyRate ? Number(cnyRate.toFixed(4)) : undefined,
        // Si el proveedor no informa la fecha, no fingimos que la tasa es de hoy.
        effectiveDate: publishedDate || '',
        updatedAt,
        sourceUrl: endpoint,
        syncedAt: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      lastError = error?.name === 'AbortError'
        ? `Tiempo de espera agotado al conectar con ${endpoint}`
        : error?.message || String(err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    success: false,
    usd: 0,
    effectiveDate: '',
    updatedAt: '',
    sourceUrl: BCV_API_ENDPOINTS[0],
    syncedAt: new Date().toLocaleTimeString('es-VE'),
    error: lastError,
  };
}
