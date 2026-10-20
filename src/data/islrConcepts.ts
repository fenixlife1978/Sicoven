import { IslrConcept } from '../types/accounting';

// Conceptos de retención de ISLR según Decreto 1808 (Gaceta Oficial Extraordinaria N° 5.144)
export const ISLR_CONCEPTS: IslrConcept[] = [
  {
    code: '001',
    description: 'Honorarios profesionales pagados a Personas Naturales Residentes (Art. 9 Num. 1)',
    category: 'PN',
    isResident: true,
    rate: 3, // 3%
    appliesSubtrahend: true,
    minBaseUt: 83.3333
  },
  {
    code: '002',
    description: 'Honorarios profesionales pagados a Personas Jurídicas Domiciliadas (Art. 9 Num. 1)',
    category: 'PJ',
    isResident: true,
    rate: 5, // 5%
    appliesSubtrahend: false
  },
  {
    code: '003',
    description: 'Comisiones mercantiles pagadas a Personas Naturales Residentes (Art. 9 Num. 2)',
    category: 'PN',
    isResident: true,
    rate: 3,
    appliesSubtrahend: true
  },
  {
    code: '004',
    description: 'Comisiones mercantiles pagadas a Personas Jurídicas Domiciliadas (Art. 9 Num. 2)',
    category: 'PJ',
    isResident: true,
    rate: 5,
    appliesSubtrahend: false
  },
  {
    code: '005',
    description: 'Ejecución de obras y servicios prestados a contratistas / PJ (Art. 9 Num. 11)',
    category: 'PJ',
    isResident: true,
    rate: 2,
    appliesSubtrahend: false
  },
  {
    code: '006',
    description: 'Ejecución de obras y servicios prestados por Personas Naturales (Art. 9 Num. 11)',
    category: 'PN',
    isResident: true,
    rate: 1,
    appliesSubtrahend: true
  },
  {
    code: '007',
    description: 'Fletes y servicios de transporte pagados a Personas Jurídicas (Art. 9 Num. 14)',
    category: 'PJ',
    isResident: true,
    rate: 2,
    appliesSubtrahend: false
  },
  {
    code: '008',
    description: 'Fletes y servicios de transporte pagados a Personas Naturales (Art. 9 Num. 14)',
    category: 'PN',
    isResident: true,
    rate: 1,
    appliesSubtrahend: false
  },
  {
    code: '009',
    description: 'Arrendamiento de bienes inmuebles situados en el país pagados a PJ (Art. 9 Num. 13)',
    category: 'PJ',
    isResident: true,
    rate: 5,
    appliesSubtrahend: false
  },
  {
    code: '010',
    description: 'Arrendamiento de bienes inmuebles pagados a Personas Naturales (Art. 9 Num. 13)',
    category: 'PN',
    isResident: true,
    rate: 3,
    appliesSubtrahend: true
  },
  {
    code: '011',
    description: 'Adquisición de bienes muebles por Contribuyentes Especiales (Art. 9 Num. 22)',
    category: 'PJ',
    isResident: true,
    rate: 2,
    appliesSubtrahend: false
  },
  {
    code: '012',
    description: 'Servicios en general prestados por Personas Jurídicas Domiciliadas (Art. 9 Num. 22)',
    category: 'PJ',
    isResident: true,
    rate: 5,
    appliesSubtrahend: false
  }
];

// Unidad Tributaria actual vigente en Bs.
export const VALOR_UNIDAD_TRIBUTARIA_BS = 9.0; // U.T. oficial

/**
 * Calcula la retención de ISLR según la base imponible y el concepto.
 * Para personas naturales con sustraendo: Sustraendo = (UT * Factor) o conforme a la tabla del Art. 9.
 */
export function calculateIslrRetention(baseAmountBs: number, concept: IslrConcept): {
  rate: number;
  subtrahendBs: number;
  withheldAmountBs: number;
} {
  let subtrahend = 0;
  if (concept.appliesSubtrahend) {
    // Sustraendo estándar para PN = (Total UT anual o mensual * factor)
    // Para 3% de honorarios PN: Base mínima mensual suele equivaler a UT * 83.3333 * 3%
    const utValue = VALOR_UNIDAD_TRIBUTARIA_BS;
    subtrahend = (utValue * 83.3333) * (concept.rate / 100);
  }

  const rawWithheld = (baseAmountBs * (concept.rate / 100)) - subtrahend;
  const withheld = Math.max(0, Math.round(rawWithheld * 100) / 100);

  return {
    rate: concept.rate,
    subtrahendBs: Math.round(subtrahend * 100) / 100,
    withheldAmountBs: withheld
  };
}
