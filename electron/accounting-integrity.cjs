const LEGACY_DEMO_COMPANIES = new Set(['comp-1', 'comp-2']);

function isLegacyDemoRecord(record) {
  return LEGACY_DEMO_COMPANIES.has(String(record?.companyId || '')) ||
    String(record?.id || '') === 'entry-apertura-1';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertAppendOnlyCollection(previousState, nextState, collectionName, mutableKeys = [], monotonicKeys = []) {
  const oldItems = asArray(previousState[collectionName]);
  const newItems = asArray(nextState[collectionName]);
  const newById = new Map(newItems.map(item => [String(item.id), item]));
  if (newById.size !== newItems.length) {
    throw new Error('Hay identificadores duplicados en el historial ' + collectionName + '.');
  }
  const stripMutable = item => {
    const copy = { ...item };
    for (const key of mutableKeys) delete copy[key];
    return copy;
  };
  for (const oldItem of oldItems) {
    if (isLegacyDemoRecord(oldItem)) continue;
    const nextItem = newById.get(String(oldItem.id));
    if (!nextItem) {
      throw new Error('SQLite bloqueó la eliminación del registro histórico en ' + collectionName + ' (' + oldItem.id + '). Use una reversión o corrección trazable.');
    }
    if (JSON.stringify(stripMutable(oldItem)) !== JSON.stringify(stripMutable(nextItem))) {
      throw new Error('SQLite bloqueó la modificación de un registro histórico en ' + collectionName + ' (' + oldItem.id + ').');
    }
    for (const key of monotonicKeys) {
      if (oldItem[key] && nextItem[key] !== oldItem[key]) {
        throw new Error('No se puede retirar ni modificar la marca histórica ' + key + ' del registro ' + oldItem.id + '.');
      }
    }
    const freezeWhenActive = (flag, detailKeys) => {
      if (!oldItem[flag]) return;
      for (const key of detailKeys) {
        if ((oldItem[key] || null) !== (nextItem[key] || null)) {
          throw new Error('No se puede modificar el soporte histórico ' + key + ' del registro ' + oldItem.id + '.');
        }
      }
    };
    freezeWhenActive('isCancelled', ['cancelledByJournalEntryId', 'cancellationReason', 'cancellationNote']);
    freezeWhenActive('isReversed', ['reversedByJournalEntryId']);
    freezeWhenActive('requiresFiscalCorrection', ['correctionEntryId', 'correctionNote']);
  }
}

function validateAccountingSnapshot(previousState, nextState) {
  if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) {
    throw new Error('Estado contable inválido.');
  }
  const priorState = previousState && typeof previousState === 'object' ? previousState : {};
  assertAppendOnlyCollection(priorState, nextState, 'purchases',
    ['isCancelled', 'cancelledByJournalEntryId', 'cancellationReason', 'cancellationNote'], ['isCancelled']);
  assertAppendOnlyCollection(priorState, nextState, 'sales',
    ['isCancelled', 'cancelledByJournalEntryId', 'cancellationReason', 'cancellationNote'], ['isCancelled']);
  assertAppendOnlyCollection(priorState, nextState, 'movements');
  assertAppendOnlyCollection(priorState, nextState, 'creditSettlements',
    ['isReversed', 'reversedByJournalEntryId'], ['isReversed']);
  assertAppendOnlyCollection(priorState, nextState, 'bankStatementMovements',
    ['isReconciled', 'reconciledWithJournalEntryId', 'matchedBy', 'reconciledAt']);
  assertAppendOnlyCollection(priorState, nextState, 'vatVouchers',
    ['requiresFiscalCorrection', 'correctionEntryId', 'correctionNote'], ['requiresFiscalCorrection']);
  assertAppendOnlyCollection(priorState, nextState, 'islrVouchers',
    ['requiresFiscalCorrection', 'correctionEntryId', 'correctionNote'], ['requiresFiscalCorrection']);

  const priorEntries = asArray(priorState.journalEntries);
  const nextEntries = asArray(nextState.journalEntries);
  const priorById = new Map(priorEntries.map(entry => [String(entry.id), entry]));
  const nextById = new Map(nextEntries.map(entry => [String(entry.id), entry]));
  if (nextById.size !== nextEntries.length) {
    throw new Error('Hay identificadores de asientos duplicados; SQLite rechazó el guardado.');
  }
  const immutableEntry = entry => {
    const { reversedByEntryId, isAdjusted, ...immutable } = entry;
    return immutable;
  };
  for (const prior of priorEntries) {
    if (isLegacyDemoRecord(prior)) continue;
    const next = nextById.get(String(prior.id));
    if (!next) {
      throw new Error('SQLite bloqueó la eliminación del asiento histórico #' + prior.entryNumber + '. El Libro Diario es inmutable.');
    }
    if (JSON.stringify(immutableEntry(prior)) !== JSON.stringify(immutableEntry(next))) {
      throw new Error('SQLite bloqueó la modificación del contenido histórico del asiento #' + prior.entryNumber + '. Registre un contra-asiento.');
    }
    if (prior.reversedByEntryId && prior.reversedByEntryId !== next.reversedByEntryId) {
      throw new Error('No se puede cambiar ni retirar el enlace de reversión del asiento #' + prior.entryNumber + '.');
    }
    if (next.reversedByEntryId && !prior.reversedByEntryId) {
      const reversal = nextById.get(String(next.reversedByEntryId));
      if (!reversal || reversal.reversalOfEntryId !== prior.id) {
        throw new Error('El enlace de reversión del asiento #' + prior.entryNumber + ' no tiene un contra-asiento válido.');
      }
    }
    if (prior.isAdjusted && !next.isAdjusted) {
      throw new Error('No se puede retirar la marca de ajuste del asiento #' + prior.entryNumber + '.');
    }
    if (!prior.isAdjusted && next.isAdjusted && !next.reversedByEntryId) {
      throw new Error('Un asiento no puede marcarse como ajustado sin un contra-asiento enlazado.');
    }
  }

  const priorNumberKeys = new Set(priorEntries.map(entry => String(entry.companyId) + ':' + String(entry.entryNumber)));
  const seenNewNumbers = new Set();
  for (const entry of nextEntries) {
    const numberKey = String(entry.companyId) + ':' + String(entry.entryNumber);
    if (priorById.has(String(entry.id))) continue;
    if (priorNumberKeys.has(numberKey) || seenNewNumbers.has(numberKey)) {
      throw new Error('SQLite bloqueó un número de asiento duplicado en la empresa ' + entry.companyId + '.');
    }
    seenNewNumbers.add(numberKey);
    if (!Array.isArray(entry.items) || entry.items.length < 2) {
      throw new Error('Un nuevo asiento no contiene líneas contables suficientes.');
    }
    const totals = entry.items.reduce((sum, item) => {
      const values = [item.debitBs, item.creditBs, item.debitUsd, item.creditUsd].map(Number);
      if (values.some(value => !Number.isFinite(value) || value < 0) ||
          (Number(item.debitBs) > 0 && Number(item.creditBs) > 0) ||
          (Number(item.debitUsd) > 0 && Number(item.creditUsd) > 0)) {
        throw new Error('SQLite rechazó un asiento con importes o lados contables inválidos.');
      }
      sum.debitBs += Number(item.debitBs); sum.creditBs += Number(item.creditBs);
      sum.debitUsd += Number(item.debitUsd); sum.creditUsd += Number(item.creditUsd);
      return sum;
    }, { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 });
    if (Math.abs(totals.debitBs - totals.creditBs) >= 0.01 ||
        Math.abs(totals.debitUsd - totals.creditUsd) >= 0.01 ||
        totals.debitBs <= 0 || totals.debitUsd <= 0) {
      throw new Error('SQLite rechazó el asiento #' + entry.entryNumber + ': no cuadra simultáneamente en Bs. y USD.');
    }
    if (entry.reversalOfEntryId) {
      const source = nextById.get(String(entry.reversalOfEntryId));
      const otherReversal = nextEntries.find(candidate => candidate.id !== entry.id &&
        candidate.companyId === entry.companyId && candidate.reversalOfEntryId === entry.reversalOfEntryId);
      if (otherReversal) {
        throw new Error('SQLite bloqueó una segunda reversión del mismo asiento original.');
      }
      if (!source || source.companyId !== entry.companyId || source.reversalOfEntryId ||
          source.reversedByEntryId !== entry.id || !source.isAdjusted ||
          String(entry.reversalReason || '').trim().length < 10 ||
          String(entry.workpaperNote || '').trim().length < 10 ||
          String(entry.date || '') < String(source.date || '')) {
        throw new Error('SQLite rechazó un contra-asiento sin origen, enlace recíproco, justificación, papel de trabajo o fecha válida.');
      }
    }
  }
  return { priorEntries, nextEntries, priorById, nextById };
}

module.exports = { validateAccountingSnapshot };
