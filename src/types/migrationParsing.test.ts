import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMigrationValue, parseDelimitedRecords, parseMigrationNumber } from './migrationParsing';

test('normaliza encabezados con acentos, espacios y signos', () => {
  assert.equal(normalizeMigrationValue('Código de artículo'), 'codigodearticulo');
});

test('lee CSV con separador punto y coma, comillas escapadas y saltos de línea dentro de campos', () => {
  const rows = parseDelimitedRecords('codigo;nombre;nota\nA1;"Tornillo; acero";"línea 1\nlínea 2"\nA2;"Dijo ""ok""";simple');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nombre, 'Tornillo; acero');
  assert.equal(rows[0].nota, 'línea 1\nlínea 2');
  assert.equal(rows[1].nombre, 'Dijo "ok"');
});

test('rechaza comillas sin cerrar en CSV', () => {
  assert.throws(() => parseDelimitedRecords('codigo,nombre\nA1,"incompleto'), /comillas sin cerrar/);
});

test('interpreta números con formatos regionales habituales', () => {
  assert.equal(parseMigrationNumber('1.234,56'), 1234.56);
  assert.equal(parseMigrationNumber('1,234.56'), 1234.56);
  assert.equal(parseMigrationNumber('1234,56'), 1234.56);
  assert.equal(parseMigrationNumber('1.234'), 1234);
  assert.equal(parseMigrationNumber('texto'), Number.NaN);
});

test('no descarta celdas vacías intermedias ni agrega columnas fuera de encabezado', () => {
  const rows = parseDelimitedRecords('codigo,nombre,precio\nA1,,12.50\nA2,Tuerca');
  assert.equal(rows[0].nombre, '');
  assert.equal(rows[1].precio, '');
});
