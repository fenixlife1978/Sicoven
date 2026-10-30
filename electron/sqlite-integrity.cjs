function assertSqliteIntegrity(db) {
  if (!db || typeof db.pragma !== 'function') {
    throw new TypeError('Se requiere una conexión SQLite válida para comprobar la integridad.');
  }

  const quickCheck = db.pragma('quick_check');
  const quickErrors = Array.isArray(quickCheck)
    ? quickCheck.map(row => String(row.quick_check ?? Object.values(row)[0] ?? '')).filter(value => value !== 'ok')
    : ['SQLite no devolvió un resultado válido para quick_check'];
  if (quickErrors.length > 0) {
    throw new Error(`La base SQLite no superó PRAGMA quick_check: ${quickErrors.join('; ')}. Se bloqueó el inicio para proteger los datos. No se modificó ni se reemplazó la base.`);
  }

  const foreignKeyErrors = db.pragma('foreign_key_check');
  if (!Array.isArray(foreignKeyErrors) || foreignKeyErrors.length > 0) {
    const detail = Array.isArray(foreignKeyErrors)
      ? foreignKeyErrors.map(row => JSON.stringify(row)).join('; ')
      : 'SQLite no devolvió un resultado válido para foreign_key_check';
    throw new Error(`La base SQLite contiene relaciones foráneas inconsistentes: ${detail}. Se bloqueó el inicio para proteger los datos. No se modificó ni se reemplazó la base.`);
  }

  return { ok: true, quickCheck: 'ok', foreignKeyViolations: 0 };
}

module.exports = { assertSqliteIntegrity };
