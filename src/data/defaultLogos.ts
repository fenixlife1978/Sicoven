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

/**
 * Genera dinámicamente un logotipo vectorial institucional único con las iniciales y datos reales de la empresa
 */
export function generateCompanyLogo(company: { name: string; rif?: string; taxpayerType?: string }): string {
  const safeName = (company.name || 'EMPRESA').toUpperCase().trim();
  const safeRif = (company.rif || 'J-00000000-0').toUpperCase().trim();
  const isSpecial = company.taxpayerType === 'ESPECIAL';

  // Extraer iniciales significativas
  const words = safeName
    .replace(/[^A-ZÁÉÍÓÚÑ0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => !['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'EN', 'POR', 'C.A', 'CA', 'S.A', 'SA', 'SRL', 'S.R.L', 'S.A.S', 'SAS'].includes(w));
  
  const initials = words.length >= 2 
    ? (words[0][0] + words[1][0])
    : safeName.slice(0, 2);

  const gradColor1 = isSpecial ? '#6366f1' : '#0284c7';
  const gradColor2 = isSpecial ? '#4338ca' : '#0369a1';
  const badgeLabel = isSpecial ? 'CONTRIBUYENTE ESPECIAL' : 'CONTRIBUYENTE ORDINARIO';
  const badgeColor = isSpecial ? '#7c3aed' : '#0284c7';

  const shortName = safeName.length > 26 ? safeName.slice(0, 24) + '...' : safeName;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" width="240" height="60">
    <defs>
      <linearGradient id="dyn_grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${gradColor1}" />
        <stop offset="100%" stop-color="${gradColor2}" />
      </linearGradient>
    </defs>
    <rect x="2" y="5" width="50" height="50" rx="12" fill="url(#dyn_grad)" />
    <text x="27" y="38" font-family="'Segoe UI',system-ui,sans-serif" font-weight="900" font-size="22" fill="#ffffff" text-anchor="middle" letter-spacing="1">${initials}</text>
    <text x="62" y="24" font-family="'Segoe UI',system-ui,sans-serif" font-weight="800" font-size="12" fill="#0f172a">${shortName}</text>
    <text x="62" y="38" font-family="'Segoe UI',system-ui,sans-serif" font-weight="700" font-size="9" fill="${badgeColor}">${badgeLabel}</text>
    <text x="62" y="50" font-family="'Segoe UI',system-ui,sans-serif" font-weight="600" font-size="9" fill="#64748b">RIF: ${safeRif}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/**
 * Obtiene el logo correspondiente a la empresa actual sin cruzar logos entre distintas razones sociales
 */
export function getCompanyLogo(company?: { id?: string; name?: string; rif?: string; logoUrl?: string; taxpayerType?: string } | null): string {
  if (!company) return DEFAULT_LOGO_LOS_ANDES;

  const nameUpper = (company.name || '').toUpperCase();
  const rifUpper = (company.rif || '').toUpperCase();

  // Si tiene logo personalizado específico y válido
  if (company.logoUrl && typeof company.logoUrl === 'string' && company.logoUrl.trim().length > 0) {
    // Si tiene el logo de Los Andes asignado erróneamente pero la empresa NO es Los Andes
    if (company.logoUrl === DEFAULT_LOGO_LOS_ANDES) {
      if (company.id === 'comp-1' || nameUpper.includes('LOS ANDES') || rifUpper.includes('40892182')) {
        return DEFAULT_LOGO_LOS_ANDES;
      }
      if (company.id === 'comp-2' || nameUpper.includes('CARIBE') || rifUpper.includes('50123849')) {
        return DEFAULT_LOGO_CARIBE;
      }
      return generateCompanyLogo(company as { name: string; rif?: string; taxpayerType?: string });
    }
    return company.logoUrl;
  }

  // Comprobación por ID o Nombre de empresas por defecto
  if (company.id === 'comp-1' || nameUpper.includes('LOS ANDES') || rifUpper.includes('40892182')) {
    return DEFAULT_LOGO_LOS_ANDES;
  }
  if (company.id === 'comp-2' || nameUpper.includes('CARIBE') || rifUpper.includes('50123849')) {
    return DEFAULT_LOGO_CARIBE;
  }

  // Generación automática personalizada para cualquier nueva empresa
  return generateCompanyLogo(company as { name: string; rif?: string; taxpayerType?: string });
}

