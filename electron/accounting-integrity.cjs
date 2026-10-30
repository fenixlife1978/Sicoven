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
    ['journalEntryId', 'isCancelled', 'cancelledByJournalEntryId', 'cancellationReason', 'cancellationNote'], ['journalEntryId', 'isCancelled']);
  assertAppendOnlyCollection(priorState, nextState, 'sales',
    ['journalEntryId', 'isCancelled', 'cancelledByJournalEntryId', 'cancellationReason', 'cancellationNote'], ['isCancelled']);
  assertAppendOnlyCollection(priorState, nextState, 'movements');
  assertAppendOnlyCollection(priorState, nextState, 'creditSettlements',
    ['isReversed', 'reversedByJournalEntryId'], ['isReversed']);
  assertAppendOnlyCollection(priorState, nextState, 'bankStatementMovements',
    ['isReconciled', 'reconciledWithJournalEntryId', 'reconciledJournalEntryIds', 'matchedBy', 'reconciledAt']);
  assertAppendOnlyCollection(priorState, nextState, 'vatVouchers',
    ['requiresFiscalCorrection', 'correctionEntryId', 'correctionNote'], ['requiresFiscalCorrection']);
  assertAppendOnlyCollection(priorState, nextState, 'islrVouchers',
    ['requiresFiscalCorrection', 'correctionEntryId', 'correctionNote'], ['requiresFiscalCorrection']);
  const nextBankRows = new Map(asArray(nextState.bankStatementMovements).map(item => [String(item.id), item]));
  for (const oldRow of asArray(priorState.bankStatementMovements)) {
    if (isLegacyDemoRecord(oldRow)) continue;
    const nextRow = nextBankRows.get(String(oldRow.id));
    if (!nextRow) continue; // La validación append-only anterior ya rechazó su eliminación.
    const oldLinks = Array.isArray(oldRow.reconciledJournalEntryIds) ? oldRow.reconciledJournalEntryIds : [];
    const nextLinks = Array.isArray(nextRow.reconciledJournalEntryIds) ? nextRow.reconciledJournalEntryIds : [];
    if (new Set(nextLinks).size !== nextLinks.length || oldLinks.some(id => !nextLinks.includes(id))) {
      throw new Error('SQLite bloqueó la eliminación o alteración del historial de conciliación bancaria del movimiento ' + oldRow.id + '.');
    }
  }

  const oldCompanies = new Map(asArray(priorState.companies).map(company => [String(company.id), company]));
  const nextCompanies = new Map(asArray(nextState.companies).map(company => [String(company.id), company]));
  for (const oldCompany of oldCompanies.values()) {
    if (!oldCompany.closedThroughDate) continue;
    const nextCompany = nextCompanies.get(String(oldCompany.id));
    if (!nextCompany || !nextCompany.closedThroughDate ||
        String(nextCompany.closedThroughDate) < String(oldCompany.closedThroughDate)) {
      throw new Error('SQLite bloqueó la reapertura o eliminación del cierre contable de la empresa ' + oldCompany.name + '. Se requiere un procedimiento formal de reapertura.');
    }
  }

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
  const maxPriorNumberByCompany = new Map();
  for (const prior of priorEntries) {
    const key = String(prior.companyId);
    maxPriorNumberByCompany.set(key, Math.max(maxPriorNumberByCompany.get(key) || 0, Number(prior.entryNumber) || 0));
  }
  const seenNewNumbers = new Set();
  for (const entry of nextEntries) {
    const numberKey = String(entry.companyId) + ':' + String(entry.entryNumber);
    if (priorById.has(String(entry.id))) continue;
    if (!Number.isInteger(Number(entry.entryNumber)) || Number(entry.entryNumber) <= (maxPriorNumberByCompany.get(String(entry.companyId)) || 0)) {
      throw new Error('SQLite bloqueó un correlativo de asiento no creciente en la empresa ' + entry.companyId + '.');
    }
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

  for (const collectionName of ['purchases', 'sales']) {
    const expectedEntryType = collectionName === 'sales' ? 'VENTA' : 'COMPRA';
    for (const document of asArray(nextState[collectionName])) {
      if (!document.journalEntryId || (document.documentType && document.documentType !== '01')) continue;
      const linkedEntry = nextById.get(String(document.journalEntryId));
      if (!linkedEntry || linkedEntry.companyId !== document.companyId ||
          linkedEntry.type !== expectedEntryType) {
        throw new Error('SQLite rechazó un vínculo de factura con un asiento de otra empresa, tipo o documento.');
      }
    }
    const oldDocuments = asArray(priorState[collectionName]);
    const newDocuments = asArray(nextState[collectionName]);
    const oldById = new Map(oldDocuments.map(document => [String(document.id), document]));
    for (const document of newDocuments) {
      const oldDocument = oldById.get(String(document.id));
      if (!document.isCancelled || (oldDocument && oldDocument.isCancelled)) continue;
      if (!oldDocument) throw new Error('SQLite bloqueó la creación directa de un documento ya marcado como reversado.');
      const originalEntry = oldDocument.journalEntryId
        ? priorById.get(String(oldDocument.journalEntryId))
        : priorEntries.find(entry => entry.companyId === document.companyId &&
            entry.type === expectedEntryType && entry.referenceDoc === 'FAC-' + document.invoiceNumber);
      const reversal = document.cancelledByJournalEntryId
        ? nextById.get(String(document.cancelledByJournalEntryId))
        : undefined;
      if (!originalEntry || !reversal || reversal.companyId !== document.companyId ||
          reversal.reversalOfEntryId !== originalEntry.id ||
          (document.journalEntryId && document.journalEntryId !== originalEntry.id) ||
          String(document.cancellationReason || '').trim().length < 10 ||
          String(document.cancellationNote || '').trim().length < 10) {
        throw new Error('SQLite rechazó la cancelación del documento fiscal: falta el contra-asiento enlazado, el motivo o el papel de trabajo.');
      }
    }
  }

  // Una factura nueva que declara líneas de inventario debe ingresar exactamente
  // esas cantidades y costos al Kardex dentro del mismo snapshot SQLite.
  // El guardado completo ocurre dentro de una única transacción SQLite; no basta
  // con que el formulario haya intentado agregar los movimientos.
  // No permitir que una importación de respaldo o una escritura directa del
  // snapshot salte las guardias del formulario/contexto para notas de crédito.
  const normalizeDocument = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const normalizeRif = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const priorPurchaseIdsForIntegrity = new Set(asArray(priorState.purchases).map(item => String(item.id)));
  const priorMovementIdsForIntegrity = new Set(asArray(priorState.movements).map(item => String(item.id)));
  const normalizeDocument = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const normalizeRif = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  for (const purchase of asArray(nextState.purchases)) {
    if (priorPurchaseIdsForIntegrity.has(String(purchase.id)) ||
        !Array.isArray(purchase.inventoryLines) || purchase.inventoryLines.length === 0) continue;
    const lines = purchase.inventoryLines;
    const productIds = new Set();
    let lineTotal = 0;
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCostBs);
      if (!line.productId || productIds.has(String(line.productId)) ||
          !Number.isFinite(quantity) || quantity <= 0 ||
          !Number.isFinite(unitCost) || unitCost <= 0) {
        throw new Error('SQLite rechazó líneas de inventario de compra duplicadas o con cantidad/costo inválido.');
      }
      productIds.add(String(line.productId));
      lineTotal += quantity * unitCost;
    }
    lineTotal = money(lineTotal);
    const invoiceInventoryTotal = money(Number(purchase.taxableBaseBs || 0) + Number(purchase.exemptAmountBs || 0));
    if (!Number.isFinite(invoiceInventoryTotal) || Math.abs(lineTotal - invoiceInventoryTotal) > 0.02) {
      throw new Error('SQLite rechazó la compra: las líneas de inventario no concilian con base imponible más exento.');
    }
    const expectedReference = normalizeDocument('FAC-' + purchase.invoiceNumber);
    const linkedMovements = asArray(nextState.movements).filter(movement =>
      movement.companyId === purchase.companyId &&
      movement.type === 'ENTRADA' && movement.concept === 'COMPRA' &&
      normalizeDocument(movement.documentRef) === expectedReference
    );
    if (linkedMovements.length !== lines.length) {
      throw new Error('SQLite rechazó la compra: el número de entradas de Kardex no coincide con las líneas de inventario declaradas.');
    }
    for (const line of lines) {
      const matches = linkedMovements.filter(movement => String(movement.productId) === String(line.productId));
      if (matches.length !== 1) {
        throw new Error('SQLite rechazó la compra: falta una entrada de Kardex única para el artículo ' + line.productId + '.');
      }
      const movement = matches[0];
      const expectedCost = money(Number(line.quantity) * Number(line.unitCostBs));
      const movementQuantity = Number(movement.quantity);
      const movementCostBs = Number(movement.totalCostBs);
      const movementCostUsd = Number(movement.totalCostUsd);
      const movementRate = Number(movement.bcvRate);
      const invoiceRate = Number(purchase.bcvRate);
      if (priorMovementIdsForIntegrity.has(String(movement.id)) ||
          movement.date !== purchase.invoiceDate ||
          !Number.isFinite(movementQuantity) ||
          Math.abs(movementQuantity - Number(line.quantity)) > 0.000001 ||
          !Number.isFinite(movementCostBs) ||
          Math.abs(money(movementCostBs) - expectedCost) > 0.02 ||
          !Number.isFinite(invoiceRate) || invoiceRate <= 0 ||
          !Number.isFinite(movementRate) || Math.abs(movementRate - invoiceRate) > 0.000001 ||
          !Number.isFinite(movementCostUsd) ||
          Math.abs(movementCostUsd - movementCostBs / invoiceRate) > 0.0001 ||
          normalizeRif(movement.counterpartyRif) !== normalizeRif(purchase.supplierRif)) {
        throw new Error('SQLite rechazó la compra: una entrada de Kardex no coincide en fecha, proveedor, tasa BCV, cantidad o costo con su línea de factura.');
      }
    }
    const purchaseEntry = purchase.journalEntryId
      ? nextById.get(String(purchase.journalEntryId))
      : undefined;
    const inventoryDebits = purchaseEntry?.items?.reduce((sum, item) => ({
      debitBs: sum.debitBs + (item.accountCode === '1.1.4.01' ? Number(item.debitBs || 0) : 0),
      debitUsd: sum.debitUsd + (item.accountCode === '1.1.4.01' ? Number(item.debitUsd || 0) : 0)
    }), { debitBs: 0, debitUsd: 0 });
    const inventoryDebitBs = Number(inventoryDebits?.debitBs);
    const inventoryDebitUsd = Number(inventoryDebits?.debitUsd);
    if (!purchaseEntry || purchaseEntry.companyId !== purchase.companyId ||
        purchaseEntry.type !== 'COMPRA' ||
        !Number.isFinite(inventoryDebitBs) || Math.abs(money(inventoryDebitBs) - lineTotal) > 0.02 ||
        !Number.isFinite(inventoryDebitUsd) ||
        Math.abs(inventoryDebitUsd - lineTotal / Number(purchase.bcvRate)) > 0.0001) {
      throw new Error('SQLite rechazó la compra: el asiento no reconoce en Bs. y USD el costo total conciliado de las líneas de Kardex.');
    }
  }

  const priorMovementIdSet = new Set(asArray(priorState.movements).map(item => String(item.id)));
  const priorPurchaseIdSet = new Set(asArray(priorState.purchases).map(item => String(item.id)));
  const newSupplierReturns = asArray(nextState.movements).filter(movement =>
    !priorMovementIdSet.has(String(movement.id)) &&
    movement.type === 'SALIDA' && movement.concept === 'DEVOLUCION_COMPRA');
  const newCreditNotes = asArray(nextState.purchases).filter(purchase =>
    !priorPurchaseIdSet.has(String(purchase.id)) && purchase.documentType === '03');
  for (const purchase of asArray(nextState.purchases)) {
    if (!priorPurchaseIdSet.has(String(purchase.id)) && !['01', '03'].includes(purchase.documentType)) {
      throw new Error('SQLite bloqueó una nota de débito/crédito sin flujo contable autorizado.');
    }
  }
  const expectedReturnCount = newCreditNotes.reduce((sum, note) =>
    sum + (Array.isArray(note.creditNoteLines) ? note.creditNoteLines.length : 0), 0);
  if (newSupplierReturns.length !== expectedReturnCount) {
    throw new Error('SQLite bloqueó la operación: cada línea de nota de crédito debe tener exactamente su salida de Kardex asociada y viceversa.');
  }
  for (const note of newCreditNotes) {
    const original = asArray(nextState.purchases).find(item =>
      item.id === note.originalPurchaseId && item.companyId === note.companyId && item.documentType === '01');
    const lines = Array.isArray(note.creditNoteLines) ? note.creditNoteLines : [];
    const company = asArray(nextState.companies).find(item => item.id === note.companyId);
    const duplicateNoteNumber = asArray(nextState.purchases).some(item =>
      item.id !== note.id && item.companyId === note.companyId && item.documentType === '03' &&
      normalizeDocument(item.creditNoteNumber || item.invoiceNumber) === normalizeDocument(note.creditNoteNumber));
    if (!original || original.isCancelled || normalizeRif(note.supplierRif) !== normalizeRif(original.supplierRif) ||
        note.affectedInvoiceNumber !== original.invoiceNumber || note.invoiceDate < original.invoiceDate ||
        (company?.closedThroughDate && note.invoiceDate <= company.closedThroughDate) ||
        duplicateNoteNumber ||
        !note.creditNoteNumber || !note.controlNumber || String(note.notes || '').trim().length < 10 ||
        lines.length === 0 || !note.journalEntryId ||
        !Number.isFinite(Number(note.netPayableReductionBs)) || Number(note.netPayableReductionBs) <= 0 ||
        !Number.isFinite(Number(note.netPayableReductionUsd)) || Number(note.netPayableReductionUsd) <= 0) {
      throw new Error('SQLite rechazó la nota de crédito: falta factura original, proveedor, soporte, líneas de Kardex o reducción de CxP válida.');
    }
    const sourceLines = Array.isArray(original.inventoryLines) ? original.inventoryLines : [];
    const sourceMovements = asArray(nextState.movements).filter(item =>
      item.companyId === original.companyId && item.type === 'ENTRADA' &&
      item.concept === 'COMPRA' && !item.correctionForMovementId &&
      normalizeDocument(item.documentRef) === normalizeDocument('FAC-' + original.invoiceNumber));
    const sourceLineTotal = money(sourceLines.reduce((sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitCostBs || 0), 0));
    const sourceEntry = original.journalEntryId ? nextById.get(String(original.journalEntryId)) : undefined;
    const sourceInventoryDebit = sourceEntry?.items?.reduce((sum, item) =>
      sum + (item.accountCode === '1.1.4.01' ? Number(item.debitBs || 0) : 0), 0) || 0;
    const sourceInventoryDebitUsd = sourceEntry?.items?.reduce((sum, item) =>
      sum + (item.accountCode === '1.1.4.01' ? Number(item.debitUsd || 0) : 0), 0) || 0;
    const sourceRate = Number(original.bcvRate);
    const sourceReconciles = sourceLines.length > 0 && Number.isFinite(sourceRate) && sourceRate > 0 &&
      Math.abs(sourceLineTotal - Number(original.taxableBaseBs || 0) - Number(original.exemptAmountBs || 0)) <= 0.02 &&
      sourceMovements.length === sourceLines.length &&
      sourceLines.every(sourceLine => {
        const matches = sourceMovements.filter(item => String(item.productId) === String(sourceLine.productId));
        if (matches.length !== 1) return false;
        const sourceMovement = matches[0];
        const expectedBs = money(Number(sourceLine.quantity) * Number(sourceLine.unitCostBs));
        return sourceMovement.date === original.invoiceDate &&
          normalizeRif(sourceMovement.counterpartyRif) === normalizeRif(original.supplierRif) &&
          Math.abs(Number(sourceMovement.quantity) - Number(sourceLine.quantity)) <= 0.000001 &&
          Math.abs(Number(sourceMovement.unitCostBs) - Number(sourceLine.unitCostBs)) <= 0.02 &&
          Math.abs(money(Number(sourceMovement.totalCostBs)) - expectedBs) <= 0.02 &&
          Math.abs(Number(sourceMovement.bcvRate) - sourceRate) <= 0.000001 &&
          Math.abs(Number(sourceMovement.totalCostUsd) - expectedBs / sourceRate) <= 0.0001;
      }) &&
      sourceEntry?.type === 'COMPRA' && sourceEntry.companyId === original.companyId &&
      Math.abs(sourceInventoryDebit - sourceLineTotal) <= 0.02 &&
      Math.abs(sourceInventoryDebitUsd - sourceLineTotal / sourceRate) <= 0.0001;
    const journal = nextById.get(String(note.journalEntryId));
    if (!sourceReconciles || !journal || journal.companyId !== note.companyId ||
        journal.type !== 'AJUSTE' || journal.date !== note.invoiceDate ||
        normalizeDocument(journal.referenceDoc) !== normalizeDocument('NC-PROV-' + note.creditNoteNumber)) {
      throw new Error('SQLite rechazó la nota de crédito: la factura original o el asiento fiscal no están conciliados.');
    }
    const journalMovementIds = new Set();
    let totalInventoryCost = 0;
    for (const line of lines) {
      const originalMovement = asArray(nextState.movements).find(item =>
        item.id === line.originalMovementId && item.companyId === note.companyId &&
        item.type === 'ENTRADA' && item.concept === 'COMPRA' &&
        normalizeDocument(item.documentRef) === normalizeDocument('FAC-' + original.invoiceNumber));
      const returnMovement = asArray(nextState.movements).find(item =>
        item.id === line.movementId && item.companyId === note.companyId);
      const originalLine = sourceLines.find(item => item.productId === line.productId);
      const product = asArray(nextState.products).find(item => item.id === line.productId && item.companyId === note.companyId);
      if (!originalMovement || !returnMovement || !newSupplierReturns.some(item => item.id === returnMovement.id) ||
          journalMovementIds.has(String(returnMovement.id)) ||
          returnMovement.type !== 'SALIDA' || returnMovement.concept !== 'DEVOLUCION_COMPRA' ||
          returnMovement.correctionForMovementId !== originalMovement.id ||
          normalizeDocument(returnMovement.documentRef) !== normalizeDocument('NC-PROV-' + note.creditNoteNumber) ||
          returnMovement.journalEntryId !== journal.id ||
          Math.abs(Number(returnMovement.quantity) - Number(line.quantity)) > 0.000001 ||
          Math.abs(Number(returnMovement.totalCostBs) - Number(line.inventoryCostBs)) > 0.02 ||
          Math.abs(Number(returnMovement.totalCostUsd) - Number(line.inventoryCostBs) / Number(note.bcvRate)) > 0.0001 ||
          normalizeRif(returnMovement.counterpartyRif) !== normalizeRif(original.supplierRif) ||
          !originalLine || !product || Number(line.quantity) <= 0 ||
          Math.abs(Number(line.unitCostBs) - Number(originalLine.unitCostBs)) > 0.02 ||
          Math.abs(Number(line.inventoryCostBs) - Number(line.quantity) * Number(line.unitCostBs)) > 0.02) {
        throw new Error('SQLite rechazó una línea de nota de crédito: la salida física no concilia con la entrada original y el asiento enlazado.');
      }
      journalMovementIds.add(String(returnMovement.id));
      totalInventoryCost += Number(line.inventoryCostBs);
      const allReturned = asArray(nextState.purchases).filter(item => item.originalPurchaseId === original.id)
        .flatMap(item => Array.isArray(item.creditNoteLines) ? item.creditNoteLines : [])
        .filter(item => item.productId === line.productId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (allReturned > Number(originalLine.quantity) + 0.000001) {
        throw new Error('SQLite rechazó la nota de crédito: las devoluciones acumuladas superan la cantidad facturada.');
      }
      const priorProduct = asArray(priorState.products).find(item => item.id === line.productId && item.companyId === note.companyId);
      const nextProduct = asArray(nextState.products).find(item => item.id === line.productId && item.companyId === note.companyId);
      const allNewReturnsForProduct = newSupplierReturns.filter(item => item.productId === line.productId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (!priorProduct || !nextProduct ||
          Math.abs(Number(priorProduct.currentStock) - allNewReturnsForProduct - Number(nextProduct.currentStock)) > 0.000001 ||
          Math.abs(Number(returnMovement.balanceQty) - Number(nextProduct.currentStock)) > 0.000001) {
        throw new Error('SQLite rechazó la nota de crédito: la existencia final del artículo no coincide con las salidas físicas registradas.');
      }
    }
    const debitsBs = journal.items.reduce((sum, item) => sum + Number(item.debitBs || 0), 0);
    const creditsBs = journal.items.reduce((sum, item) => sum + Number(item.creditBs || 0), 0);
    const debitsUsd = journal.items.reduce((sum, item) => sum + Number(item.debitUsd || 0), 0);
    const creditsUsd = journal.items.reduce((sum, item) => sum + Number(item.creditUsd || 0), 0);
    const accountSum = (code, side, currency) => journal.items
      .filter(item => item.accountCode === code)
      .reduce((sum, item) => sum + Number(item[side + currency] || 0), 0);
    const inventoryByAccount = new Map();
    for (const line of lines) {
      const product = asArray(nextState.products).find(item => item.id === line.productId && item.companyId === note.companyId);
      const code = product?.inventoryAccountCode || '1.1.4.01';
      inventoryByAccount.set(code, (inventoryByAccount.get(code) || 0) + Number(line.inventoryCostBs));
    }
    const inventoryAccountsMatch = [...inventoryByAccount.entries()].every(([code, amount]) =>
      Math.abs(accountSum(code, 'credit', 'Bs') - amount) <= 0.02 &&
      Math.abs(accountSum(code, 'credit', 'Usd') - amount / Number(note.bcvRate)) <= 0.0001);
    if (Math.abs(debitsBs - creditsBs) > 0.02 || Math.abs(debitsUsd - creditsUsd) > 0.0001 ||
        Math.abs(totalInventoryCost - Number(note.taxableBaseBs) - Number(note.exemptAmountBs)) > 0.02 ||
        Math.abs(accountSum('2.1.1.01', 'debit', 'Bs') - Number(note.netPayableReductionBs)) > 0.02 ||
        Math.abs(accountSum('2.1.1.01', 'debit', 'Usd') - Number(note.netPayableReductionUsd)) > 0.0001 ||
        !inventoryAccountsMatch ||
        Math.abs(accountSum('1.1.3.01', 'credit', 'Bs') - Number(note.vatAmountBs || 0)) > 0.02 ||
        Math.abs(accountSum('1.1.3.01', 'credit', 'Usd') - Number(note.vatAmountUsd || 0)) > 0.0001 ||
        Math.abs(accountSum('2.1.2.03', 'debit', 'Bs') - Number(note.vatWithheldBs || 0)) > 0.02 ||
        Math.abs(accountSum('2.1.2.03', 'debit', 'Usd') - Number(note.vatWithheldUsd || 0)) > 0.0001 ||
        Math.abs(accountSum('2.1.2.04', 'debit', 'Bs') - Number(note.islrWithheldBs || 0)) > 0.02 ||
        Math.abs(accountSum('2.1.2.04', 'debit', 'Usd') - Number(note.islrWithheldUsd || 0)) > 0.0001 ||
        Math.abs(accountSum('6.1.1.11', 'credit', 'Bs') - Number(note.igtfAmountBs || 0)) > 0.02 ||
        Math.abs(accountSum('6.1.1.11', 'credit', 'Usd') - Number(note.igtfAmountUsd || 0)) > 0.0001 ||
        Math.abs(Number(note.totalAmountBs) - Number(note.taxableBaseBs) - Number(note.exemptAmountBs) - Number(note.vatAmountBs) - Number(note.igtfAmountBs || 0)) > 0.02 ||
        Math.abs(Number(note.netPayableReductionBs) - (Number(note.totalAmountBs) - Number(note.vatWithheldBs || 0) - Number(note.islrWithheldBs || 0))) > 0.02) {
      throw new Error('SQLite rechazó la nota de crédito: el asiento no está balanceado o no revierte CxP, inventario, IVA, retenciones e IGTF.');
    }
    const paid = asArray(nextState.creditSettlements).filter(item =>
      item.companyId === original.companyId && item.documentId === original.id &&
      item.kind === 'PURCHASE_PAYMENT' && !item.isReversed)
      .reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
    const credited = asArray(nextState.purchases).filter(item => item.originalPurchaseId === original.id)
      .reduce((sum, item) => sum + Number(item.netPayableReductionUsd || 0), 0);
    const originalNetUsd = Number(original.totalAmountUsd) -
      Number(original.vatWithheldUsd || 0) - Number(original.islrWithheldUsd || 0);
    if (paid + credited > originalNetUsd + 0.005) {
      throw new Error('SQLite rechazó la nota de crédito: pagos más notas superan el principal neto de CxP original.');
    }
  }
  for (const movement of newSupplierReturns) {
    const linked = newCreditNotes.some(note =>
      (note.creditNoteLines || []).some(line => line.movementId === movement.id));
    if (!linked) throw new Error('SQLite bloqueó una salida por devolución a proveedor sin nota de crédito fiscal enlazada.');
  }

  const oldSettlements = new Map(asArray(priorState.creditSettlements).map(item => [String(item.id), item]));
  for (const settlement of asArray(nextState.creditSettlements)) {
    const oldSettlement = oldSettlements.get(String(settlement.id));
    if (!oldSettlement || oldSettlement.isReversed || !settlement.isReversed) continue;
    const reversal = settlement.reversedByJournalEntryId
      ? nextById.get(String(settlement.reversedByJournalEntryId))
      : undefined;
    if (!reversal || reversal.companyId !== settlement.companyId ||
        reversal.reversalOfEntryId !== oldSettlement.journalEntryId) {
      throw new Error('SQLite rechazó la reversión de una liquidación sin contra-asiento vinculado.');
    }
  }

  const purchaseById = new Map(asArray(nextState.purchases).map(item => [String(item.id), item]));
  for (const voucher of asArray(nextState.vatVouchers)) {
    if (!voucher.requiresFiscalCorrection) continue;
    const purchase = purchaseById.get(String(voucher.purchaseRecordId));
    const correction = voucher.correctionEntryId ? nextById.get(String(voucher.correctionEntryId)) : undefined;
    const source = purchase?.journalEntryId ? priorById.get(String(purchase.journalEntryId)) : undefined;
    if (!purchase?.isCancelled || !correction || !source || correction.reversalOfEntryId !== source.id) {
      throw new Error('SQLite rechazó una marca de corrección de retención IVA sin factura y contra-asiento conciliados.');
    }
  }
  for (const voucher of asArray(nextState.islrVouchers)) {
    if (!voucher.requiresFiscalCorrection) continue;
    const purchase = asArray(nextState.purchases).find(item =>
      item.companyId === voucher.companyId && item.invoiceNumber === voucher.invoiceNumber);
    const correction = voucher.correctionEntryId ? nextById.get(String(voucher.correctionEntryId)) : undefined;
    const source = purchase?.journalEntryId ? priorById.get(String(purchase.journalEntryId)) : undefined;
    if (!purchase?.isCancelled || !correction || !source || correction.reversalOfEntryId !== source.id) {
      throw new Error('SQLite rechazó una marca de corrección de retención ISLR sin factura y contra-asiento conciliados.');
    }
  }
  return { priorEntries, nextEntries, priorById, nextById };
}

module.exports = { validateAccountingSnapshot };
