/**
 * Logos neutrales para empresas sin imagen personalizada.
 * No contiene nombres ni RIFs de empresas ficticias de demostración.
 */

export const DEFAULT_COMPANY_PLACEHOLDER_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
    <defs>
      <linearGradient id="gradCorp" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f2b48" />
        <stop offset="100%" stop-color="#1e3a8a" />
      </linearGradient>
    </defs>
    <rect x="2" y="5" width="50" height="50" rx="10" fill="url(#gradCorp)" />
    <!-- Sello corporativo neutral -->
    <path d="M15 44 L15 22 L35 22 L35 44 Z" fill="#ffffff" opacity="0.9" />
    <path d="M25 14 L12 24 L38 24 Z" fill="#38bdf8" opacity="0.9" />
    <rect x="19" y="26" width="4" height="4" fill="#0f2b48" />
    <rect x="27" y="26" width="4" height="4" fill="#0f2b48" />
    <rect x="19" y="34" width="4" height="4" fill="#0f2b48" />
    <rect x="27" y="34" width="4" height="4" fill="#0f2b48" />
    <!-- Texto formal neutral -->
    <text x="62" y="28" font-family="sans-serif" font-weight="800" font-size="14" fill="#0f172a" letter-spacing="0.5">EMPRESA REGISTRADA</text>
    <text x="62" y="44" font-family="sans-serif" font-weight="600" font-size="10" fill="#64748b">SISTEMA CONTABLE VEN-NIF</text>
  </svg>`);

// Alias para retrocompatibilidad con componentes existentes
export const DEFAULT_LOGO_LOS_ANDES = DEFAULT_COMPANY_PLACEHOLDER_LOGO;
export const DEFAULT_LOGO_CARIBE = DEFAULT_COMPANY_PLACEHOLDER_LOGO;
