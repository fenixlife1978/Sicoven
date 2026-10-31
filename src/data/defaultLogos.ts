/**
 * Logo oficial horizontal de SICOVEN utilizado como identidad predeterminada
 * para empresas que no poseen o no han cargado un logo personalizado.
 * Diseñado con alto contraste para documentos, reportes en pantalla y exportaciones PDF.
 */

export const SICOVEN_OFFICIAL_HORIZONTAL_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 300" width="1100" height="300">
  <g transform="translate(30,30) scale(0.4688)">
    <rect width="512" height="512" rx="112" fill="#14213D"/>
    <g transform="translate(0,-20)">
      <path d="M346 178 C330 140 290 124 256 124 C205 124 172 150 172 188 C172 226 205 242 256 256 C307 270 340 286 340 326 C340 364 305 390 256 390 C218 390 184 374 166 338"
            fill="none" stroke="#FFFFFF" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="150" y1="428" x2="362" y2="428" stroke="#FFC72C" stroke-width="11" stroke-linecap="round"/>
      <line x1="150" y1="448" x2="362" y2="448" stroke="#FFC72C" stroke-width="11" stroke-linecap="round"/>
    </g>
  </g>
  <text x="300" y="175" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="128" font-weight="800" letter-spacing="-3" fill="#0F172A">Sicoven</text>
  <line x1="304" y1="208" x2="880" y2="208" stroke="#FFC72C" stroke-width="6" stroke-linecap="round"/>
  <line x1="304" y1="220" x2="880" y2="220" stroke="#FFC72C" stroke-width="6" stroke-linecap="round"/>
  <text x="304" y="260" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="28" font-weight="600" letter-spacing="0.5" fill="#475569">Sistema Contable VEN-NIF &amp; SENIAT</text>
</svg>`);

// Logotipo por defecto para empresas
export const DEFAULT_COMPANY_PLACEHOLDER_LOGO = SICOVEN_OFFICIAL_HORIZONTAL_LOGO;

// Alias para retrocompatibilidad con componentes existentes
export const DEFAULT_LOGO_LOS_ANDES = SICOVEN_OFFICIAL_HORIZONTAL_LOGO;
export const DEFAULT_LOGO_CARIBE = SICOVEN_OFFICIAL_HORIZONTAL_LOGO;
