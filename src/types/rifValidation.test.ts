import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVenezuelanRif,
  isValidVenezuelanRif,
  VALID_RIF_PREFIXES,
} from '../utils/formatters';

test('validación de estructura legal de RIF venezolano', async (t) => {
  await t.test('acepta prefijos legales V, J, G, E, P con guiones estándar (9 dígitos)', () => {
    const validRifs = [
      'V-13313521-5',
      'J-12345678-9',
      'G-20000000-1',
      'E-81234567-0',
      'P-12345678-9',
    ];

    for (const r of validRifs) {
      const res = validateVenezuelanRif(r);
      assert.equal(res.isValid, true, `Debería ser válido: ${r}`);
      assert.equal(res.error, null);
      assert.equal(res.formattedRif, r);
      assert.equal(isValidVenezuelanRif(r), true);
    }
  });

  await t.test('acepta y formatea RIFs sin guiones y en minúsculas', () => {
    const unformatted = [
      { input: 'j123456789', expected: 'J-12345678-9' },
      { input: 'v133135215', expected: 'V-13313521-5' },
      { input: 'g200000001', expected: 'G-20000000-1' },
      { input: 'e812345670', expected: 'E-81234567-0' },
      { input: 'p123456789', expected: 'P-12345678-9' },
    ];

    for (const item of unformatted) {
      const res = validateVenezuelanRif(item.input);
      assert.equal(res.isValid, true, `Debería ser válido: ${item.input}`);
      assert.equal(res.formattedRif, item.expected);
      assert.equal(isValidVenezuelanRif(item.input), true);
    }
  });

  await t.test('acepta RIFs de 8 dígitos numéricos (cédulas de 7 dígitos + dígito verificador)', () => {
    const res = validateVenezuelanRif('V-1234567-8');
    assert.equal(res.isValid, true);
    assert.equal(res.formattedRif, 'V-1234567-8');

    const resRaw = validateVenezuelanRif('v12345678');
    assert.equal(resRaw.isValid, true);
    assert.equal(resRaw.formattedRif, 'V-1234567-8');
  });

  await t.test('rechaza prefijos que no corresponden a la estructura legal venezolana (V, J, G, E, P)', () => {
    const invalidPrefixes = [
      'X-12345678-9',
      'A-12345678-9',
      'B-12345678-9',
      'C-12345678-9',
      'M-12345678-9',
      'Z-12345678-9',
    ];

    for (const r of invalidPrefixes) {
      const res = validateVenezuelanRif(r);
      assert.equal(res.isValid, false, `Debería rechazar prefijo: ${r}`);
      assert.match(res.error || '', /Prefijo inválido/);
      assert.equal(isValidVenezuelanRif(r), false);
    }
  });

  await t.test('rechaza RIF sin prefijo alfabético', () => {
    const res = validateVenezuelanRif('12345678-9');
    assert.equal(res.isValid, false);
    assert.match(res.error || '', /Prefijo inválido/);
  });

  await t.test('rechaza caracteres no numéricos en el cuerpo del RIF', () => {
    const res = validateVenezuelanRif('J-1234A678-9');
    assert.equal(res.isValid, false);
    assert.match(res.error || '', /exclusivamente dígitos numéricos/);
  });

  await t.test('rechaza RIF incompleto con menos de 8 dígitos numéricos', () => {
    const res = validateVenezuelanRif('J-12345');
    assert.equal(res.isValid, false);
    assert.match(res.error || '', /incompleto/);
  });

  await t.test('rechaza RIF con más de 9 dígitos numéricos', () => {
    const res = validateVenezuelanRif('J-12345678901');
    assert.equal(res.isValid, false);
    assert.match(res.error || '', /excede la longitud legal máxima/);
  });

  await t.test('rechaza valores nulos, indefinidos o vacíos', () => {
    assert.equal(validateVenezuelanRif('').isValid, false);
    assert.equal(validateVenezuelanRif('   ').isValid, false);
    assert.equal(validateVenezuelanRif(null).isValid, false);
    assert.equal(validateVenezuelanRif(undefined).isValid, false);
  });

  await t.test('mantiene la lista oficial de prefijos legales (V, J, G, E, P)', () => {
    assert.deepEqual([...VALID_RIF_PREFIXES], ['V', 'J', 'G', 'E', 'P']);
  });
});
