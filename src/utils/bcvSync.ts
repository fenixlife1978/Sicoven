/**
 * Sincronización Oficial de Tasa BCV con bcv.today
 * Fuente Oficial API: https://bcv.today/api/rate.json
 * Endpoint activo v1: https://bcv.today/api/v1/rate.json
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

// Endpoints prioritarios según requerimiento oficial
const BCV_API_ENDPOINTS = [
  'https://bcv.today/api/rate.json',
  'https://bcv.today/api/v1/rate.json',
];

/**
 * Consulta la tasa oficial del Banco Central de Venezuela a través de la API de bcv.today
 */
export async function fetchBcvTodayRate(): Promise<BcvSyncResult> {
  let lastError: string = 'No se pudo conectar a los servidores de bcv.today';

  for (const endpoint of BCV_API_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        lastError = `HTTP ${response.status} en ${endpoint}`;
        continue;
      }

      const data = await response.json();

      // bcv.today retorna formato: { USD: 881.0664, EUR: 991.16, effective_date: "2026-10-19", ... }
      // o { rates: { USD: ... } } o { usd: ... }
      let usdRate: number | undefined;
      let eurRate: number | undefined;
      let cnyRate: number | undefined;

      if (typeof data.USD === 'number' && data.USD > 0) {
        usdRate = data.USD;
      } else if (typeof data.usd === 'number' && data.usd > 0) {
        usdRate = data.usd;
      } else if (data.rates && typeof data.rates.USD === 'number') {
        usdRate = data.rates.USD;
      } else if (data.rate && typeof data.rate === 'number') {
        usdRate = data.rate;
      }

      if (typeof data.EUR === 'number') eurRate = data.EUR;
      if (typeof data.CNY === 'number') cnyRate = data.CNY;

      if (usdRate && usdRate > 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        return {
          success: true,
          usd: Number(usdRate.toFixed(4)),
          eur: eurRate ? Number(eurRate.toFixed(4)) : undefined,
          cny: cnyRate ? Number(cnyRate.toFixed(4)) : undefined,
          effectiveDate: data.effective_date || data.date || todayStr,
          updatedAt: data.updated_at || new Date().toISOString(),
          sourceUrl: endpoint,
          syncedAt: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastError = `Tiempo de espera agotado al conectar con ${endpoint}`;
      } else {
        lastError = err?.message || String(err);
      }
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
