#!/usr/bin/env node
/**
 * SICOVEN — auditoría fail-closed de recursos para el instalador de producción.
 * Revisa public/, src/assets/, src/data/, la allowlist del empaquetador y dist/.
 * Si detecta nombres demo/test/mock o marcadores conocidos de datos ficticios,
 * devuelve código 1 y bloquea la publicación.
 *
 * Uso: node scripts/audit-production-assets.cjs [--source-only]
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RESOURCE_DIRS = [
  path.join(ROOT, 'public'),
  path.join(ROOT, 'src', 'assets'),
  path.join(ROOT, 'src', 'data'),
];
const SOURCE_ONLY = process.argv.includes('--source-only');
const issues = [];
const warnings = [];

const FORBIDDEN_NAME = /(?:^|[._\-/])(demo|tests?|mocks?|samples?|fixtures?|dummy|fictici[oa]|prueba|simulad[oa])(?:[._\-/]|$)/i;
const FORBIDDEN_EXT = /(?:\.test|\.spec)\.(?:c?js|mjs|ts|tsx|jsx|json)$/i;
const TEXT_EXT = /\.(?:cjs|mjs|js|jsx|ts|tsx|json|txt|csv|tsv|xml|html|css|svg|md|sql|yml|yaml)$/i;
const FORBIDDEN_CONTENT = [
  /DISTRIBUIDORA LOS ANDES/i,
  /SERVICIOS TECNOL[OÓ]GICOS DEL CARIBE/i,
  /administracion@losandesdist\.com\.ve/i,
  /contacto@caribetech\.com\.ve/i,
  /J-40892182-3/i,
  /J-50123849-1/i,
  /INVERSIONES INDUSTRIALES DE VENEZUELA/i,
];

function section(title) { console.log('\n▶ ' + title); }
function error(message) { issues.push(message); console.error('✖ ' + message); }
function warn(message) { warnings.push(message); console.warn('⚠ ' + message); }
function ok(message) { console.log('✔ ' + message); }

function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (entry.isFile()) visit(full, entry.name);
  }
}

function auditFile(file, name, scope) {
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  if (FORBIDDEN_NAME.test(relative) || FORBIDDEN_EXT.test(name)) {
    error('Archivo con nombre demo/test/mock no permitido en ' + scope + ': ' + relative);
  }
  if (!TEXT_EXT.test(name)) return;
  let body;
  try { body = fs.readFileSync(file, 'utf8'); }
  catch (e) { error('No se pudo leer ' + relative + ': ' + e.message); return; }
  for (const marker of FORBIDDEN_CONTENT) {
    if (marker.test(body)) error('Marcador de datos ficticios detectado en ' + relative + ' (' + marker + ')');
  }
}

section('1. Recursos locales');
let sourceCount = 0;
for (const dir of RESOURCE_DIRS) {
  if (!fs.existsSync(dir)) {
    if (dir.endsWith(path.join('src', 'data'))) warn('No existe src/data/; se omite esa carpeta.');
    continue;
  }
  walk(dir, (file, name) => { sourceCount++; auditFile(file, name, 'recursos fuente'); });
}
ok('Inspeccionados ' + sourceCount + ' archivos en public/, src/assets/ y src/data/.');

section('2. Allowlist electron-builder');
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const files = pkg.build && pkg.build.files;
  const expected = ['dist/**/*', 'electron/**/*', 'build/sicoven.ico', 'build/sicoven.png', 'package.json'];
  if (!Array.isArray(files)) {
    error('package.json no define build.files como lista explícita.');
  } else {
    for (const pattern of files) {
      if (/(^|[/\\])src(?:[/\\]|$)|(^|[/\\])(tests?|fixtures?)([/\\]|$)|(?:demo|mock|sample|dummy|ficticio)/i.test(pattern)) {
        error('Patrón potencialmente inseguro en build.files: ' + pattern);
      }
    }
    for (const required of expected) {
      if (!files.includes(required)) error('Falta el patrón esperado de empaquetado: ' + required);
    }
    ok('build.files es explícito y no empaqueta src/ ni carpetas de pruebas.');
  }
} catch (e) {
  error('No se pudo validar package.json: ' + e.message);
}

if (!SOURCE_ONLY) {
  section('3. Artefactos compilados dist/');
  if (!fs.existsSync(DIST)) {
    error('No existe dist/. Ejecute npm run build antes de la auditoría completa.');
  } else {
    let count = 0;
    walk(DIST, (file, name) => { count++; auditFile(file, name, 'artefactos compilados'); });
    if (!count) error('dist/ está vacío.');
    else ok('Inspeccionados ' + count + ' archivos en dist/.');
    const assetsDir = path.join(DIST, 'assets');
    const assetNames = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
    if (!assetNames.some(name => /\.js$/i.test(name))) error('No se encontraron bundles JavaScript en dist/assets/.');
    const hasLoginBg = fs.existsSync(path.join(DIST, 'sicoven-login-reference.png')) ||
      assetNames.some(name => /sicoven-login-reference/i.test(name));
    if (!hasLoginBg) error('No se encontró el recurso oficial sicoven-login-reference en dist/.');
    else ok('El recurso oficial de login está presente en dist/.');
  }
} else {
  console.log('\nModo --source-only: auditoría previa a la compilación; se omite dist/.');
}

section('Resultado');
if (issues.length) {
  console.error('\nAUDITORÍA FALLIDA: ' + issues.length + ' problema(s). Se debe bloquear la compilación/publicación.');
  for (const item of issues) console.error(' - ' + item);
  process.exit(1);
}
console.log('\nAUDITORÍA APROBADA: no se detectaron nombres prohibidos ni marcadores conocidos de datos ficticios.');
if (warnings.length) console.warn('Advertencias: ' + warnings.length);
process.exit(0);
