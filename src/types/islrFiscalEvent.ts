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
      const reversalOfEventId = String(event.reversalOfEventId || '');
      if (!reversalOfEventId || !event.reversalReason?.trim()) {
        throw new Error('La reversión fiscal requiere evento original y justificación.');
      }
      const original = nextById.get(reversalOfEventId);
      if (!original) throw new Error('La reversión fiscal no encuentra el evento original.');
      if (original.kind === 'REVERSAL' || original.companyId !== event.companyId ||
          original.supplierRif !== event.supplierRif || original.conceptCode !== event.conceptCode ||
          original.allocations.length !== event.allocations.length ||
          original.allocations.some((allocation, index) =>
            allocation.purchaseId !== event.allocations[index].purchaseId ||
            Math.abs(allocation.baseAmountBs - event.allocations[index].baseAmountBs) > 0.000001) ||
          Math.abs(original.withheldAmountBs - event.withheldAmountBs) > 0.01 ||
          reversed.has(original.id)) {
        fail('La reversión fiscal no coincide exactamente con un evento original vigente o ya reversado.');
      }
      reversed.add(original.id);
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

  const sequences = new Set<string>();
  for (const event of next) {
    const key = [event.companyId, event.fiscalDate, event.sequence].join('|');
    if (sequences.has(key)) fail('La secuencia de eventos fiscales del día está duplicada en la empresa.');
    sequences.add(key);
  }

  const activeByPurchase = new Map<string, number>();
  const reversedIds = new Set(next.filter(item => item.kind === 'REVERSAL').map(item => item.reversalOfEventId));
  for (const event of next) {
    if (event.kind === 'REVERSAL' || reversedIds.has(event.id)) continue;
    for (const allocation of event.allocations) {
      activeByPurchase.set(allocation.purchaseId,
        (activeByPurchase.get(allocation.purchaseId) || 0) + allocation.baseAmountBs);
    }
  }
  for (const [purchaseId, allocated] of activeByPurchase) {
    const eligible = Number(eligibleBaseByPurchase[purchaseId]);
    if (allocated > eligible + 0.01) {
      fail('La base fiscal asignada supera la base elegible de la factura; se bloquearía una doble retención por pago y abono en cuenta.');
    }
  }
}
