import { IslrConcept } from '../types/accounting';

/**
 * Subconjunto de conceptos SENIAT cuya tarifa y base están parametrizadas
 * con respaldo en la tabla del Decreto 1.808. No se incluyen códigos de
 * tarifa progresiva/acumulativa ni conceptos aún no conciliados.
 *
 * Códigos: 001 (sueldos), 005 (PJ no domiciliada con tarifa acumulativa)
 * y 006-009 no se ofrecen en compras hasta implementar sus reglas completas.
 */
export const ISLR_CONCEPTS: IslrConcept[] = [
  {
    code: '002',
    description: 'Honorarios profesionales no mercantiles — persona natural residente (Art. 9, num. 1.b)',
    category: 'PN',
    isResident: true,
    rate: 3,
    basePercentage: 100,
    appliesSubtrahend: true,
    minBaseUt: 83.3334
  },
  {
    code: '003',
    description: 'Honorarios profesionales no mercantiles — persona natural no residente (Art. 9, num. 1.a)',
    category: 'PN',
    isResident: false,
    rate: 34,
    basePercentage: 90,
    appliesSubtrahend: false
  },
  {
    code: '004',
    description: 'Honorarios profesionales no mercantiles — persona jurídica domiciliada (Art. 9, num. 1.b)',
    category: 'PJ',
    isResident: true,
    rate: 5,
    basePercentage: 100,
    appliesSubtrahend: false
  },
  {
    code: '010',
    description: 'Honorarios profesionales a jinetes, veterinarios, preparadores o entrenadores — persona natural residente (Art. 9, num. 1.c)',
    category: 'PN',
    isResident: true,
    rate: 3,
    basePercentage: 100,
    appliesSubtrahend: true,
    minBaseUt: 83.3334
  },
  {
    code: '011',
    description: 'Honorarios profesionales a jinetes, veterinarios, preparadores o entrenadores — persona natural no residente (Art. 9, num. 1.c)',
    category: 'PN',
    isResident: false,
    rate: 34,
    basePercentage: 90,
    appliesSubtrahend: false
  },
  {
    code: '012',
    description: 'Honorarios profesionales pagados por clínicas, hospitales, centros de salud, bufetes y entidades profesionales — persona natural residente (Art. 9, num. 1.d)',
    category: 'PN',
    isResident: true,
    rate: 3,
    basePercentage: 100,
    appliesSubtrahend: true,
    minBaseUt: 83.3334
  },
  {
    code: '013',
    description: 'Honorarios profesionales pagados por clínicas, hospitales, centros de salud, bufetes y entidades profesionales — persona natural no residente (Art. 9, num. 1.d)',
    category: 'PN',
    isResident: false,
    rate: 34,
    basePercentage: 90,
    appliesSubtrahend: false
  }
];

/** Unidad Tributaria vigente documentada: Bs. 43,00 (G.O. 43.140, 02/06/2025). */
export const VALOR_UNIDAD_TRIBUTARIA_BS = 43.00;
/** Factor literal del Art. 9, parágrafo segundo, del Decreto 1.808. */
export const ISLR_FORMULA_FACTOR = 83.3334;

export function calculateIslrRetention(baseAmountBs: number, concept: IslrConcept): {
  rate: number;
  subtrahendBs: number;
  withheldAmountBs: number;
} {
  if (!Number.isFinite(baseAmountBs) || baseAmountBs < 0) {
    throw new Error('La base de cálculo ISLR debe ser un importe finito no negativo.');
  }
  if (!concept || !Number.isFinite(concept.rate) || concept.rate < 0 ||
      !Number.isFinite(concept.basePercentage) || concept.basePercentage <= 0 ||
      concept.basePercentage > 100) {
    throw new Error('El concepto ISLR no tiene parámetros de cálculo válidos.');
  }

  const subtrahend = concept.appliesSubtrahend
    ? VALOR_UNIDAD_TRIBUTARIA_BS * ISLR_FORMULA_FACTOR * (concept.rate / 100)
    : 0;
  const taxableBase = baseAmountBs * (concept.basePercentage / 100);
  const minimumBase = concept.minBaseUt
    ? VALOR_UNIDAD_TRIBUTARIA_BS * concept.minBaseUt
    : 0;
  const rawWithheld = concept.appliesSubtrahend && baseAmountBs <= minimumBase
    ? 0
    : taxableBase * (concept.rate / 100) - subtrahend;
  const withheld = Math.max(0, Math.round((rawWithheld + Number.EPSILON) * 100) / 100);

  return {
    rate: concept.rate,
    subtrahendBs: Math.round((subtrahend + Number.EPSILON) * 100) / 100,
    withheldAmountBs: withheld
  };
}
