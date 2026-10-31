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

/**
 * UT aplicable al período mensual, según el valor vigente al inicio del mes.
 * La providencia de junio de 2025 rige desde el 02/06/2025, por lo que junio
 * conserva UT 9 y julio 2025 inicia con UT 43. No se extrapolan valores
 * anteriores a octubre de 2021, cuando entró en vigor la reconversión monetaria.
 */
export function getIslrUnitTaxValueForPeriod(period: string): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
  if (period >= '2025-07') return 43;
  if (period >= '2023-06') return 9;
  if (period >= '2022-05') return 0.4;
  if (period >= '2021-10') return 0.02;
  return null;
}

export function calculateIslrRetention(baseAmountBs: number, concept: IslrConcept, unitTaxValueBs: number = VALOR_UNIDAD_TRIBUTARIA_BS): {
  rate: number;
  subtrahendBs: number;
  withheldAmountBs: number;
} {
  if (!Number.isFinite(baseAmountBs) || baseAmountBs < 0) {
    throw new Error('La base de cálculo ISLR debe ser un importe finito no negativo.');
  }
  if (!Number.isFinite(unitTaxValueBs) || unitTaxValueBs <= 0) {
    throw new Error('No existe un valor de Unidad Tributaria válido para el período ISLR seleccionado.');
  }
  if (!concept || !Number.isFinite(concept.rate) || concept.rate < 0 ||
      !Number.isFinite(concept.basePercentage) || concept.basePercentage <= 0 ||
      concept.basePercentage > 100) {
    throw new Error('El concepto ISLR no tiene parámetros de cálculo válidos.');
  }

  const taxableBase = baseAmountBs * (concept.basePercentage / 100);
  const minimumBase = concept.minBaseUt
    ? unitTaxValueBs * concept.minBaseUt
    : 0;
  const thresholdNotReached = concept.appliesSubtrahend && baseAmountBs <= minimumBase + 0.000001;
  const subtrahend = concept.appliesSubtrahend && !thresholdNotReached
    ? unitTaxValueBs * ISLR_FORMULA_FACTOR * (concept.rate / 100)
    : 0;
  const rawWithheld = thresholdNotReached
    ? 0
    : taxableBase * (concept.rate / 100) - subtrahend;
  const withheld = Math.max(0, Math.round((rawWithheld + Number.EPSILON) * 100) / 100);

  return {
    rate: concept.rate,
    subtrahendBs: Math.round((subtrahend + Number.EPSILON) * 100) / 100,
    withheldAmountBs: withheld
  };
}


/**
 * Calcula la retención incremental de una operación dentro del mismo mes,
 * proveedor y concepto. El sustraendo se aplica una sola vez al acumulado.
 */
export function calculateMonthlyIslrRetention(
  currentBaseAmountBs: number,
  previousOperations: Array<{ baseAmountBs: number; withheldAmountBs?: number; subtrahendBs?: number }>,
  concept: IslrConcept,
  unitTaxValueBs: number = VALOR_UNIDAD_TRIBUTARIA_BS
): { rate: number; subtrahendBs: number; withheldAmountBs: number } {
  if (!Array.isArray(previousOperations)) {
    throw new Error('El historial mensual ISLR no tiene un formato válido.');
  }
  if (!concept.appliesSubtrahend) return calculateIslrRetention(currentBaseAmountBs, concept, unitTaxValueBs);

  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  let previousBase = 0;
  let previousWithheld = 0;
  let previousSubtrahend = 0;
  for (const operation of previousOperations) {
    const base = Number(operation.baseAmountBs);
    const withheld = Number(operation.withheldAmountBs ?? 0);
    const subtrahend = Number(operation.subtrahendBs ?? 0);
    if (![base, withheld, subtrahend].every(Number.isFinite) || base < 0 || withheld < 0 || subtrahend < 0) {
      throw new Error('Existe una operación ISLR mensual con importes históricos inválidos; se requiere conciliación antes de continuar.');
    }
    previousBase += base;
    previousWithheld += withheld;
    previousSubtrahend += subtrahend;
  }
  const previousCumulative = calculateIslrRetention(previousBase, concept, unitTaxValueBs);
  if (Math.abs(previousCumulative.withheldAmountBs - previousWithheld) > 0.01) {
    throw new Error('Las retenciones históricas del proveedor no coinciden con el cálculo acumulado mensual. Se requiere rectificación antes de continuar.');
  }
  // Compatibilidad segura con registros antiguos: antes se guardaba el sustraendo
  // aunque la base no superara el umbral; en ese caso nunca llegó a aplicarse.
  const appliedPriorSubtrahend = previousCumulative.subtrahendBs;
  if (previousBase > 0 && previousBase > (concept.minBaseUt || 0) * unitTaxValueBs &&
      Math.abs(previousSubtrahend - appliedPriorSubtrahend) > 0.01) {
    throw new Error('El sustraendo histórico del proveedor no coincide con el cálculo acumulado mensual. Se requiere rectificación antes de continuar.');
  }
  const cumulative = calculateIslrRetention(previousBase + currentBaseAmountBs, concept, unitTaxValueBs);
  const incrementalWithheld = roundMoney(cumulative.withheldAmountBs - previousWithheld);
  const incrementalSubtrahend = roundMoney(cumulative.subtrahendBs - appliedPriorSubtrahend);
  if (incrementalWithheld < -0.01 || incrementalSubtrahend < -0.01) {
    throw new Error('El acumulado ISLR no concilia con las retenciones/sustraendos previamente registrados. No se permite continuar sin rectificación fiscal.');
  }
  return {
    rate: cumulative.rate,
    subtrahendBs: Math.max(0, incrementalSubtrahend),
    withheldAmountBs: Math.max(0, incrementalWithheld)
  };
}

/**
 * Tarifa T-2 progresiva del artículo 9 del Decreto 1.808.
 * Devuelve el impuesto acumulado expresado en UT; no convierte a bolívares
 * ni calcula retenciones incrementales. El llamador debe aportar la UT
 * legalmente aplicable al cierre del ejercicio y conciliar el historial.
 */
export function calculateIslrTariff2Ut(taxableBaseUt: number): number {
  if (!Number.isFinite(taxableBaseUt) || taxableBaseUt < 0) {
    throw new Error('La base anual ISLR en UT debe ser un importe finito no negativo.');
  }
  if (taxableBaseUt <= 2000) return taxableBaseUt * 0.15;
  if (taxableBaseUt <= 3000) return 300 + (taxableBaseUt - 2000) * 0.22;
  return 520 + (taxableBaseUt - 3000) * 0.34;
}
