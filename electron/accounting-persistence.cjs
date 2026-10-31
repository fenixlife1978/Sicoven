const crypto = require('node:crypto');
const { validateAccountingSnapshot } = require('./accounting-integrity.cjs');

function persistAccountingSnapshot(db, state, actor = null) {
  const json = JSON.stringify(state);
  if (json.length > 50 * 1024 * 1024) throw new Error('El respaldo supera el límite permitido');
  const save = db.transaction(() => {
    const priorRow = db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get();
    let priorState = {};
    if (priorRow) {
      try { priorState = JSON.parse(priorRow.state_json) || {}; }
      catch { throw new Error('La base SQLite contiene un estado contable ilegible; se bloqueó la escritura para proteger el historial.'); }
    }
    const { nextEntries, priorById } = validateAccountingSnapshot(priorState, state);
    const auditInsert = db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)');
    for (const entry of nextEntries) {
      if (priorById.has(String(entry.id))) continue;
      const totals = entry.items.reduce((sum, item) => ({
        debitBs: sum.debitBs + Number(item.debitBs || 0),
        creditBs: sum.creditBs + Number(item.creditBs || 0),
        debitUsd: sum.debitUsd + Number(item.debitUsd || 0),
        creditUsd: sum.creditUsd + Number(item.creditUsd || 0)
      }), { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 });
      if (entry.type === 'APERTURA' && String(entry.referenceDoc || '').startsWith('APERTURA:')) {
        const link = entry.exerciseLink;
        const validDate = value => {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const parsed = new Date(value + 'T00:00:00.000Z');
          return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
        };
        if (!link || !validDate(link.priorPeriodStartDate) || !validDate(link.priorPeriodEndDate) ||
            !validDate(link.nextPeriodStartDate) || link.priorPeriodStartDate > link.priorPeriodEndDate) {
          throw new Error('La apertura del ejercicio requiere un vínculo válido con el período anterior.');
        }
        const nextDay = new Date(link.priorPeriodEndDate + 'T00:00:00.000Z');
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const expectedNextStart = nextDay.toISOString().slice(0, 10);
        if (link.nextPeriodStartDate !== expectedNextStart || entry.date !== expectedNextStart) {
          throw new Error('La apertura debe iniciar exactamente el día siguiente al cierre del ejercicio anterior.');
        }
        const company = (Array.isArray(state.companies) ? state.companies : [])
          .find(item => String(item.id) === String(entry.companyId));
        if (!company || String(company.closedThroughDate || '') !== link.priorPeriodEndDate) {
          throw new Error('El ejercicio anterior debe permanecer cerrado hasta su fecha final para vincular la apertura.');
        }
        const duplicate = (Array.isArray(state.journalEntries) ? state.journalEntries : []).some(item =>
          String(item.id) !== String(entry.id) && String(item.companyId) === String(entry.companyId) &&
          item.type === 'APERTURA' && item.exerciseLink &&
          item.exerciseLink.priorPeriodStartDate === link.priorPeriodStartDate &&
          item.exerciseLink.priorPeriodEndDate === link.priorPeriodEndDate &&
          item.exerciseLink.nextPeriodStartDate === link.nextPeriodStartDate);
        if (duplicate) throw new Error('Ya existe una apertura vinculada a este ejercicio anterior y no se permite duplicarla.');
        db.prepare(`INSERT INTO accounting_exercise_links
          (id,company_id,prior_period_start_date,prior_period_end_date,next_period_start_date,journal_entry_id)
          VALUES(?,?,?,?,?,?)`)
          .run(crypto.randomUUID(), String(entry.companyId), link.priorPeriodStartDate,
            link.priorPeriodEndDate, link.nextPeriodStartDate, String(entry.id));
        auditInsert.run('accounting_exercise_opening_linked', JSON.stringify({
          companyId: entry.companyId, journalEntryId: entry.id,
          priorPeriodStartDate: link.priorPeriodStartDate,
          priorPeriodEndDate: link.priorPeriodEndDate,
          nextPeriodStartDate: link.nextPeriodStartDate,
          actor: actor ? { userId: actor.id ?? null, username: actor.username || null } : null
        }));
      }
      auditInsert.run(entry.reversalOfEntryId ? 'journal_entry_reversed' : 'journal_entry_posted', JSON.stringify({
        entryId: entry.id, companyId: entry.companyId, entryNumber: entry.entryNumber,
        date: entry.date, type: entry.type, referenceDoc: entry.referenceDoc || null,
        description: entry.description, reversalOfEntryId: entry.reversalOfEntryId || null,
        reversalReason: entry.reversalReason || null, workpaperNote: entry.workpaperNote || null,
        priorPeriodAdjustment: Boolean(entry.priorPeriodAdjustment), totals
      }));
      if (entry.type === 'APERTURA') {
        auditInsert.run('accounting_year_opening_posted', JSON.stringify({
          entryId: entry.id, companyId: entry.companyId, entryNumber: entry.entryNumber,
          openingDate: entry.date, referenceDoc: entry.referenceDoc || null,
          description: entry.description,
          actor: actor ? { userId: actor.id ?? null, username: actor.username || null } : null,
          totals
        }));
      }
    }
    for (const collectionName of ['purchases', 'sales']) {
      const oldDocuments = new Map((Array.isArray(priorState[collectionName]) ? priorState[collectionName] : [])
        .map(document => [String(document.id), document]));
      for (const document of (Array.isArray(state[collectionName]) ? state[collectionName] : [])) {
        const oldDocument = oldDocuments.get(String(document.id));
        if (oldDocument && !oldDocument.isCancelled && document.isCancelled) {
          auditInsert.run('fiscal_document_reversal_marked', JSON.stringify({
            collection: collectionName, documentId: document.id, companyId: document.companyId,
            invoiceNumber: document.invoiceNumber, documentType: document.documentType,
            cancelledByJournalEntryId: document.cancelledByJournalEntryId || null,
            cancellationReason: document.cancellationReason || null,
            cancellationNote: document.cancellationNote || null
          }));
        }
      }
    }
    const oldPurchaseIds = new Set((Array.isArray(priorState.purchases) ? priorState.purchases : [])
      .map(document => String(document.id)));
    for (const note of (Array.isArray(state.purchases) ? state.purchases : [])) {
      if (oldPurchaseIds.has(String(note.id)) || note.documentType !== '03') continue;
      auditInsert.run('supplier_credit_note_posted', JSON.stringify({
        documentId: note.id, companyId: note.companyId,
        creditNoteNumber: note.creditNoteNumber || note.invoiceNumber,
        controlNumber: note.controlNumber, invoiceDate: note.invoiceDate,
        supplierRif: note.supplierRif, supplierName: note.supplierName,
        originalPurchaseId: note.originalPurchaseId || null,
        affectedInvoiceNumber: note.affectedInvoiceNumber || null,
        journalEntryId: note.journalEntryId || null,
        netPayableReductionBs: note.netPayableReductionBs || 0,
        netPayableReductionUsd: note.netPayableReductionUsd || 0,
        creditNoteLines: Array.isArray(note.creditNoteLines) ? note.creditNoteLines : []
      }));
    }
    const oldInventoryMovements = new Map((Array.isArray(priorState.movements) ? priorState.movements : [])
      .map(item => [String(item.id), item]));
    for (const movement of (Array.isArray(state.movements) ? state.movements : [])) {
      if (oldInventoryMovements.has(String(movement.id))) continue;
      auditInsert.run(movement.correctionForMovementId ? 'inventory_correction_posted' : 'inventory_movement_posted', JSON.stringify({
        movementId: movement.id, companyId: movement.companyId, productId: movement.productId,
        productCode: movement.productCode, productName: movement.productName, date: movement.date,
        type: movement.type, concept: movement.concept, documentRef: movement.documentRef,
        quantity: movement.quantity, totalCostBs: movement.totalCostBs, totalCostUsd: movement.totalCostUsd,
        journalEntryId: movement.journalEntryId || null,
        correctionForMovementId: movement.correctionForMovementId || null
      }));
    }
    const oldBankRows = new Map((Array.isArray(priorState.bankStatementMovements) ? priorState.bankStatementMovements : [])
      .map(item => [String(item.id), item]));
    for (const row of (Array.isArray(state.bankStatementMovements) ? state.bankStatementMovements : [])) {
      const oldRow = oldBankRows.get(String(row.id));
      if (!oldRow) continue;
      if (oldRow.isReconciled && !row.isReconciled) {
        auditInsert.run('bank_statement_unreconciled', JSON.stringify({
          statementMovementId: row.id, companyId: row.companyId, bankAccountId: row.bankAccountId,
          previousJournalEntryId: oldRow.reconciledWithJournalEntryId || null,
          reconciliationHistory: oldRow.reconciledJournalEntryIds || [],
          reference: row.reference, date: row.date, amountBs: row.amountBs, amountUsd: row.amountUsd
        }));
      }
      const oldLinks = Array.isArray(oldRow.reconciledJournalEntryIds) ? oldRow.reconciledJournalEntryIds : [];
      const nextLinks = Array.isArray(row.reconciledJournalEntryIds) ? row.reconciledJournalEntryIds : [];
      for (const journalEntryId of nextLinks) {
        if (oldLinks.includes(journalEntryId)) continue;
        auditInsert.run('bank_statement_reconciled', JSON.stringify({
          statementMovementId: row.id, companyId: row.companyId, bankAccountId: row.bankAccountId,
          journalEntryId, reference: row.reference, date: row.date, amountBs: row.amountBs,
          amountUsd: row.amountUsd, matchedBy: row.matchedBy || null
        }));
      }
    }
    const oldSettlements = new Map((Array.isArray(priorState.creditSettlements) ? priorState.creditSettlements : [])
      .map(item => [String(item.id), item]));
    for (const settlement of (Array.isArray(state.creditSettlements) ? state.creditSettlements : [])) {
      const oldSettlement = oldSettlements.get(String(settlement.id));
      if (oldSettlement && !oldSettlement.isReversed && settlement.isReversed) {
        auditInsert.run('credit_settlement_reversed', JSON.stringify({
          settlementId: settlement.id, companyId: settlement.companyId,
          documentId: settlement.documentId, journalEntryId: settlement.journalEntryId,
          reversedByJournalEntryId: settlement.reversedByJournalEntryId || null
        }));
      }
    }
    const oldDirectAdvances = new Map((Array.isArray(priorState.supplierDirectAdvances) ? priorState.supplierDirectAdvances : [])
      .map(item => [String(item.id), item]));
    for (const advance of (Array.isArray(state.supplierDirectAdvances) ? state.supplierDirectAdvances : [])) {
      const oldAdvance = oldDirectAdvances.get(String(advance.id));
      if (!oldAdvance) {
        auditInsert.run('supplier_direct_advance_posted', JSON.stringify({
          directAdvanceId: advance.id, companyId: advance.companyId,
          supplierRif: advance.supplierRif, supplierName: advance.supplierName,
          date: advance.date, amountUsd: advance.amountUsd, bookValueBs: advance.bookValueBs,
          paymentCurrency: advance.paymentCurrency, paidAmount: advance.paidAmount,
          treasuryAccountCode: advance.treasuryAccountCode,
          reference: advance.reference, support: advance.support,
          journalEntryId: advance.journalEntryId
        }));
      } else if (!oldAdvance.isReversed && advance.isReversed) {
        auditInsert.run('supplier_direct_advance_reversed', JSON.stringify({
          directAdvanceId: advance.id, companyId: advance.companyId,
          journalEntryId: advance.journalEntryId,
          reversedByJournalEntryId: advance.reversedByJournalEntryId || null
        }));
      }
    }
    const oldAdvanceSettlements = new Map((Array.isArray(priorState.supplierAdvanceSettlements) ? priorState.supplierAdvanceSettlements : []).map(item => [String(item.id), item]));
    for (const settlement of (Array.isArray(state.supplierAdvanceSettlements) ? state.supplierAdvanceSettlements : [])) {
      const oldSettlement = oldAdvanceSettlements.get(String(settlement.id));
      if (!oldSettlement) {
        auditInsert.run('supplier_advance_settlement_posted', JSON.stringify({
          settlementId: settlement.id, companyId: settlement.companyId, supplierRif: settlement.supplierRif,
          kind: settlement.kind, amountBs: settlement.amountBs, amountUsd: settlement.amountUsd,
          journalEntryId: settlement.journalEntryId, targetPurchaseId: settlement.targetPurchaseId || null,
          sourceCreditNoteIds: settlement.sourceCreditNoteIds || [],
          sourceCreditNoteAllocations: settlement.sourceCreditNoteAllocations || [],
          sourceDirectAdvanceIds: settlement.sourceDirectAdvanceIds || [],
          sourceDirectAdvanceAllocations: settlement.sourceDirectAdvanceAllocations || []
        }));
      } else if (!oldSettlement.isReversed && settlement.isReversed) {
        auditInsert.run('supplier_advance_settlement_reversed', JSON.stringify({
          settlementId: settlement.id, companyId: settlement.companyId,
          journalEntryId: settlement.journalEntryId, reversedByJournalEntryId: settlement.reversedByJournalEntryId || null
        }));
      }
    }
    const oldCompanies = new Map((Array.isArray(priorState.companies) ? priorState.companies : []).map(company => [String(company.id), company]));
    for (const company of (Array.isArray(state.companies) ? state.companies : [])) {
      const oldCompany = oldCompanies.get(String(company.id));
      if (company.closedThroughDate && company.closedThroughDate !== oldCompany?.closedThroughDate) {
        auditInsert.run('accounting_period_closed', JSON.stringify({
          companyId: company.id, companyName: company.name,
          previousClosedThroughDate: oldCompany?.closedThroughDate || null,
          closedThroughDate: company.closedThroughDate
        }));
      }
    }
    db.prepare(`INSERT INTO app_state(state_key,state_json,updated_at) VALUES(?,?,datetime('now'))
      ON CONFLICT(state_key) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at`)
      .run('accounting', json);
    auditInsert.run('state_saved', JSON.stringify({ bytes: Buffer.byteLength(json) }));
  });
  save();
  return { ok: true, savedAt: new Date().toISOString() };
}

function registerAccountingPersistenceHandler({ ipcMain, db, licenseView, getActiveSession }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function' ||
      typeof licenseView !== 'function' || typeof getActiveSession !== 'function') {
    throw new Error('No se pudo registrar el puente de persistencia contable de SICOVEN.');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounting_exercise_links (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      prior_period_start_date TEXT NOT NULL,
      prior_period_end_date TEXT NOT NULL,
      next_period_start_date TEXT NOT NULL,
      journal_entry_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, prior_period_start_date, prior_period_end_date, next_period_start_date)
    );
    CREATE TRIGGER IF NOT EXISTS accounting_exercise_links_no_update
      BEFORE UPDATE ON accounting_exercise_links
      BEGIN SELECT RAISE(ABORT, 'accounting_exercise_links is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS accounting_exercise_links_no_delete
      BEFORE DELETE ON accounting_exercise_links
      BEGIN SELECT RAISE(ABORT, 'accounting_exercise_links is append-only'); END;
    CREATE TABLE IF NOT EXISTS period_reopenings (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      previous_closed_through_date TEXT NOT NULL,
      reopened_through_date TEXT,
      reason TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL,
      actor_username TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS period_reopenings_no_update
      BEFORE UPDATE ON period_reopenings
      BEGIN SELECT RAISE(ABORT, 'period_reopenings is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS period_reopenings_no_delete
      BEFORE DELETE ON period_reopenings
      BEGIN SELECT RAISE(ABORT, 'period_reopenings is append-only'); END;
  `);
  ipcMain.handle('sicoven:reopen-accounting-period', (_event, token, input) => {
    const licensing = licenseView();
    if (!licensing.authorized) throw new Error(licensing.message || 'Licencia no autorizada.');
    const actor = getActiveSession(token);
    if (!actor) throw new Error('Sesión no válida. Inicie sesión para reabrir un período.');
    if (actor.role !== 'admin') throw new Error('Permiso insuficiente: solo un administrador puede reabrir períodos contables.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Solicitud de reapertura inválida.');
    const companyId = String(input.companyId || '').trim();
    const reason = String(input.reason || '').trim();
    const reopenedThroughDate = input.reopenedThroughDate === null || input.reopenedThroughDate === ''
      ? null : String(input.reopenedThroughDate);
    if (!companyId) throw new Error('Seleccione una empresa para reabrir el período.');
    if (reason.length < 10 || reason.length > 1000) throw new Error('El motivo de reapertura es obligatorio y debe tener entre 10 y 1000 caracteres.');
    if (reopenedThroughDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(reopenedThroughDate)) {
      throw new Error('La nueva fecha de cierre debe ser una fecha ISO válida o quedar vacía para reabrir todo el período.');
    }
    if (reopenedThroughDate !== null) {
      const parsed = new Date(reopenedThroughDate + 'T00:00:00.000Z');
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== reopenedThroughDate) {
        throw new Error('La nueva fecha de cierre no existe en el calendario.');
      }
    }
    const reopen = db.transaction(() => {
      const row = db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get();
      if (!row) throw new Error('No existe un estado contable persistido para reabrir.');
      let state;
      try { state = JSON.parse(row.state_json); }
      catch { throw new Error('El estado contable SQLite es ilegible; se bloqueó la reapertura para proteger el historial.'); }
      if (!state || !Array.isArray(state.companies)) throw new Error('El estado contable no contiene empresas válidas.');
      const company = state.companies.find(item => String(item.id) === companyId);
      if (!company) throw new Error('La empresa seleccionada no existe en SQLite.');
      const previousClosedThroughDate = String(company.closedThroughDate || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(previousClosedThroughDate)) {
        throw new Error('La empresa no tiene un cierre contable vigente para reabrir.');
      }
      if (reopenedThroughDate !== null && reopenedThroughDate >= previousClosedThroughDate) {
        throw new Error('La nueva fecha debe ser anterior al cierre vigente para que exista una reapertura efectiva.');
      }
      if (reopenedThroughDate === null && !previousClosedThroughDate) {
        throw new Error('No existe un período cerrado que pueda reabrirse.');
      }
      const reopeningId = crypto.randomUUID();
      const nextState = {
        ...state,
        companies: state.companies.map(item => String(item.id) === companyId
          ? { ...item, ...(reopenedThroughDate ? { closedThroughDate: reopenedThroughDate } : { closedThroughDate: undefined }) }
          : item)
      };
      const json = JSON.stringify(nextState);
      if (json.length > 50 * 1024 * 1024) throw new Error('El estado contable supera el límite permitido.');
      db.prepare("UPDATE app_state SET state_json=?, updated_at=datetime('now') WHERE state_key='accounting'").run(json);
      const details = {
        reopeningId, companyId, companyName: String(company.name || ''),
        previousClosedThroughDate, reopenedThroughDate,
        reason, actor: { userId: actor.id, username: actor.username }
      };
      db.prepare(`INSERT INTO period_reopenings
        (id,company_id,company_name,previous_closed_through_date,reopened_through_date,reason,actor_user_id,actor_username)
        VALUES(?,?,?,?,?,?,?,?)`)
        .run(reopeningId, companyId, String(company.name || ''), previousClosedThroughDate,
          reopenedThroughDate, reason, Number(actor.id), String(actor.username || ''));
      db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)')
        .run('accounting_period_reopened', JSON.stringify(details));
      return { ok: true, company: nextState.companies.find(item => String(item.id) === companyId), reopeningId };
    });
    return reopen();
  });
  ipcMain.handle('sicoven:save-state', (_event, token, state) => {
    const licensing = licenseView();
    if (!licensing.authorized) throw new Error(licensing.message || 'Licencia no autorizada.');
    const actor = getActiveSession(token);
    if (!actor) throw new Error('Sesión no válida. Inicie sesión para guardar datos contables.');
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Estado contable inválido');
    return persistAccountingSnapshot(db, state, actor);
  });
}

module.exports = { persistAccountingSnapshot, registerAccountingPersistenceHandler };
