const LEGACY_DEMO_COMPANIES = new Set(['comp-1', 'comp-2']);

function isLegacyDemoRecord(record) {
  return LEGACY_DEMO_COMPANIES.has(String(record?.companyId || '')) ||
    String(record?.id || '') === 'entry-apertura-1';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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
    if (oldItem.requiresFiscalCorrection) {
      const oldCorrectionIds = Array.isArray(oldItem.correctionEntryIds) ? oldItem.correctionEntryIds : (oldItem.correctionEntryId ? [oldItem.correctionEntryId] : []);
      const nextCorrectionIds = Array.isArray(nextItem.correctionEntryIds) ? nextItem.correctionEntryIds : (nextItem.correctionEntryId ? [nextItem.correctionEntryId] : []);
      const oldCorrectionNote = String(oldItem.correctionNote || '');
      const nextCorrectionNote = String(nextItem.correctionNote || '');
      if (new Set(nextCorrectionIds).size !== nextCorrectionIds.length ||
          oldCorrectionIds.some(id => !nextCorrectionIds.includes(id)) ||
          (nextItem.correctionEntryId && !nextCorrectionIds.includes(nextItem.correctionEntryId)) ||
          (oldCorrectionNote && !nextCorrectionNote.startsWith(oldCorrectionNote))) {
        throw new Error('No se puede retirar ni alterar el historial de correcciones fiscales del comprobante ' + oldItem.id + '.');
      }
    }
  }
}

function purchaseJournalMatchesInvoice(purchase, entry, products = []) {
  if (!purchase || !entry || entry.type !== 'COMPRA' || entry.companyId !== purchase.companyId ||
      entry.date !== purchase.invoiceDate ||
      String(entry.referenceDoc || '').trim().toUpperCase().replace(/\s+/g, '') !==
        ('FAC-' + String(purchase.invoiceNumber || '')).trim().toUpperCase().replace(/\s+/g, '')) return false;
  const taxableBase = Number(purchase.taxableBaseBs);
  const exemptBase = Number(purchase.exemptAmountBs);
  const vat = Number(purchase.vatAmountBs);
  const vatWithheld = Number(purchase.vatWithheldBs ?? 0);
  const islrWithheld = Number(purchase.islrWithheldBs ?? 0);
  const igtf = Number(purchase.igtfAmountBs ?? 0);
  const total = Number(purchase.totalAmountBs);
  const rate = Number(purchase.bcvRate);
  const taxRate = Number(purchase.taxRate);
  const base = taxableBase + exemptBase;
  const payable = total - vatWithheld - islrWithheld;
  const values = [taxableBase, exemptBase, vat, vatWithheld, islrWithheld, igtf, total, rate, taxRate];
  if (!values.every(value => Number.isFinite(value) && value >= 0) ||
      rate <= 0 || taxRate > 100 || payable <= 0 ||
      Math.abs(vat - Math.round((taxableBase * taxRate / 100 + Number.EPSILON) * 100) / 100) > 0.02 ||
      Math.abs(total - (base + vat + igtf)) > 0.02) return false;

  const inventoryByAccount = new Map();
  if (Array.isArray(purchase.inventoryLines) && purchase.inventoryLines.length > 0) {
    for (const line of purchase.inventoryLines) {
      const product = asArray(products).find(item => String(item.id) === String(line.productId) &&
        String(item.companyId) === String(purchase.companyId));
      if (!product) return false;
      const code = String(product.inventoryAccountCode || '1.1.4.01');
      const amount = Number(line.quantity) * Number(line.unitCostBs);
      if (!code || !Number.isFinite(amount) || amount <= 0) return false;
      inventoryByAccount.set(code, (inventoryByAccount.get(code) || 0) + amount);
    }
  } else inventoryByAccount.set('1.1.4.01', base);
  const items = asArray(entry.items);
  const payableAccounts = [...new Set(items
    .filter(item => String(item.accountCode || '').startsWith('2.1.1.') && Number(item.creditBs || 0) > 0)
    .map(item => String(item.accountCode)))];
  if (payableAccounts.length !== 1) return false;
  const payableAccountCode = payableAccounts[0];
  const allowed = new Set([...inventoryByAccount.keys(), '1.1.3.01', '6.1.1.11', '2.1.2.03', '2.1.2.04', payableAccountCode]);
  if (!items.length || !items.every(item => {
    const amounts = [item.debitBs, item.creditBs, item.debitUsd, item.creditUsd].map(value => Number(value ?? 0));
    return Boolean(item.accountCode) && allowed.has(item.accountCode) &&
      amounts.every(value => Number.isFinite(value) && value >= 0) &&
      !(amounts[0] > 0 && amounts[1] > 0) && !(amounts[2] > 0 && amounts[3] > 0);
  })) return false;

  const byAccount = new Map();
  for (const item of items) {
    const current = byAccount.get(item.accountCode) || { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 };
    current.debitBs += Number(item.debitBs ?? 0);
    current.creditBs += Number(item.creditBs ?? 0);
    current.debitUsd += Number(item.debitUsd ?? 0);
    current.creditUsd += Number(item.creditUsd ?? 0);
    byAccount.set(item.accountCode, current);
  }
  const expected = new Map([
    ...[...inventoryByAccount.entries()].map(([code, amount]) => [code, { debitBs: money(amount), creditBs: 0 }]),
    ['1.1.3.01', { debitBs: vat, creditBs: 0 }],
    ['6.1.1.11', { debitBs: igtf, creditBs: 0 }],
    ['2.1.2.03', { debitBs: 0, creditBs: vatWithheld }],
    ['2.1.2.04', { debitBs: 0, creditBs: islrWithheld }],
    [payableAccountCode, { debitBs: 0, creditBs: payable }]
  ]);
  for (const [accountCode, amount] of expected) {
    const actual = byAccount.get(accountCode) || { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 };
    if (Math.abs(actual.debitBs - amount.debitBs) > 0.02 ||
        Math.abs(actual.creditBs - amount.creditBs) > 0.02 ||
        Math.abs(actual.debitUsd - amount.debitBs / rate) > 0.0001 ||
        Math.abs(actual.creditUsd - amount.creditBs / rate) > 0.0001) return false;
  }
  const debitBs = items.reduce((sum, item) => sum + Number(item.debitBs ?? 0), 0);
  const creditBs = items.reduce((sum, item) => sum + Number(item.creditBs ?? 0), 0);
  const debitUsd = items.reduce((sum, item) => sum + Number(item.debitUsd ?? 0), 0);
  const creditUsd = items.reduce((sum, item) => sum + Number(item.creditUsd ?? 0), 0);
  return Math.abs(debitBs - creditBs) <= 0.02 && Math.abs(debitUsd - creditUsd) <= 0.0001 &&
    Math.abs(Number(purchase.totalAmountUsd) - total / rate) <= 0.0001 &&
    Math.abs(Number(purchase.taxableBaseUsd) - taxableBase / rate) <= 0.0001 &&
    Math.abs(Number(purchase.vatAmountUsd) - vat / rate) <= 0.0001 &&
    Math.abs(Number(purchase.vatWithheldUsd ?? 0) - vatWithheld / rate) <= 0.0001 &&
    Math.abs(Number(purchase.islrWithheldUsd ?? 0) - islrWithheld / rate) <= 0.0001 &&
    Math.abs(Number(purchase.igtfAmountUsd ?? 0) - igtf / rate) <= 0.0001 &&
    Number.isFinite(Number(entry.bcvRate)) && Math.abs(Number(entry.bcvRate) - rate) <= 0.000001;
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
  assertAppendOnlyCollection(priorState, nextState, 'supplierAdvanceSettlements',
    ['isReversed', 'reversedByJournalEntryId'], ['isReversed']);
  assertAppendOnlyCollection(priorState, nextState, 'bankStatementMovements',
    ['isReconciled', 'reconciledWithJournalEntryId', 'reconciledJournalEntryIds', 'matchedBy', 'reconciledAt']);
  assertAppendOnlyCollection(priorState, nextState, 'vatVouchers',
    ['requiresFiscalCorrection', 'correctionEntryId', 'correctionEntryIds', 'correctionNote'], ['requiresFiscalCorrection']);
  assertAppendOnlyCollection(priorState, nextState, 'islrVouchers',
    ['requiresFiscalCorrection', 'correctionEntryId', 'correctionEntryIds', 'correctionNote'], ['requiresFiscalCorrection']);
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
      if (entry.type !== 'AJUSTE' ||
          String(entry.referenceDoc || '') !== 'REV-' + source.entryNumber ||
          Math.abs(Number(entry.bcvRate) - Number(source.bcvRate)) > 0.000001 ||
          !Array.isArray(source.items) || source.items.length !== entry.items.length) {
        throw new Error('SQLite rechazó el contra-asiento: tipo, referencia, tasa BCV o cantidad de líneas no coincide con el asiento original.');
      }
      const accountByCode = new Map(asArray(nextState.accounts).map(account => [String(account.code), account]));
      let retainedTargetCode = '';
      for (let index = 0; index < source.items.length; index++) {
        const originalLine = source.items[index];
        const reversalLine = entry.items[index];
        const originalAccount = accountByCode.get(String(originalLine.accountCode));
        const remapToEquity = Boolean(entry.priorPeriodAdjustment && originalAccount &&
          ['INGRESOS', 'COSTOS', 'GASTOS'].includes(originalAccount.type));
        if (remapToEquity) {
          const targetAccount = accountByCode.get(String(reversalLine.accountCode));
          if (!targetAccount || targetAccount.type !== 'PATRIMONIO' || !targetAccount.isMovement ||
              (retainedTargetCode && retainedTargetCode !== targetAccount.code)) {
            throw new Error('SQLite rechazó el AIA: los resultados del período deben reclasificarse a una única cuenta de patrimonio de movimiento.');
          }
          retainedTargetCode = targetAccount.code;
        } else if (reversalLine.accountCode !== originalLine.accountCode) {
          throw new Error('SQLite rechazó el contra-asiento: no conserva la cuenta de la línea original.');
        }
        const pairs = [
          [reversalLine.debitBs, originalLine.creditBs, 0.01],
          [reversalLine.creditBs, originalLine.debitBs, 0.01],
          [reversalLine.debitUsd, originalLine.creditUsd, 0.0001],
          [reversalLine.creditUsd, originalLine.debitUsd, 0.0001]
        ];
        if (pairs.some(([actual, expected, tolerance]) =>
          !Number.isFinite(Number(actual)) || !Number.isFinite(Number(expected)) ||
          Math.abs(Number(actual) - Number(expected)) > tolerance)) {
          throw new Error('SQLite rechazó el contra-asiento: la línea ' + (index + 1) +
            ' no invierte exactamente Debe/Haber en Bs. y USD.');
        }
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
  const priorPurchaseIdsForIntegrity = new Set(asArray(priorState.purchases).map(item => String(item.id)));
  const priorMovementIdsForIntegrity = new Set(asArray(priorState.movements).map(item => String(item.id)));
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
      const lineUnitCostBs = Number(line.unitCostBs);
      const movementQuantity = Number(movement.quantity);
      const movementUnitCostBs = Number(movement.unitCostBs);
      const movementUnitCostUsd = Number(movement.unitCostUsd);
      const movementCostBs = Number(movement.totalCostBs);
      const movementCostUsd = Number(movement.totalCostUsd);
      const movementRate = Number(movement.bcvRate);
      const invoiceRate = Number(purchase.bcvRate);
      const supplierRif = normalizeRif(purchase.supplierRif);
      const movementRif = normalizeRif(movement.counterpartyRif);
      if (priorMovementIdsForIntegrity.has(String(movement.id)) ||
          movement.date !== purchase.invoiceDate ||
          !Number.isFinite(movementQuantity) ||
          Math.abs(movementQuantity - Number(line.quantity)) > 0.000001 ||
          !Number.isFinite(lineUnitCostBs) || !Number.isFinite(movementUnitCostBs) ||
          Math.abs(movementUnitCostBs - lineUnitCostBs) > 0.02 ||
          !Number.isFinite(invoiceRate) || invoiceRate <= 0 ||
          !Number.isFinite(movementRate) || Math.abs(movementRate - invoiceRate) > 0.000001 ||
          !Number.isFinite(movementUnitCostUsd) ||
          Math.abs(movementUnitCostUsd - lineUnitCostBs / invoiceRate) > 0.0001 ||
          !Number.isFinite(movementCostBs) ||
          Math.abs(money(movementCostBs) - expectedCost) > 0.02 ||
          !Number.isFinite(movementCostUsd) ||
          Math.abs(movementCostUsd - movementCostBs / invoiceRate) > 0.0001 ||
          !supplierRif || !movementRif || movementRif !== supplierRif) {
        throw new Error('SQLite rechazó la compra: una entrada de Kardex no coincide en fecha, proveedor, tasa BCV, cantidad o costo con su línea de factura.');
      }
    }
    const purchaseEntry = purchase.journalEntryId
      ? nextById.get(String(purchase.journalEntryId))
      : undefined;
    const purchaseProducts = asArray(nextState.products);
    const inventoryExpectedByAccount = new Map();
    for (const line of lines) {
      const product = purchaseProducts.find(item => String(item.id) === String(line.productId) &&
        String(item.companyId) === String(purchase.companyId));
      if (!product) throw new Error('SQLite rechazó la compra: no existe el artículo asociado a la línea ' + line.productId + '.');
      const code = String(product.inventoryAccountCode || '1.1.4.01');
      inventoryExpectedByAccount.set(code, money((inventoryExpectedByAccount.get(code) || 0) +
        Number(line.quantity) * Number(line.unitCostBs)));
    }
    const inventoryDebitBs = purchaseEntry?.items?.reduce((sum, item) =>
      sum + (inventoryExpectedByAccount.has(String(item.accountCode)) ? Number(item.debitBs || 0) : 0), 0);
    const inventoryDebitUsd = purchaseEntry?.items?.reduce((sum, item) =>
      sum + (inventoryExpectedByAccount.has(String(item.accountCode)) ? Number(item.debitUsd || 0) : 0), 0);
    if (!purchaseEntry || purchaseEntry.companyId !== purchase.companyId ||
        purchaseEntry.type !== 'COMPRA' ||
        !Number.isFinite(Number(inventoryDebitBs)) || Math.abs(money(inventoryDebitBs) - lineTotal) > 0.02 ||
        !Number.isFinite(Number(inventoryDebitUsd)) ||
        Math.abs(money(inventoryDebitUsd) - lineTotal / Number(purchase.bcvRate)) > 0.0001 ||
        !purchaseJournalMatchesInvoice(purchase, purchaseEntry, purchaseProducts)) {
      throw new Error('SQLite rechazó la compra: el asiento no reconoce en Bs. y USD el costo, IVA, IGTF, retenciones y CxP de la factura.');
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
    if (!original || original.isCancelled || !isValidIsoDate(original.invoiceDate) || !isValidIsoDate(note.invoiceDate) ||
        normalizeRif(note.supplierRif) !== normalizeRif(original.supplierRif) ||
        note.affectedInvoiceNumber !== original.invoiceNumber || note.invoiceDate < original.invoiceDate ||
        (company?.closedThroughDate && note.invoiceDate <= company.closedThroughDate) ||
        duplicateNoteNumber ||
        !note.creditNoteNumber || !note.controlNumber || String(note.notes || '').trim().length < 10 ||
        lines.length === 0 || !note.journalEntryId ||
        !Number.isFinite(Number(note.bcvRate)) || Number(note.bcvRate) <= 0 ||
        !Number.isFinite(Number(note.totalAmountBs)) || Number(note.totalAmountBs) <= 0 ||
        !Number.isFinite(Number(note.totalAmountUsd)) || Number(note.totalAmountUsd) <= 0 ||
        !Number.isFinite(Number(note.taxableBaseBs || 0)) || Number(note.taxableBaseBs || 0) < 0 ||
        !Number.isFinite(Number(note.exemptAmountBs || 0)) || Number(note.exemptAmountBs || 0) < 0 ||
        !Number.isFinite(Number(note.vatAmountBs || 0)) || Number(note.vatAmountBs || 0) < 0 ||
        !Number.isFinite(Number(note.igtfAmountBs || 0)) || Number(note.igtfAmountBs || 0) < 0 ||
        !Number.isFinite(Number(note.netPayableReductionBs)) || Number(note.netPayableReductionBs) < 0 ||
        !Number.isFinite(Number(note.netPayableReductionUsd)) || Number(note.netPayableReductionUsd) < 0 ||
        !Number.isFinite(Number(note.supplierAdvanceBs || 0)) || Number(note.supplierAdvanceBs || 0) < 0 ||
        !Number.isFinite(Number(note.supplierAdvanceUsd || 0)) || Number(note.supplierAdvanceUsd || 0) < 0) {
      throw new Error('SQLite rechazó la nota de crédito: falta factura original, proveedor, soporte, líneas de Kardex o reducción de CxP válida.');
    }
    const sourceEntryForPayable = asArray(nextState.journalEntries).find(item =>
      item.companyId === original.companyId && item.id === original.journalEntryId);
    const sourcePayableAccounts = [...new Set(asArray(sourceEntryForPayable?.items)
      .filter(item => String(item.accountCode || '').startsWith('2.1.1.') && Number(item.creditBs || 0) > 0)
      .map(item => String(item.accountCode)))];
    if (sourcePayableAccounts.length !== 1) {
      throw new Error('SQLite rechazó la nota de crédito: no se identifica una única cuenta auxiliar CxP en la factura original.');
    }
    const sourcePayableAccountCode = sourcePayableAccounts[0];
    const sourceLines = Array.isArray(original.inventoryLines) ? original.inventoryLines : [];
    const sourceProducts = asArray(nextState.products);
    for (const sourceLine of sourceLines) {
      const sourceProduct = sourceProducts.find(item =>
        String(item.id) === String(sourceLine.productId) && String(item.companyId) === String(original.companyId));
      if (!sourceProduct) {
        throw new Error('SQLite rechazó la factura de compra: no existe el artículo asociado en el catálogo de la empresa.');
      }
    }
    const sourceMovements = asArray(nextState.movements).filter(item =>
      item.companyId === original.companyId && item.type === 'ENTRADA' &&
      item.concept === 'COMPRA' && !item.correctionForMovementId &&
      normalizeDocument(item.documentRef) === normalizeDocument('FAC-' + original.invoiceNumber));
    const sourceLineTotal = money(sourceLines.reduce((sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitCostBs || 0), 0));
    const sourceEntry = original.journalEntryId ? nextById.get(String(original.journalEntryId)) : undefined;
    const sourceInventoryAccounts = new Set();
    for (const sourceLine of sourceLines) {
      const sourceProduct = sourceProducts.find(item =>
        String(item.id) === String(sourceLine.productId) && String(item.companyId) === String(original.companyId));
      sourceInventoryAccounts.add(String(sourceProduct.inventoryAccountCode || '1.1.4.01'));
    }
    const sourceInventoryDebit = sourceEntry?.items?.reduce((sum, item) =>
      sum + (sourceInventoryAccounts.has(String(item.accountCode)) ? Number(item.debitBs || 0) : 0), 0) || 0;
    const sourceInventoryDebitUsd = sourceEntry?.items?.reduce((sum, item) =>
      sum + (sourceInventoryAccounts.has(String(item.accountCode)) ? Number(item.debitUsd || 0) : 0), 0) || 0;
    const sourceRate = Number(original.bcvRate);
    const sourceReconciles = sourceLines.length > 0 && Number.isFinite(sourceRate) && sourceRate > 0 &&
      Math.abs(sourceLineTotal - Number(original.taxableBaseBs || 0) - Number(original.exemptAmountBs || 0)) <= 0.02 &&
      sourceMovements.length === sourceLines.length &&
      sourceLines.every(sourceLine => {
        const matches = sourceMovements.filter(item => String(item.productId) === String(sourceLine.productId));
        if (matches.length !== 1) return false;
        const sourceMovement = matches[0];
        const expectedBs = money(Number(sourceLine.quantity) * Number(sourceLine.unitCostBs));
        const movementRif = normalizeRif(sourceMovement.counterpartyRif);
        const supplierRif = normalizeRif(original.supplierRif);
        return sourceMovement.date === original.invoiceDate && Boolean(movementRif) && Boolean(supplierRif) &&
          movementRif === supplierRif &&
          Number.isFinite(Number(sourceMovement.quantity)) &&
          Math.abs(Number(sourceMovement.quantity) - Number(sourceLine.quantity)) <= 0.000001 &&
          Number.isFinite(Number(sourceMovement.unitCostBs)) &&
          Math.abs(Number(sourceMovement.unitCostBs) - Number(sourceLine.unitCostBs)) <= 0.02 &&
          Number.isFinite(Number(sourceMovement.unitCostUsd)) &&
          Math.abs(Number(sourceMovement.unitCostUsd) - Number(sourceLine.unitCostBs) / sourceRate) <= 0.0001 &&
          Math.abs(money(Number(sourceMovement.totalCostBs)) - expectedBs) <= 0.02 &&
          Math.abs(Number(sourceMovement.bcvRate) - sourceRate) <= 0.000001 &&
          Math.abs(Number(sourceMovement.totalCostUsd) - expectedBs / sourceRate) <= 0.0001;
      }) &&
      sourceEntry?.type === 'COMPRA' && sourceEntry.companyId === original.companyId &&
      Math.abs(sourceInventoryDebit - sourceLineTotal) <= 0.02 &&
      Math.abs(sourceInventoryDebitUsd - sourceLineTotal / sourceRate) <= 0.0001 &&
      purchaseJournalMatchesInvoice(original, sourceEntry, asArray(nextState.products));
    const journal = nextById.get(String(note.journalEntryId));
    if (!sourceReconciles || !journal || journal.companyId !== note.companyId ||
        journal.type !== 'AJUSTE' || journal.date !== note.invoiceDate ||
        normalizeDocument(journal.referenceDoc) !== normalizeDocument('NC-PROV-' + note.creditNoteNumber)) {
      throw new Error('SQLite rechazó la nota de crédito: la factura original o el asiento fiscal no están conciliados.');
    }
    const linkedCreditNoteCorrection = voucher => {
      if (!voucher?.requiresFiscalCorrection) return false;
      const correctionIds = Array.isArray(voucher.correctionEntryIds) ? voucher.correctionEntryIds : (voucher.correctionEntryId ? [voucher.correctionEntryId] : []);
      if (!correctionIds.includes(journal.id)) return false;
      const correction = nextById.get(String(journal.id));
      return Boolean(correction && asArray(nextState.purchases).some(candidate =>
        candidate.companyId === original.companyId && candidate.documentType === '03' &&
        candidate.originalPurchaseId === original.id && candidate.journalEntryId === correction.id &&
        normalizeDocument(correction.referenceDoc) === normalizeDocument('NC-PROV-' + candidate.creditNoteNumber)));
    };
    const originalVatVoucher = asArray(nextState.vatVouchers).find(voucher =>
      voucher.companyId === original.companyId && voucher.purchaseRecordId === original.id);
    const originalIslrVoucher = asArray(nextState.islrVouchers).find(voucher =>
      voucher.companyId === original.companyId && voucher.invoiceNumber === original.invoiceNumber &&
      voucher.supplierRif === original.supplierRif);
    if ((Number(note.vatWithheldBs || 0) > 0 && originalVatVoucher && !linkedCreditNoteCorrection(originalVatVoucher)) ||
        (Number(note.islrWithheldBs || 0) > 0 && originalIslrVoucher && !linkedCreditNoteCorrection(originalIslrVoucher))) {
      throw new Error('SQLite rechazó la nota de crédito: falta enlazar los comprobantes de retención IVA/ISLR afectados para revisión fiscal.');
    }
    const journalMovementIds = new Set();
    const sourceMovementIds = new Set();
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
          journalMovementIds.has(String(returnMovement.id)) || sourceMovementIds.has(String(line.originalMovementId)) ||
          originalMovement.productId !== line.productId || returnMovement.productId !== line.productId ||
          !originalLine ||
          !Number.isFinite(Number(originalMovement.quantity)) ||
          !Number.isFinite(Number(originalMovement.unitCostBs)) ||
          !Number.isFinite(Number(originalMovement.totalCostBs)) ||
          !Number.isFinite(Number(originalMovement.bcvRate)) ||
          Math.abs(Number(originalMovement.quantity) - Number(originalLine.quantity)) > 0.000001 ||
          Math.abs(Number(originalMovement.unitCostBs) - Number(originalLine.unitCostBs)) > 0.02 ||
          Math.abs(Number(originalMovement.totalCostBs) - Number(originalLine.quantity) * Number(originalLine.unitCostBs)) > 0.02 ||
          originalMovement.date !== original.invoiceDate ||
          Math.abs(Number(originalMovement.bcvRate) - Number(original.bcvRate)) > 0.000001 ||
          normalizeRif(originalMovement.counterpartyRif) !== normalizeRif(original.supplierRif) ||
          returnMovement.type !== 'SALIDA' || returnMovement.concept !== 'DEVOLUCION_COMPRA' ||
          returnMovement.date !== note.invoiceDate ||
          returnMovement.correctionForMovementId !== originalMovement.id ||
          normalizeDocument(returnMovement.documentRef) !== normalizeDocument('NC-PROV-' + note.creditNoteNumber) ||
          returnMovement.journalEntryId !== journal.id ||
          Math.abs(Number(returnMovement.quantity) - Number(line.quantity)) > 0.000001 ||
          Math.abs(Number(returnMovement.unitCostBs) - Number(line.unitCostBs)) > 0.02 ||
          Math.abs(Number(returnMovement.totalCostBs) - Number(line.inventoryCostBs)) > 0.02 ||
          Math.abs(Number(returnMovement.totalCostUsd) - Number(line.inventoryCostBs) / Number(note.bcvRate)) > 0.0001 ||
          normalizeRif(returnMovement.counterpartyRif) !== normalizeRif(original.supplierRif) ||
          !originalLine || !product ||
          !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 ||
          !Number.isFinite(Number(line.unitCostBs)) || Number(line.unitCostBs) <= 0 ||
          !Number.isFinite(Number(line.inventoryCostBs)) || Number(line.inventoryCostBs) <= 0 ||
          !Number.isFinite(Number(returnMovement.quantity)) ||
          !Number.isFinite(Number(returnMovement.unitCostBs)) ||
          !Number.isFinite(Number(returnMovement.totalCostBs)) ||
          !Number.isFinite(Number(returnMovement.totalCostUsd)) ||
          !Number.isFinite(Number(returnMovement.bcvRate)) ||
          Math.abs(Number(line.unitCostBs) - Number(originalLine.unitCostBs)) > 0.02 ||
          Math.abs(Number(line.inventoryCostBs) - Number(line.quantity) * Number(line.unitCostBs)) > 0.02) {
        throw new Error('SQLite rechazó una línea de nota de crédito: la salida física no concilia con la entrada original y el asiento enlazado.');
      }
      journalMovementIds.add(String(returnMovement.id));
      sourceMovementIds.add(String(line.originalMovementId));
      totalInventoryCost += Number(line.inventoryCostBs);
      const allReturned = asArray(nextState.purchases).filter(item => item.companyId === original.companyId && item.originalPurchaseId === original.id)
        .flatMap(item => Array.isArray(item.creditNoteLines) ? item.creditNoteLines : [])
        .filter(item => item.productId === line.productId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      if (allReturned > Number(originalLine.quantity) + 0.000001) {
        throw new Error('SQLite rechazó la nota de crédito: las devoluciones acumuladas superan la cantidad facturada.');
      }
      const priorProduct = asArray(priorState.products).find(item => item.id === line.productId && item.companyId === note.companyId);
      const nextProduct = asArray(nextState.products).find(item => item.id === line.productId && item.companyId === note.companyId);
      const allNewReturnsForProduct = newSupplierReturns.filter(item => item.companyId === note.companyId && item.productId === line.productId)
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
    const allowedCreditNoteAccounts = new Set([
      ...inventoryByAccount.keys(), sourcePayableAccountCode, '1.1.2.03',
      '1.1.3.01', '2.1.2.03', '2.1.2.04', '6.1.1.11'
    ]);
    const journalLinesValid = journal.items.length > 0 && journal.items.every(item => {
      const values = [item.debitBs, item.creditBs, item.debitUsd, item.creditUsd]
        .map(value => Number(value ?? 0));
      return allowedCreditNoteAccounts.has(String(item.accountCode || '')) &&
        values.every(value => Number.isFinite(value) && value >= 0) &&
        !(values[0] > 0 && values[1] > 0) &&
        !(values[2] > 0 && values[3] > 0);
    });
    if (!journalLinesValid ||
        Math.abs(debitsBs - creditsBs) > 0.02 || Math.abs(debitsUsd - creditsUsd) > 0.0001 ||
        Math.abs(totalInventoryCost - Number(note.taxableBaseBs) - Number(note.exemptAmountBs)) > 0.02 ||
        Math.abs(accountSum(sourcePayableAccountCode, 'debit', 'Bs') - Number(note.netPayableReductionBs)) > 0.02 ||
        Math.abs(accountSum(sourcePayableAccountCode, 'debit', 'Usd') - Number(note.netPayableReductionUsd)) > 0.0001 ||
        accountSum(sourcePayableAccountCode, 'credit', 'Bs') > 0.02 || accountSum(sourcePayableAccountCode, 'credit', 'Usd') > 0.0001 ||
        Math.abs(accountSum('1.1.2.03', 'debit', 'Bs') - Number(note.supplierAdvanceBs || 0)) > 0.02 ||
        Math.abs(accountSum('1.1.2.03', 'debit', 'Usd') - Number(note.supplierAdvanceUsd || 0)) > 0.0001 ||
        accountSum('1.1.2.03', 'credit', 'Bs') > 0.02 || accountSum('1.1.2.03', 'credit', 'Usd') > 0.0001 ||
        !inventoryAccountsMatch ||
        [...inventoryByAccount.keys()].some(code => accountSum(code, 'debit', 'Bs') > 0.02 || accountSum(code, 'debit', 'Usd') > 0.0001) ||
        Math.abs(accountSum('1.1.3.01', 'credit', 'Bs') - Number(note.vatAmountBs || 0)) > 0.02 ||
        Math.abs(accountSum('1.1.3.01', 'credit', 'Usd') - Number(note.vatAmountUsd || 0)) > 0.0001 ||
        accountSum('1.1.3.01', 'debit', 'Bs') > 0.02 || accountSum('1.1.3.01', 'debit', 'Usd') > 0.0001 ||
        Math.abs(accountSum('2.1.2.03', 'debit', 'Bs') - Number(note.vatWithheldBs || 0)) > 0.02 ||
        Math.abs(accountSum('2.1.2.03', 'debit', 'Usd') - Number(note.vatWithheldUsd || 0)) > 0.0001 ||
        accountSum('2.1.2.03', 'credit', 'Bs') > 0.02 || accountSum('2.1.2.03', 'credit', 'Usd') > 0.0001 ||
        Math.abs(accountSum('2.1.2.04', 'debit', 'Bs') - Number(note.islrWithheldBs || 0)) > 0.02 ||
        Math.abs(accountSum('2.1.2.04', 'debit', 'Usd') - Number(note.islrWithheldUsd || 0)) > 0.0001 ||
        accountSum('2.1.2.04', 'credit', 'Bs') > 0.02 || accountSum('2.1.2.04', 'credit', 'Usd') > 0.0001 ||
        Math.abs(accountSum('6.1.1.11', 'credit', 'Bs') - Number(note.igtfAmountBs || 0)) > 0.02 ||
        Math.abs(accountSum('6.1.1.11', 'credit', 'Usd') - Number(note.igtfAmountUsd || 0)) > 0.0001 ||
        accountSum('6.1.1.11', 'debit', 'Bs') > 0.02 || accountSum('6.1.1.11', 'debit', 'Usd') > 0.0001 ||
        Math.abs(Number(note.totalAmountBs) - Number(note.taxableBaseBs) - Number(note.exemptAmountBs) - Number(note.vatAmountBs) - Number(note.igtfAmountBs || 0)) > 0.02 ||
        Math.abs(Number(note.netPayableReductionBs) + Number(note.supplierAdvanceBs || 0) -
           (Number(note.totalAmountBs) - Number(note.vatWithheldBs || 0) - Number(note.islrWithheldBs || 0))) > 0.02 ||
         Math.abs(Number(note.netPayableReductionUsd) + Number(note.supplierAdvanceUsd || 0) -
           (Number(note.totalAmountUsd) - Number(note.vatWithheldUsd || 0) - Number(note.islrWithheldUsd || 0))) > 0.0001) {
      throw new Error('SQLite rechazó la nota de crédito: el asiento no está balanceado o no revierte CxP, inventario, IVA, retenciones e IGTF.');
    }
    const paid = asArray(nextState.creditSettlements).filter(item =>
      item.companyId === original.companyId && item.documentId === original.id &&
      item.kind === 'PURCHASE_PAYMENT' && !item.isReversed)
      .reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
    const credited = asArray(nextState.purchases).filter(item => item.companyId === original.companyId && item.originalPurchaseId === original.id)
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
  const hasValidFiscalCorrection = (purchase, correction) => {
    if (!purchase || !correction) return false;
    const source = purchase.journalEntryId ? priorById.get(String(purchase.journalEntryId)) : undefined;
    const fullReversal = Boolean(purchase.isCancelled && source && correction.reversalOfEntryId === source.id);
    const supplierCreditNote = asArray(nextState.purchases).find(note =>
      note.companyId === purchase.companyId && note.documentType === '03' &&
      note.originalPurchaseId === purchase.id && note.journalEntryId === correction.id &&
      normalizeDocument(correction.referenceDoc) === normalizeDocument('NC-PROV-' + note.creditNoteNumber) &&
      correction.type === 'AJUSTE' && Array.isArray(note.creditNoteLines) && note.creditNoteLines.length > 0);
    return fullReversal || Boolean(supplierCreditNote);
  };
  for (const voucher of asArray(nextState.vatVouchers)) {
    if (!voucher.requiresFiscalCorrection) continue;
    const purchase = purchaseById.get(String(voucher.purchaseRecordId));
    const correctionIds = Array.isArray(voucher.correctionEntryIds) ? voucher.correctionEntryIds : (voucher.correctionEntryId ? [voucher.correctionEntryId] : []);
    const correctionsValid = correctionIds.length > 0 && correctionIds.every(id => hasValidFiscalCorrection(purchase, nextById.get(String(id))));
    if (!purchase || purchase.companyId !== voucher.companyId || !correctionsValid) {
      throw new Error('SQLite rechazó una marca de corrección de retención IVA sin factura, nota de crédito o contra-asiento conciliados.');
    }
  }
  for (const voucher of asArray(nextState.islrVouchers)) {
    if (!voucher.requiresFiscalCorrection) continue;
    const purchase = asArray(nextState.purchases).find(item =>
      item.companyId === voucher.companyId && item.invoiceNumber === voucher.invoiceNumber &&
      item.supplierRif === voucher.supplierRif && item.documentType === '01');
    const correctionIds = Array.isArray(voucher.correctionEntryIds) ? voucher.correctionEntryIds : (voucher.correctionEntryId ? [voucher.correctionEntryId] : []);
    const correctionsValid = correctionIds.length > 0 && correctionIds.every(id => hasValidFiscalCorrection(purchase, nextById.get(String(id))));
    if (!correctionsValid) {
      throw new Error('SQLite rechazó una marca de corrección de retención ISLR sin factura, nota de crédito o contra-asiento conciliados.');
    }
  }

  // Supplier advance settlements are operational financial records, not free-form metadata.
  const advanceSettlements = asArray(nextState.supplierAdvanceSettlements);
  const advanceIds = new Set();
  const advanceTotals = new Map();
  const advanceAllocationsByNote = new Map();
  const nextBankAccounts = asArray(nextState.bankAccounts);
  for (const settlement of advanceSettlements) {
    const id = String(settlement.id || '');
    if (!id || advanceIds.has(id)) throw new Error('SQLite rechazó identificadores vacíos o duplicados en liquidaciones de anticipos.');
    advanceIds.add(id);
    const companyId = String(settlement.companyId || '');
    const rif = String(settlement.supplierRif || '').trim().toUpperCase();
    const amountUsd = Number(settlement.amountUsd);
    const bookBs = Number(settlement.advanceBookValueBs ?? settlement.amountBs);
    const rate = Number(settlement.bcvRate);
    if (!companyId || !rif || !['REFUND_RECEIVED', 'APPLIED_TO_PURCHASE'].includes(settlement.kind) ||
        !Number.isFinite(amountUsd) || amountUsd <= 0 || !Number.isFinite(bookBs) || bookBs <= 0 ||
        !Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(settlement.date || ''))) {
      throw new Error('SQLite rechazó una liquidación de anticipo con proveedor, fecha, moneda o tasa inválidos.');
    }
    const sources = Array.isArray(settlement.sourceCreditNoteIds) ? settlement.sourceCreditNoteIds : [];
    if (!sources.length || new Set(sources).size !== sources.length) {
      throw new Error('SQLite rechazó una liquidación sin notas de crédito fuente únicas.');
    }
    const allocations = Array.isArray(settlement.sourceCreditNoteAllocations) ? settlement.sourceCreditNoteAllocations : [];
    if (!allocations.length || allocations.length !== sources.length ||
        allocations.some(item => !item || typeof item.creditNoteId !== 'string' ||
          !Number.isFinite(Number(item.amountUsd)) || Number(item.amountUsd) <= 0 ||
          !Number.isFinite(Number(item.bookValueBs)) || Number(item.bookValueBs) < 0) ||
        new Set(allocations.map(item => item.creditNoteId)).size !== allocations.length ||
        allocations.some(item => !sources.includes(item.creditNoteId))) {
      throw new Error('SQLite rechazó una liquidación sin distribución individual válida por nota de crédito.');
    }
    const allocatedUsd = allocations.reduce((sum, item) => sum + Number(item.amountUsd), 0);
    const allocatedBs = allocations.reduce((sum, item) => sum + Number(item.bookValueBs), 0);
    if (Math.abs(allocatedUsd - amountUsd) > 0.01 || Math.abs(allocatedBs - bookBs) > 0.02) {
      throw new Error('SQLite rechazó una distribución individual que no coincide con el importe liquidado.');
    }
    const sourceNotes = allocations.map(allocation => purchaseById.get(String(allocation.creditNoteId)));
    if (sourceNotes.some(note => !note || note.companyId !== companyId || note.documentType !== '03' ||
        note.isCancelled || String(note.supplierRif || '').trim().toUpperCase() !== rif ||
        Number(note.supplierAdvanceUsd || 0) <= 0)) {
      throw new Error('SQLite rechazó una liquidación vinculada a notas de crédito inexistentes, reversadas o de otro proveedor.');
    }
    if (!settlement.isReversed) {
      for (const allocation of allocations) {
        const key = companyId + '|' + allocation.creditNoteId;
        const used = advanceAllocationsByNote.get(key) || { usd: 0, bs: 0 };
        used.usd += Number(allocation.amountUsd);
        used.bs += Number(allocation.bookValueBs);
        advanceAllocationsByNote.set(key, used);
      }
    }
    const journal = nextById.get(String(settlement.journalEntryId || ''));
    if (!journal || journal.companyId !== companyId || journal.type !== 'ANTICIPO_PROVEEDOR' ||
        journal.date !== settlement.date || !Array.isArray(journal.items) || journal.items.length < 2) {
      throw new Error('SQLite rechazó una liquidación sin asiento ANTICIPO_PROVEEDOR válido y enlazado.');
    }
    const totals = journal.items.reduce((acc, item) => ({
      debitBs: acc.debitBs + Number(item.debitBs || 0), creditBs: acc.creditBs + Number(item.creditBs || 0),
      debitUsd: acc.debitUsd + Number(item.debitUsd || 0), creditUsd: acc.creditUsd + Number(item.creditUsd || 0)
    }), { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 });
    const advanceCredit = journal.items.reduce((sum, item) =>
      sum + (item.accountCode === '1.1.2.03' ? Number(item.creditBs || 0) : 0), 0);
    const advanceCreditUsd = journal.items.reduce((sum, item) =>
      sum + (item.accountCode === '1.1.2.03' ? Number(item.creditUsd || 0) : 0), 0);
    if (Math.abs(totals.debitBs - totals.creditBs) >= 0.01 ||
        Math.abs(totals.debitUsd - totals.creditUsd) >= 0.01 ||
        Math.abs(totals.debitUsd - amountUsd) >= 0.01 ||
        Math.abs(totals.creditUsd - amountUsd) >= 0.01 ||
        Math.abs(advanceCredit - bookBs) >= 0.01 ||
        Math.abs(advanceCreditUsd - amountUsd) >= 0.01) {
      throw new Error('SQLite rechazó un asiento de anticipo descuadrado o que no descarga el valor histórico correcto.');
    }
    if (settlement.kind === 'REFUND_RECEIVED') {
      const bank = nextBankAccounts.find(item => item.companyId === companyId && item.accountCode === settlement.treasuryAccountCode);
      const cashReceivedBs = Number(settlement.cashReceivedBs ?? 0);
      const treasuryDebit = journal.items.reduce((sum, item) =>
        sum + (item.accountCode === settlement.treasuryAccountCode ? Number(item.debitBs || 0) : 0), 0);
      const expectedFx = Math.round((cashReceivedBs - bookBs) * 100) / 100;
      const gainBs = journal.items.filter(item => item.accountCode === '4.2.1.01')
        .reduce((sum, item) => sum + Number(item.creditBs || 0) - Number(item.debitBs || 0), 0);
      const lossBs = journal.items.filter(item => item.accountCode === '6.1.1.08')
        .reduce((sum, item) => sum + Number(item.debitBs || 0) - Number(item.creditBs || 0), 0);
      const allowedCodes = new Set([settlement.treasuryAccountCode, '1.1.2.03',
        ...(expectedFx > 0.009 ? ['4.2.1.01'] : expectedFx < -0.009 ? ['6.1.1.08'] : [])]);
      if (!bank || cashReceivedBs <= 0 ||
          Math.abs(treasuryDebit - cashReceivedBs) >= 0.01 ||
          journal.items.some(item => !allowedCodes.has(item.accountCode)) ||
          Math.abs(gainBs - Math.max(0, expectedFx)) >= 0.01 ||
          Math.abs(lossBs - Math.max(0, -expectedFx)) >= 0.01) {
        throw new Error('SQLite rechazó un reembolso de anticipo cuya cuenta de tesorería, efectivo recibido o diferencial cambiario no concilian exactamente.');
      }
    } else {
      const target = purchaseById.get(String(settlement.targetPurchaseId || ''));
      const originalPurchaseJournal = target?.journalEntryId
        ? priorById.get(String(target.journalEntryId))
        : undefined;
      const payableCandidates = originalPurchaseJournal && originalPurchaseJournal.companyId === companyId &&
        originalPurchaseJournal.type === 'COMPRA' && Array.isArray(originalPurchaseJournal.items)
        ? originalPurchaseJournal.items.filter(item =>
            Number(item.creditBs || 0) > 0 &&
            String(item.accountCode || '').startsWith('2.1.1.') &&
            /(proveedor|cuentas por pagar|neto a pagar)/i.test(String(item.description || '')))
        : [];
      const payableCodes = [...new Set(payableCandidates.map(item => String(item.accountCode)))];
      const targetPayableCode = payableCodes.length === 1 ? payableCodes[0] : '';
      const payableDebitBs = targetPayableCode
        ? journal.items.filter(item => item.accountCode === targetPayableCode)
            .reduce((sum, item) => sum + Number(item.debitBs || 0), 0)
        : 0;
      const payableDebitUsd = targetPayableCode
        ? journal.items.filter(item => item.accountCode === targetPayableCode)
            .reduce((sum, item) => sum + Number(item.debitUsd || 0), 0)
        : 0;
      const payableCreditBs = targetPayableCode
        ? journal.items.filter(item => item.accountCode === targetPayableCode)
            .reduce((sum, item) => sum + Number(item.creditBs || 0), 0)
        : 0;
      const payableCreditUsd = targetPayableCode
        ? journal.items.filter(item => item.accountCode === targetPayableCode)
            .reduce((sum, item) => sum + Number(item.creditUsd || 0), 0)
        : 0;
      const invoiceRate = Number(target?.bcvRate) > 0
        ? Number(target.bcvRate)
        : (Number(target?.totalAmountUsd) > 0 ? Number(target.totalAmountBs) / Number(target.totalAmountUsd) : 0);
      const expectedPayableDebitBs = Math.round(amountUsd * invoiceRate * 100) / 100;
      const advanceDebitBs = journal.items.filter(item => item.accountCode === '1.1.2.03')
        .reduce((sum, item) => sum + Number(item.debitBs || 0), 0);
      const advanceDebitUsd = journal.items.filter(item => item.accountCode === '1.1.2.03')
        .reduce((sum, item) => sum + Number(item.debitUsd || 0), 0);
      const expectedFx = Math.round((expectedPayableDebitBs - bookBs) * 100) / 100;
      const gainBs = journal.items.filter(item => item.accountCode === '4.2.1.01')
        .reduce((sum, item) => sum + Number(item.creditBs || 0) - Number(item.debitBs || 0), 0);
      const lossBs = journal.items.filter(item => item.accountCode === '6.1.1.08')
        .reduce((sum, item) => sum + Number(item.debitBs || 0) - Number(item.creditBs || 0), 0);
      const allowedCodes = new Set([targetPayableCode, '1.1.2.03',
        ...(expectedFx > 0.009 ? ['4.2.1.01'] : expectedFx < -0.009 ? ['6.1.1.08'] : [])]);
      if (!target || target.companyId !== companyId || target.documentType !== '01' || target.isCancelled ||
          String(target.supplierRif || '').trim().toUpperCase() !== rif ||
          !targetPayableCode || payableDebitBs <= 0 ||
          Math.abs(payableDebitBs - expectedPayableDebitBs) > 0.02 ||
          Math.abs(payableDebitUsd - amountUsd) > 0.01 ||
          payableCreditBs > 0.02 || payableCreditUsd > 0.0001 ||
          advanceDebitBs > 0.02 || advanceDebitUsd > 0.0001 || !Number.isFinite(invoiceRate) || invoiceRate <= 0 ||
          journal.items.some(item => !allowedCodes.has(item.accountCode)) ||
          Math.abs(gainBs - Math.max(0, expectedFx)) >= 0.01 ||
          Math.abs(lossBs - Math.max(0, -expectedFx)) >= 0.01) {
        throw new Error('SQLite rechazó la aplicación de anticipo: la factura, CxP y el diferencial cambiario no concilian exactamente.');
      }
    }
    if (settlement.isReversed) {
      const reversal = settlement.reversedByJournalEntryId
        ? nextById.get(String(settlement.reversedByJournalEntryId))
        : undefined;
      if (!reversal || reversal.companyId !== companyId || reversal.reversalOfEntryId !== journal.id) {
        throw new Error('SQLite rechazó la reversión de anticipo sin contra-asiento vinculado.');
      }
    }
    if (!settlement.isReversed) {
      const key = companyId + '|' + rif;
      const current = advanceTotals.get(key) || { usd: 0, bs: 0 };
      current.usd += amountUsd;
      current.bs += bookBs;
      advanceTotals.set(key, current);
    }
  }
  for (const [key, used] of advanceTotals) {
    const [companyId, rif] = key.split('|');
    const credits = asArray(nextState.purchases).filter(item =>
      item.companyId === companyId && item.documentType === '03' && !item.isCancelled &&
      String(item.supplierRif || '').trim().toUpperCase() === rif);
    const availableUsd = credits.reduce((sum, item) => sum + Number(item.supplierAdvanceUsd || 0), 0);
    const availableBs = credits.reduce((sum, item) => sum + Number(item.supplierAdvanceBs || 0), 0);
    if (used.usd > availableUsd + 0.005 || used.bs > availableBs + 0.02) {
      throw new Error('SQLite rechazó liquidaciones de anticipos que exceden el saldo acreditado por notas de crédito.');
    }
  }
  for (const [key, used] of advanceAllocationsByNote) {
    const [companyId, noteId] = key.split('|');
    const note = purchaseById.get(noteId);
    if (!note || used.usd > Number(note.supplierAdvanceUsd || 0) + 0.005 ||
        used.bs > Number(note.supplierAdvanceBs || 0) + 0.02) {
      throw new Error('SQLite rechazó liquidaciones que exceden el saldo individual de una nota de crédito.');
    }
  }

  return { priorEntries, nextEntries, priorById, nextById };
}

module.exports = { validateAccountingSnapshot };
