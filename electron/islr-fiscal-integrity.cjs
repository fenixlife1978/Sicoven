'use strict';

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getVerifiedUt(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) return null;
  if (period >= '2025-07') return 43;
  if (period >= '2023-06') return 9;
  if (period >= '2022-05') return 0.4;
  if (period >= '2021-10') return 0.02;
  return null;
}

function validateIslrFiscalEventLedger(previousState, nextState) {
  const previous = Array.isArray(previousState?.islrFiscalEvents) ? previousState.islrFiscalEvents : [];
  const next = Array.isArray(nextState?.islrFiscalEvents) ? nextState.islrFiscalEvents : [];
  if (!Array.isArray(previousState?.islrFiscalEvents ?? []) || !Array.isArray(nextState?.islrFiscalEvents ?? [])) {
    throw new Error('SQLite rechazó un libro auxiliar ISLR que no es una colección válida.');
  }
  const purchases = Array.isArray(nextState.purchases) ? nextState.purchases : [];
  const journals = Array.isArray(nextState.journalEntries) ? nextState.journalEntries : [];
  const purchaseById = new Map(purchases.map(item => [String(item.id), item]));
  const journalById = new Map(journals.map(item => [String(item.id), item]));
  const oldById = new Map(previous.map(item => [String(item.id), item]));
  const nextById = new Map(next.map(item => [String(item.id), item]));
  if (oldById.size !== previous.length || nextById.size !== next.length) {
    throw new Error('SQLite rechazó identificadores duplicados en el libro auxiliar ISLR.');
  }
  for (const oldEvent of previous) {
    const current = nextById.get(String(oldEvent.id));
    if (!current || JSON.stringify(oldEvent) !== JSON.stringify(current)) {
      throw new Error('SQLite protegió la inmutabilidad del libro ISLR: registre una reversión en lugar de modificar o eliminar eventos.');
    }
  }

  const reversed = new Set(next
    .filter(event => oldById.has(String(event.id)) && event.kind === 'REVERSAL')
    .map(event => String(event.reversalOfEventId || '')));
  // Reservar secuencias históricas como claves ocupadas, sin rechazar
  // duplicados preexistentes de datos legacy. Solo se validan eventos nuevos.
  const sequences = new Set(previous
    .filter(event => event && event.companyId && isValidDate(event.fiscalDate) &&
      Number.isInteger(event.sequence) && event.sequence > 0)
    .map(event => [event.companyId, event.fiscalDate, event.sequence].join('|')));
  for (const event of next) {
    const id = String(event?.id || '');
    if (oldById.has(id)) continue;
    if (event && event.companyId && isValidDate(event.fiscalDate) &&
        Number.isInteger(event.sequence) && event.sequence > 0) {
      const sequenceKey = [event.companyId, event.fiscalDate, event.sequence].join('|');
      if (sequences.has(sequenceKey)) {
        throw new Error('SQLite rechazó una secuencia de eventos ISLR duplicada para la empresa y fecha.');
      }
      sequences.add(sequenceKey);
    }
    if (!id || !event.companyId || !event.supplierRif || !event.conceptCode ||
        !isValidDate(event.fiscalDate) || !Number.isInteger(event.sequence) || event.sequence <= 0 ||
        !['PAYMENT', 'ACCOUNT_CREDIT', 'REVERSAL'].includes(event.kind) ||
        !Array.isArray(event.allocations) || event.allocations.length === 0 ||
        !Number.isFinite(Number(event.basePercentage)) || Number(event.basePercentage) <= 0 || Number(event.basePercentage) > 100 ||
        !Number.isFinite(Number(event.unitTaxValueBs)) || Number(event.unitTaxValueBs) <= 0 ||
        !Number.isFinite(Number(event.withheldAmountBs)) || Number(event.withheldAmountBs) < 0 ||
        !event.journalEntryId || !event.createdAt || !Number.isFinite(Date.parse(event.createdAt))) {
      throw new Error('SQLite rechazó un evento fiscal ISLR con campos, fecha o importes inválidos.');
    }
    const expectedUt = getVerifiedUt(event.fiscalDate.slice(0, 7));
    if (expectedUt == null || Math.abs(expectedUt - Number(event.unitTaxValueBs)) > 0.000001) {
      throw new Error('SQLite rechazó el snapshot de UT ISLR porque no coincide con el valor histórico verificado para la fecha del evento.');
    }
    const journal = journalById.get(String(event.journalEntryId));
    if (!journal || journal.companyId !== event.companyId || journal.date !== event.fiscalDate) {
      throw new Error('SQLite rechazó un evento ISLR sin asiento contable enlazado a la misma empresa y fecha fiscal.');
    }

    const allocationIds = new Set();
    let accountCreditWithheldTotal = 0;
    for (const allocation of event.allocations) {
      const purchase = purchaseById.get(String(allocation?.purchaseId || ''));
      if (!purchase || purchase.documentType !== '01' || purchase.isCancelled ||
          purchase.companyId !== event.companyId ||
          String(purchase.supplierRif || '').trim().toUpperCase() !== String(event.supplierRif).trim().toUpperCase() ||
          allocationIds.has(String(allocation.purchaseId)) ||
          !Number.isFinite(Number(allocation.baseAmountBs)) || Number(allocation.baseAmountBs) <= 0) {
        throw new Error('SQLite rechazó una asignación ISLR vinculada a una factura inexistente, anulada, duplicada o de otro proveedor/empresa.');
      }
      const eligibleBase = Number(purchase.taxableBaseBs) + Number(purchase.exemptAmountBs);
      if (!Number.isFinite(eligibleBase) || eligibleBase <= 0 ||
          Number(allocation.baseAmountBs) > eligibleBase + 0.01) {
        throw new Error('SQLite rechazó una asignación ISLR superior a la base de la factura antes del IVA.');
      }
      if (event.kind === 'ACCOUNT_CREDIT') {
        const purchaseBasePercentage = Number(purchase.islrBasePercentage);
        const purchaseUnitTaxValue = Number(purchase.islrUnitTaxValueBs);
        const purchaseWithheld = Number(purchase.islrWithheldBs);
        if (purchase.islrConceptCode !== event.conceptCode ||
            !Number.isFinite(purchaseBasePercentage) ||
            !Number.isFinite(purchaseUnitTaxValue) ||
            !Number.isFinite(purchaseWithheld) || purchaseWithheld < 0 ||
            Math.abs(purchaseBasePercentage - Number(event.basePercentage)) > 0.000001 ||
            Math.abs(purchaseUnitTaxValue - Number(event.unitTaxValueBs)) > 0.000001 ||
            Math.abs(Number(allocation.baseAmountBs) - Number(purchase.taxableBaseBs)) > 0.01) {
          throw new Error('SQLite rechazó un abono ISLR que no coincide con el concepto, base y snapshot fiscal de la factura.');
        }
        accountCreditWithheldTotal += purchaseWithheld;
      }
      allocationIds.add(String(allocation.purchaseId));
    }
    if (event.kind === 'ACCOUNT_CREDIT') {
      const journalWithheld = (Array.isArray(journal.items) ? journal.items : [])
        .filter(item => item.accountCode === '2.1.2.04')
        .reduce((sum, item) => sum + Number(item.creditBs || 0) - Number(item.debitBs || 0), 0);
      if (journal.type !== 'COMPRA' ||
          Math.abs(accountCreditWithheldTotal - Number(event.withheldAmountBs)) > 0.01 ||
          Math.abs(journalWithheld - Number(event.withheldAmountBs)) > 0.01) {
        throw new Error('SQLite rechazó el evento de abono ISLR: el asiento de compra no concilia la retención con el libro fiscal.');
      }
    }

    if (event.kind === 'REVERSAL' && !oldById.has(id)) {
      const originalId = String(event.reversalOfEventId || '');
      const original = nextById.get(originalId);
      if (!originalId || !String(event.reversalReason || '').trim() || !original ||
          original.kind === 'REVERSAL' || original.companyId !== event.companyId ||
          String(original.supplierRif).trim().toUpperCase() !== String(event.supplierRif).trim().toUpperCase() ||
          original.conceptCode !== event.conceptCode ||
          original.allocations.length !== event.allocations.length ||
          original.allocations.some((item, index) =>
            item.purchaseId !== event.allocations[index].purchaseId ||
            Math.abs(Number(item.baseAmountBs) - Number(event.allocations[index].baseAmountBs)) > 0.000001) ||
          Math.abs(Number(original.withheldAmountBs) - Number(event.withheldAmountBs)) > 0.01 ||
          reversed.has(originalId)) {
        throw new Error('SQLite rechazó una reversión ISLR sin original vigente, justificación o coincidencia exacta.');
      }
      reversed.add(originalId);
    } else if (event.kind !== 'REVERSAL' && (event.reversalOfEventId || event.reversalReason)) {
      throw new Error('SQLite rechazó datos de reversión en un evento ISLR de pago o abono.');
    }
  }

  const reversedIds = new Set(next.filter(event => event.kind === 'REVERSAL').map(event => String(event.reversalOfEventId)));
  const activeByPurchase = new Map();
  for (const event of next) {
    if (event.kind === 'REVERSAL' || reversedIds.has(String(event.id)) || !Array.isArray(event.allocations)) continue;
    for (const allocation of event.allocations) {
      const id = String(allocation.purchaseId);
      // Los eventos legacy conservados sin factura vinculada no se pueden
      // reasignar retrospectivamente; los eventos nuevos sí se validan arriba.
      if (!purchaseById.has(id)) continue;
      activeByPurchase.set(id, (activeByPurchase.get(id) || 0) + Number(allocation.baseAmountBs));
    }
  }
  for (const [purchaseId, allocated] of activeByPurchase) {
    const purchase = purchaseById.get(purchaseId);
    const eligibleBase = Number(purchase.taxableBaseBs) + Number(purchase.exemptAmountBs);
    if (allocated > eligibleBase + 0.01) {
      throw new Error('SQLite bloqueó una doble retención ISLR: las asignaciones acumuladas exceden la base elegible de la factura.');
    }
  }
}

module.exports = { validateIslrFiscalEventLedger };
