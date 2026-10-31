import type { Account, AccountType } from './accounting';

const ROOT_ACCOUNT_TYPES: Record<string, AccountType> = {
  '1': 'ACTIVO',
  '2': 'PASIVO',
  '3': 'PATRIMONIO',
  '4': 'INGRESOS',
  '5': 'COSTOS',
  '6': 'GASTOS'
};

/**
 * Validates a new account and resolves its nearest existing hierarchical parent.
 * Existing catalogs may intentionally skip intermediate code levels, so the
 * parent is the longest existing numeric prefix, not necessarily the previous
 * textual segment.
 */
export function prepareAccountForCatalog(account: Account, existing: Account[]): Account {
  const code = String(account.code || '').trim();
  const name = String(account.name || '').trim();
  if (!/^\d+(?:\.\d+){0,4}$/.test(code)) {
    throw new Error('El código debe contener entre uno y cinco niveles numéricos separados por puntos.');
  }
  if (!name) throw new Error('Indique la denominación de la cuenta.');
  if (!Object.prototype.hasOwnProperty.call(ROOT_ACCOUNT_TYPES, code.split('.')[0])) {
    throw new Error('El primer nivel debe comenzar por una clasificación contable válida (1 a 6).');
  }
  if (existing.some(item => item.code === code)) {
    throw new Error('Ya existe una cuenta con ese código. No se reemplazó ni modificó la cuenta existente.');
  }
  if (existing.some(item => item.code.startsWith(code + '.'))) {
    throw new Error('El código ya tiene subcuentas registradas. No se puede insertar un nivel intermedio sin una reclasificación controlada.');
  }

  const segments = code.split('.');
  const level = segments.length;
  if (level > 5) throw new Error('El plan de cuentas admite hasta cinco niveles.');
  const expectedType = ROOT_ACCOUNT_TYPES[segments[0]];
  if (account.type !== expectedType) {
    throw new Error('La clasificación no coincide con el primer dígito del código contable.');
  }

  if (level === 1) {
    return { ...account, code, name: name.toUpperCase(), level, parentCode: undefined };
  }

  const candidates = existing
    .filter(item => code.startsWith(item.code + '.') && item.level < level)
    .sort((a, b) => b.code.length - a.code.length);
  const parent = candidates[0];
  if (!parent) {
    throw new Error('No existe una cuenta agrupadora superior para este código. Cree primero su cuenta padre.');
  }
  if (parent.isMovement) {
    throw new Error('La cuenta superior es imputable y no puede contener subcuentas. Seleccione otra estructura.');
  }
  if (parent.type !== account.type || parent.type !== expectedType) {
    throw new Error('La cuenta nueva debe conservar la clasificación contable de su cuenta superior.');
  }

  return {
    ...account,
    code,
    name: name.toUpperCase(),
    level,
    parentCode: parent.code
  };
}
