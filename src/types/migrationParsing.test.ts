import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMigrationValue, parseDelimitedRecords, parseMigrationNumber, validateUniqueMigrationHeaders } from './migrationParsing';

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
  assert.equal(parseMigrationNumber('Bs. 1.234,56'), 1234.56);
  assert.equal(parseMigrationNumber('(1.234,56)'), -1234.56);
  assert.equal(parseMigrationNumber('-25,50'), -25.5);
  assert.equal(parseMigrationNumber(''), Number.NaN);
  assert.equal(parseMigrationNumber('texto'), Number.NaN);
});

test('no descarta celdas vacías intermedias ni agrega columnas fuera de encabezado', () => {
  const rows = parseDelimitedRecords('codigo,nombre,precio\nA1,,12.50\nA2,Tuerca');
  assert.equal(rows[0].nombre, '');
  assert.equal(rows[1].precio, '');
});


test('rechaza encabezados duplicados equivalentes tras normalizar acentos y mayúsculas', () => {
  assert.throws(
    () => parseDelimitedRecords('Código,nombre,CODIGO\nA1,Tornillo,A2'),
    /encabezados duplicados o equivalentes/
  );
});


test('valida encabezados compartidos para hojas Excel y archivos delimitados', () => {
  assert.deepEqual(validateUniqueMigrationHeaders(['Código', 'Nombre', 'Precio']), ['codigo', 'nombre', 'precio']);
  assert.throws(
    () => validateUniqueMigrationHeaders(['Código', 'CODIGO', 'Nombre'], 'hoja de Excel'),
    /hoja de Excel contiene encabezados duplicados o equivalentes/
  );
});


test('detecta TSV y conserva separadores dentro de campos entrecomillados', () => {
  const rows = parseDelimitedRecords('codigo\\tnombre\\tnota\\r\\nA1\\t"Tuerca | acero"\\t"medida\\tM8"\\r\\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nombre, 'Tuerca | acero');
  assert.equal(rows[0].nota, 'medida\\tM8');
});

test('detecta archivo separado por barras verticales y mantiene campos vacíos finales', () => {
  const rows = parseDelimitedRecords('codigo|nombre|precio\\nA1|Arandela|\\nA2|Tornillo|2,50');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].precio, '');
  assert.equal(rows[1].precio, '2,50');
});
