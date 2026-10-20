/**
 * SVG Logos as data URIs for default Venezuelan sample companies
 * These work seamlessly both in HTML/CSS image tags and in jsPDF / canvas!
 */

export const DEFAULT_LOGO_LOS_ANDES =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#059669" />
        <stop offset="100%" stop-color="#10b981" />
      </linearGradient>
    </defs>
    <rect x="2" y="5" width="50" height="50" rx="10" fill="url(#grad1)" />
    <!-- Mountain Peaks for Los Andes -->
    <path d="M10 44 L27 18 L44 44 Z" fill="#ffffff" opacity="0.9" />
    <path d="M22 44 L32 26 L42 44 Z" fill="#34d399" opacity="0.85" />
    <!-- Text -->
    <text x="62" y="27" font-family="sans-serif" font-weight="900" font-size="16" fill="#0f172a" letter-spacing="0.5">LOS ANDES</text>
    <text x="62" y="42" font-family="sans-serif" font-weight="700" font-size="10" fill="#059669" letter-spacing="1">DISTRIBUIDORA, C.A.</text>
    <text x="62" y="52" font-family="sans-serif" font-weight="500" font-size="8" fill="#64748b">RIF: J-40892182-3</text>
  </svg>`);

export const DEFAULT_LOGO_CARIBE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
    <defs>
      <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0284c7" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>
    </defs>
    <rect x="2" y="5" width="50" height="50" rx="10" fill="url(#grad2)" />
    <!-- Wave & Tech Symbol -->
    <circle cx="27" cy="24" r="8" fill="#ffffff" opacity="0.9" />
    <path d="M12 40 Q27 28 42 40 Q27 48 12 40" fill="#ffffff" opacity="0.9" />
    <!-- Text -->
    <text x="62" y="27" font-family="sans-serif" font-weight="900" font-size="16" fill="#0f172a" letter-spacing="0.5">CARIBE TECH</text>
    <text x="62" y="42" font-family="sans-serif" font-weight="700" font-size="10" fill="#0284c7" letter-spacing="1">SERVICIOS, S.A.</text>
    <text x="62" y="52" font-family="sans-serif" font-weight="500" font-size="8" fill="#64748b">RIF: J-50123849-1</text>
  </svg>`);

export const GENERIC_COMPANY_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
    <defs>
      <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#334155" />
        <stop offset="100%" stop-color="#475569" />
      </linearGradient>
    </defs>
    <rect x="2" y="5" width="50" height="50" rx="10" fill="url(#grad3)" />
    <!-- Building / Scales -->
    <path d="M15 42 L27 18 L39 42 Z" fill="#ffffff" opacity="0.9" />
    <text x="62" y="30" font-family="sans-serif" font-weight="900" font-size="15" fill="#0f172a">EMPRESA</text>
    <text x="62" y="46" font-family="sans-serif" font-weight="600" font-size="9" fill="#64748b">CONTABILIDAD VEN-NIF</text>
  </svg>`);
