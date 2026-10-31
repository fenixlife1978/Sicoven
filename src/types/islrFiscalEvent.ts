import { getIslrUnitTaxValueForPeriod } from '../data/islrConcepts';

export type IslrFiscalTrigger = 'PAYMENT' | 'ACCOUNT_CREDIT';
export type IslrFiscalEventKind = IslrFiscalTrigger | 'REVERSAL';

/** The fiscal event follows the first legal trigger represented by the purchase mode. */
export function resolvePurchaseIslrFiscalTrigger(
  paymentTerm?: 'CONTADO' | 'CREDITO'
): IslrFiscalTrigger {
  return paymentTerm === 'CONTADO' ? 'PAYMENT' : 'ACCOUNT_CREDIT';
}

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

export interface IslrFiscalReversalAllocation {
  originalEvent: IslrFiscalEvent;
  baseAmountBs: number;
  withheldAmountBs: number;
}

/**
 * Distributes a purchase credit-note base across every unreversed PAYMENT or
 * ACCOUNT_CREDIT event for that purchase. Each source event keeps its own
 * withholding snapshot; reversals are calculated cumulatively per source.
 */
export function allocateIslrFiscalReversal(
  events: IslrFiscalEvent[],
  purchaseId: string,
  requestedBaseAmountBs: number,
  companyId?: string
): IslrFiscalReversalAllocation[] {
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  if (!Array.isArray(events) || !purchaseId ||
      !Number.isFinite(requestedBaseAmountBs) || requestedBaseAmountBs <= 0) {
    throw new Error('La base de reversión ISLR no es válida.');
  }
  const sources = events
    .filter(event => event.kind !== 'REVERSAL' && (!companyId || event.companyId === companyId) &&
      event.allocations.some(allocation => allocation.purchaseId === purchaseId))
    .sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate) ||
      a.sequence - b.sequence || a.id.localeCompare(b.id))
    .map(originalEvent => {
      const allocations = originalEvent.allocations.filter(item => item.purchaseId === purchaseId);
      if (allocations.length !== 1) {
        throw new Error('Un evento ISLR contiene asignaciones duplicadas para la misma factura.');
      }
      const originalBase = Number(allocations[0].baseAmountBs);
      const originalWithheld = Number(originalEvent.withheldAmountBs);
      const priorReversals = events.filter(event =>
        event.kind === 'REVERSAL' && event.reversalOfEventId === originalEvent.id &&
        (!companyId || event.companyId === companyId));
      const alreadyReversedBase = priorReversals.flatMap(event => event.allocations)
        .filter(item => item.purchaseId === purchaseId)
        .reduce((sum, item) => sum + Number(item.baseAmountBs), 0);
      const alreadyReversedWithheld = priorReversals.reduce((sum, event) =>
        sum + Number(event.withheldAmountBs), 0);
      if (!Number.isFinite(originalBase) || originalBase <= 0 ||
          !Number.isFinite(originalWithheld) || originalWithheld < 0 ||
          !Number.isFinite(alreadyReversedBase) || alreadyReversedBase < 0 ||
          !Number.isFinite(alreadyReversedWithheld) || alreadyReversedWithheld < 0 ||
          alreadyReversedBase > originalBase + 0.01 ||
          alreadyReversedWithheld > originalWithheld + 0.01) {
        throw new Error('El historial de reversiones ISLR de la factura no concilia con el evento original.');
      }
      return {
        originalEvent, originalBase, originalWithheld,
        alreadyReversedBase, alreadyReversedWithheld,
        remainingBase: Math.max(0, originalBase - alreadyReversedBase),
        remainingWithheld: Math.max(0, originalWithheld - alreadyReversedWithheld)
      };
    })
    .filter(item => item.remainingBase > 0.000001);
  if (sources.length === 0) return [];
  const totalRemainingBase = sources.reduce((sum, item) => sum + item.remainingBase, 0);
  const requested = money(requestedBaseAmountBs);
  if (requested > totalRemainingBase + 0.01) {
    throw new Error('La devolución supera la base ISLR pendiente de reversión de la factura.');
  }
  let baseLeft = requested;
  const result: IslrFiscalReversalAllocation[] = [];
  sources.forEach((source, index) => {
    const baseAmountBs = index === sources.length - 1
      ? money(baseLeft)
      : Math.min(source.remainingBase, money(requested * source.remainingBase / totalRemainingBase));
    if (baseAmountBs <= 0.000001) return;
    baseLeft = money(baseLeft - baseAmountBs);
    const expectedCumulativeWithheld = source.originalBase > 0
      ? money(source.originalWithheld *
        (source.alreadyReversedBase + baseAmountBs) / source.originalBase)
      : 0;
    const withheldAmountBs = money(expectedCumulativeWithheld - source.alreadyReversedWithheld);
    if (withheldAmountBs < -0.01 || withheldAmountBs > source.remainingWithheld + 0.01) {
      throw new Error('La reversión ISLR calculada supera la retención pendiente de un evento original.');
    }
    result.push({
      originalEvent: source.originalEvent,
      baseAmountBs,
      withheldAmountBs: Math.max(0, withheldAmountBs)
    });
  });
  if (Math.abs(baseLeft) > 0.01) {
    throw new Error('No se pudo distribuir completamente la base de la nota entre los eventos ISLR originales.');
  }
  return result;
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
      if (!original) throw new Error('La reversión fiscal no encuentra el evento original.');
      if (original.kind === 'REVERSAL' || original.companyId !== event.companyId ||
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
      const eligible = Number(eligibleBaseByPurchase[[event.companyId, allocation.purchaseId].join('|')] ?? eligibleBaseByPurchase[allocation.purchaseId]);
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
      const key = [event.companyId, allocation.purchaseId].join('|');
      const reversed = next.filter(item => item.kind === 'REVERSAL' &&
          item.reversalOfEventId === event.id && item.companyId === event.companyId)
        .flatMap(item => item.allocations)
        .filter(item => item.purchaseId === allocation.purchaseId)
        .reduce((sum, item) => sum + Number(item.baseAmountBs), 0);
      const remaining = Math.max(0, Number(allocation.baseAmountBs) - reversed);
      activeByPurchase.set(key, (activeByPurchase.get(key) || 0) + remaining);
    }
  }
  for (const [purchaseKey, allocated] of activeByPurchase) {
    const eligible = Number(eligibleBaseByPurchase[purchaseKey] ?? eligibleBaseByPurchase[purchaseKey.split('|').slice(1).join('|')]);
    if (!Number.isFinite(eligible) || eligible <= 0 || allocated > eligible + 0.01) {
      fail('La base fiscal asignada supera la base elegible de la factura; se bloquearía una doble retención por pago y abono en cuenta.');
    }
  }
}
