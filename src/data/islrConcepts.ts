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
 * Devuelve el impuesto acumulado expresado en UT. La conversión a Bs. y
 * la retención incremental se calculan con la UT vigente en cada pago/abono.
 */
export function calculateIslrTariff2Ut(taxableBaseUt: number): number {
  if (!Number.isFinite(taxableBaseUt) || taxableBaseUt < 0) {
    throw new Error('La base anual ISLR en UT debe ser un importe finito no negativo.');
  }
  if (taxableBaseUt <= 2000) return taxableBaseUt * 0.15;
  if (taxableBaseUt <= 3000) return 300 + (taxableBaseUt - 2000) * 0.22;
  return 520 + (taxableBaseUt - 3000) * 0.34;
}

/**
 * Snapshot de una operación de retención T-2 dentro del ejercicio.
 * La UT es la vigente en la fecha efectiva de pago/abono, no una UT
 * reconstruida posteriormente ni una UT única para todo el ejercicio.
 */
export interface AnnualIslrOperation {
  paymentDate: string;
  baseAmountBs: number;
  withheldAmountBs: number;
  unitTaxValueBs: number;
}

/**
 * Retención incremental T-2 (Decreto 1.808, art. 9, parágrafo primero).
 * En cada pago/abono se acumulan los enriquecimientos netos del ejercicio,
 * se convierten a UT con el valor vigente en esa fecha y se aplica la tarifa
 * progresiva. El resultado se convierte a Bs con esa misma UT y se resta
 * lo efectivamente retenido antes.
 *
 * Cada operación anterior conserva su propia fecha y UT. Así se concilia el
 * importe debido en cada momento sin recalcular operaciones históricas con
 * una UT posterior. Este motor no habilita por sí solo el código 005.
 */
export function calculateAnnualIslrTariff2Retention(
  currentBaseAmountBs: number,
  previousOperations: AnnualIslrOperation[],
  currentPaymentDate: string,
  currentUnitTaxValueBs: number,
  basePercentage = 90
): { rate: number; cumulativeTaxableBaseUt: number; cumulativeWithheldBs: number; withheldAmountBs: number } {
  const isIsoDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!Number.isFinite(currentBaseAmountBs) || currentBaseAmountBs < 0) {
    throw new Error('La base de la operación ISLR anual debe ser finita y no negativa.');
  }
  if (!Array.isArray(previousOperations)) {
    throw new Error('El historial anual ISLR no tiene un formato válido.');
  }
  if (!isIsoDate(currentPaymentDate)) {
    throw new Error('La fecha efectiva de pago o abono en cuenta para T-2 no es válida.');
  }
  if (!Number.isFinite(basePercentage) || basePercentage <= 0 || basePercentage > 100) {
    throw new Error('El porcentaje de base anual ISLR debe estar entre 0 y 100.');
  }

  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const fiscalYear = currentPaymentDate.slice(0, 4);
  let accumulatedBaseBs = 0;
  let accumulatedWithheldBs = 0;
  let previousDate = '';

  for (const operation of previousOperations) {
    const date = String(operation?.paymentDate || '');
    const base = Number(operation?.baseAmountBs);
    const withheld = Number(operation?.withheldAmountBs);
    const unitTax = Number(operation?.unitTaxValueBs);
    if (!isIsoDate(date) || date.slice(0, 4) !== fiscalYear ||
        (previousDate && date < previousDate) || date > currentPaymentDate) {
      throw new Error('El historial T-2 debe contener fechas válidas, ordenadas y del mismo ejercicio, anteriores al pago actual.');
    }
    if (!Number.isFinite(base) || base < 0 || !Number.isFinite(withheld) || withheld < 0 ||
        !Number.isFinite(unitTax) || unitTax <= 0) {
      throw new Error('Existe una operación anual ISLR histórica inválida o sin snapshot de UT; se requiere conciliación.');
    }
    const expectedHistoricalUnitTax = getIslrUnitTaxValueForPeriod(date.slice(0, 7));
    if (expectedHistoricalUnitTax == null || Math.abs(unitTax - expectedHistoricalUnitTax) > 0.000001) {
      throw new Error('El snapshot histórico de UT no coincide con el valor verificado para la fecha del pago o abono; se requiere conciliación.');
    }

    accumulatedBaseBs += base;
    const taxableBaseUtAtOperation = accumulatedBaseBs * (basePercentage / 100) / unitTax;
    const taxDueBsAtOperation = roundMoney(
      calculateIslrTariff2Ut(taxableBaseUtAtOperation) * unitTax
    );
    const expectedIncrementalWithholding = roundMoney(
      Math.max(0, taxDueBsAtOperation - accumulatedWithheldBs)
    );
    if (Math.abs(expectedIncrementalWithholding - roundMoney(withheld)) > 0.01) {
      throw new Error('Las retenciones históricas T-2 no concilian con la base acumulada y la UT vigente en cada fecha; se requiere rectificación.');
    }
    accumulatedWithheldBs += withheld;
    previousDate = date;
  }

  if (!Number.isFinite(currentUnitTaxValueBs) || currentUnitTaxValueBs <= 0) {
    throw new Error('Debe indicarse la UT vigente en la fecha efectiva del pago o abono.');
  }
  const expectedCurrentUnitTax = getIslrUnitTaxValueForPeriod(currentPaymentDate.slice(0, 7));
  if (expectedCurrentUnitTax == null || Math.abs(currentUnitTaxValueBs - expectedCurrentUnitTax) > 0.000001) {
    throw new Error('El snapshot de UT de la operación actual no coincide con el valor verificado para su período fiscal.');
  }

  const cumulativeTaxableBaseUt =
    (accumulatedBaseBs + currentBaseAmountBs) * (basePercentage / 100) / currentUnitTaxValueBs;
  const cumulativeWithheldBs = roundMoney(
    calculateIslrTariff2Ut(cumulativeTaxableBaseUt) * currentUnitTaxValueBs
  );
  // Una variación de UT puede reducir el impuesto recalculado. Nunca se
  // genera una retención negativa ni se modifica lo retenido anteriormente.
  const withheldAmountBs = roundMoney(
    Math.max(0, cumulativeWithheldBs - accumulatedWithheldBs)
  );

  return {
    rate: cumulativeTaxableBaseUt <= 2000 ? 15 : cumulativeTaxableBaseUt <= 3000 ? 22 : 34,
    cumulativeTaxableBaseUt,
    cumulativeWithheldBs,
    withheldAmountBs
  };
}
