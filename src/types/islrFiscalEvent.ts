import { getIslrUnitTaxValueForPeriod } from '../data/islrConcepts';

export type IslrFiscalTrigger = 'PAYMENT' | 'ACCOUNT_CREDIT';
export type IslrFiscalEventKind = IslrFiscalTrigger | 'REVERSAL';

/** Importe bruto elegible del documento asignado a este evento, antes de aplicar basePercentage. */
export interface IslrFiscalAllocation {
  purchaseId: string;
  baseAmountBs: number;
}

export interface IslrFiscalEvent {
  id: string;
  companyId: string;
  supplierRif: string;
  conceptCode: string;
  fiscalDate: string;
  sequence: number;
  kind: IslrFiscalEventKind;
  allocations: IslrFiscalAllocation[];
  basePercentage: number;
  unitTaxValueBs: number;
  withheldAmountBs: number;
  journalEntryId: string;
  voucherId?: string;
  reversalOfEventId?: string;
  reversalReason?: string;
  createdAt: string;
}

/** Validación estructural; el cálculo fiscal y el asiento contable son operaciones de dominio separadas. */
export function validateIslrFiscalEventLedger(
  previous: IslrFiscalEvent[],
  next: IslrFiscalEvent[],
  eligibleBaseByPurchase: Record<string, number>
): void {
  const fail = (message: string): never => { throw new Error(message); };
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!Array.isArray(previous) || !Array.isArray(next) || !eligibleBaseByPurchase ||
      typeof eligibleBaseByPurchase !== 'object' || Array.isArray(eligibleBaseByPurchase)) {
    fail('El historial de eventos fiscales ISLR no tiene un formato válido.');
  }
  const oldById = new Map(previous.map(item => [String(item.id), item]));
  const nextById = new Map(next.map(item => [String(item.id), item]));
  if (oldById.size !== previous.length || nextById.size !== next.length) {
    fail('El historial de eventos fiscales ISLR contiene identificadores duplicados.');
  }
  for (const old of previous) {
    const current = nextById.get(String(old.id));
    if (!current || JSON.stringify(old) !== JSON.stringify(current)) {
      fail('El historial fiscal ISLR es inmutable: los eventos existentes no se eliminan ni modifican; registre una reversión.');
    }
  }

  // Los eventos antiguos ya reversados también bloquean una segunda reversión.
  const reversed = new Set<string>(next
    .filter(item => oldById.has(String(item.id)) && item.kind === 'REVERSAL')
    .map(item => String(item.reversalOfEventId || '')));
  for (const event of next) {
    if (oldById.has(String(event.id))) continue;
    if (!event.id || !event.companyId || !event.supplierRif || !event.conceptCode ||
        !validDate(event.fiscalDate) || !Number.isInteger(event.sequence) || event.sequence <= 0 ||
        !['PAYMENT', 'ACCOUNT_CREDIT', 'REVERSAL'].includes(event.kind) ||
        !Array.isArray(event.allocations) || event.allocations.length === 0 ||
        !Number.isFinite(event.basePercentage) || event.basePercentage <= 0 || event.basePercentage > 100 ||
        !Number.isFinite(event.unitTaxValueBs) || event.unitTaxValueBs <= 0 ||
        !Number.isFinite(event.withheldAmountBs) || event.withheldAmountBs < 0 ||
        !event.journalEntryId || !event.createdAt) {
      fail('El nuevo evento fiscal ISLR contiene datos obligatorios o importes inválidos.');
    }
    const verifiedUt = getIslrUnitTaxValueForPeriod(event.fiscalDate.slice(0, 7));
    if (verifiedUt == null || Math.abs(verifiedUt - event.unitTaxValueBs) > 0.000001) {
      fail('El snapshot de UT del evento fiscal ISLR no coincide con el valor verificado para su fecha.');
    }
    if (event.kind === 'REVERSAL') {
      const originalId = String(event.reversalOfEventId || '');
      const original = nextById.get(originalId);
      if (!originalId || !event.reversalReason?.trim()) {
        fail('La reversión fiscal requiere evento original y justificación.');
      }
      if (!original || original.kind === 'REVERSAL' || original.companyId !== event.companyId ||
          original.supplierRif !== event.supplierRif || original.conceptCode !== event.conceptCode) {
        fail('La reversión fiscal no coincide con un evento original de la misma empresa, proveedor y concepto.');
      }
      const priorReversals = next.filter(item => item.kind === 'REVERSAL' &&
        item.reversalOfEventId === originalId && item.id !== event.id);
      const originalBase = new Map(original.allocations.map(item => [item.purchaseId, item.baseAmountBs]));
      const reversedBase = new Map<string, number>();
      for (const prior of priorReversals) for (const allocation of prior.allocations) {
        reversedBase.set(allocation.purchaseId, (reversedBase.get(allocation.purchaseId) || 0) + allocation.baseAmountBs);
      }
      for (const allocation of event.allocations) {
        const base = Number(originalBase.get(allocation.purchaseId) || 0);
        const totalReversed = (reversedBase.get(allocation.purchaseId) || 0) + Number(allocation.baseAmountBs);
        if (base <= 0 || totalReversed > base + 0.01) {
          fail('La reversión ISLR supera la base pendiente del evento original.');
        }
        reversedBase.set(allocation.purchaseId, totalReversed);
      }
      const originalTotalBase = original.allocations.reduce((sum, item) => sum + Number(item.baseAmountBs), 0);
      const totalReversedBase = Array.from(reversedBase.values()).reduce((sum, value) => sum + value, 0);
      const priorWithheld = priorReversals.reduce((sum, item) => sum + Number(item.withheldAmountBs), 0);
      const expectedCumulativeWithheld = originalTotalBase > 0
        ? Math.round((Number(original.withheldAmountBs) * totalReversedBase / originalTotalBase + Number.EPSILON) * 100) / 100
        : 0;
      if (priorWithheld + Number(event.withheldAmountBs) > Number(original.withheldAmountBs) + 0.01 ||
          Math.abs(priorWithheld + Number(event.withheldAmountBs) - expectedCumulativeWithheld) > 0.02) {
        fail('La reversión ISLR no concilia proporcionalmente con la base y retención original pendiente.');
      }
    } else if (event.reversalOfEventId || event.reversalReason) {
      fail('Un evento de pago o abono no puede contener datos de reversión.');
    }
    const allocationIds = new Set<string>();
    for (const allocation of event.allocations) {
      const eligible = Number(eligibleBaseByPurchase[allocation.purchaseId]);
      if (!allocation.purchaseId || allocationIds.has(allocation.purchaseId) ||
          !Number.isFinite(allocation.baseAmountBs) || allocation.baseAmountBs <= 0 ||
          !Number.isFinite(eligible) || eligible <= 0) {
        fail('La asignación fiscal requiere facturas válidas, bases positivas y sin duplicados.');
      }
      allocationIds.add(allocation.purchaseId);
    }
  }

  // Reservar correlativos históricos sin invalidar duplicados legacy.
  // Solo los eventos agregados en esta operación deben ser únicos.
  const sequences = new Set(previous
    .filter(event => event && event.companyId && validDate(event.fiscalDate) &&
      Number.isInteger(event.sequence) && event.sequence > 0)
    .map(event => [event.companyId, event.fiscalDate, event.sequence].join('|')));
  for (const event of next) {
    if (oldById.has(String(event.id))) continue;
    const key = [event.companyId, event.fiscalDate, event.sequence].join('|');
    if (sequences.has(key)) fail('La secuencia de eventos fiscales del día está duplicada en la empresa.');
    sequences.add(key);
  }

  const activeByPurchase = new Map<string, number>();
  for (const event of next) {
    if (event.kind === 'REVERSAL') continue;
    for (const allocation of event.allocations) {
      const reversed = next.filter(item => item.kind === 'REVERSAL' && item.reversalOfEventId === event.id)
        .flatMap(item => item.allocations)
        .filter(item => item.purchaseId === allocation.purchaseId)
        .reduce((sum, item) => sum + Number(item.baseAmountBs), 0);
      const remaining = Math.max(0, Number(allocation.baseAmountBs) - reversed);
      activeByPurchase.set(allocation.purchaseId,
        (activeByPurchase.get(allocation.purchaseId) || 0) + remaining);
    }
  }
  for (const [purchaseId, allocated] of activeByPurchase) {
    const eligible = Number(eligibleBaseByPurchase[purchaseId]);
    if (allocated > eligible + 0.01) {
      fail('La base fiscal asignada supera la base elegible de la factura; se bloquearía una doble retención por pago y abono en cuenta.');
    }
  }
}
