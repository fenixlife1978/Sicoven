#!/usr/bin/env node
/**
 * scripts/audit-production-assets.cjs
 * 
 * Audita las carpetas de recursos locales (public/, src/assets/, src/data/) y
 * los artefactos empaquetados en dist/ para garantizar que ningún dato de prueba,
 * mock, captura temporal de chat o registros ficticios de demostración se filtren
 * en el instalador final .exe de producción.
 *
 * Retorna código 0 si la auditoría es satisfactoria o 1 si se detectan anomalías.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SRC_ASSETS_DIR = path.join(ROOT_DIR, 'src', 'assets');
const SRC_DATA_DIR = path.join(ROOT_DIR, 'src', 'data');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');

const FORBIDDEN_CONTENT_PATTERNS = [
  /DISTRIBUIDORA LOS ANDES/i,
  /SERVICIOS TECNOL[OÓ]GICOS DEL CARIBE/i,
  /administracion@losandesdist\.com\.ve/i,
  /contacto@caribetech\.com\.ve/i,
  /J-40892182-3/,
  /J-50123849-1/,
  /INVERSIONES INDUSTRIALES DE VENEZUELA/i
];

const FORBIDDEN_FILE_PATTERNS = [
  /^mock[-_.]/i,
  /^test[-_.]data/i,
  /^sample[-_.]data/i,
  /\.test\.(js|ts|json)$/i,
  /\.spec\.(js|ts|json)$/i,
  /^dummy[-_.]/i,
  /^ficticio[-_.]/i,
  /\.sqlite(-shm|-wal)?$/i,
  /\.db$/i
];

// Capturas de pantalla temporales adjuntas en chat durante sesiones de soporte
const CHAT_ATTACHMENT_PATTERNS = [
  /^image[-_][0-9a-f_-]+\.(png|jpg|jpeg)$/i,
  /^image-[0-9]+_[0-9a-f]+\.(png|jpg|jpeg)$/i
];

let issues = [];
let warnings = [];

function logSection(title) {
  console.log(`\n\x1b[1m\x1b[36m▶ ${title}\x1b[0m`);
}

function logSuccess(msg) {
  console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
}

function logWarning(msg) {
  console.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
  warnings.push(msg);
}

function logError(msg) {
  console.log(`  \x1b[31m✖\x1b[0m ${msg}`);
  issues.push(msg);
}

function scanDirectory(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath, entry.name);
    }
  }
}

// 1. Auditoría de archivos en carpetas de assets locales
logSection('1. Verificando archivos en carpetas de recursos locales');

const assetFolders = [PUBLIC_DIR, SRC_ASSETS_DIR];
let scannedAssetFiles = 0;

for (const folder of assetFolders) {
  scanDirectory(folder, (filePath, fileName) => {
    scannedAssetFiles++;
    const relativePath = path.relative(ROOT_DIR, filePath);

    // Verificar nombres de archivos prohibidos (mocks, test data, dumps sqlite)
    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(fileName)) {
        logError(`Archivo de prueba/mock no permitido encontrado en assets: ${relativePath}`);
      }
    }

    // Verificar capturas de chat adjuntas que no deben filtrarse en producción
    for (const pattern of CHAT_ATTACHMENT_PATTERNS) {
      if (pattern.test(fileName)) {
        logWarning(`Captura temporal de conversación detectada en ${relativePath} (se recomienda limpiar antes de empaquetar)`);
      }
    }

    // Si es un archivo de texto o JSON, auditar su contenido
    if (/\.(json|txt|csv|tsv|xml)$/i.test(fileName)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
          if (pattern.test(content)) {
            logError(`Contenido de datos demo/mock detectado en ${relativePath}: coincidencia con ${pattern}`);
          }
        }
      } catch (e) {
        logWarning(`No se pudo leer archivo de datos ${relativePath}: ${e.message}`);
      }
    }
  });
}
logSuccess(`Se auditaron ${scannedAssetFiles} archivos en public/ y src/assets/.`);

// 2. Auditoría del archivo inicial de datos (src/data/initialData.ts)
logSection('2. Auditando fuentes de datos de inicio (src/data/)');

const initialDataPath = path.join(SRC_DATA_DIR, 'initialData.ts');
if (fs.existsSync(initialDataPath)) {
  const content = fs.readFileSync(initialDataPath, 'utf8');
  let hasForbiddenRecord = false;
  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(content)) {
      logError(`src/data/initialData.ts contiene registros semilla de demostración: coincidencia con ${pattern}`);
      hasForbiddenRecord = true;
    }
  }
  if (!hasForbiddenRecord) {
    logSuccess('src/data/initialData.ts está completamente limpio de empresas o compras/ventas ficticias.');
  }
} else {
  logWarning('src/data/initialData.ts no encontrado.');
}

// 3. Auditoría de la configuración del empaquetador (package.json / electron-builder)
logSection('3. Auditando configuración de empaquetado (.exe)');

if (fs.existsSync(PKG_PATH)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const files = pkg.build?.files || [];
    
    // Verificar que los tests no estén explícitamente incluidos en los archivos a empaquetar
    const includesTests = files.some(f => /test/i.test(f) && !/build\//.test(f));
    if (includesTests) {
      logError('package.json -> build.files incluye patrones de pruebas.');
    } else {
      logSuccess('package.json -> build.files excluye correctamente archivos de prueba.');
    }
  } catch (e) {
    logError(`No se pudo analizar package.json: ${e.message}`);
  }
}

// 4. Auditoría de artefactos de compilación en dist/ (si dist existe)
logSection('4. Auditando artefactos compilados en dist/ (producción)');

if (fs.existsSync(DIST_DIR)) {
  let bundleCount = 0;
  scanDirectory(DIST_DIR, (filePath, fileName) => {
    const relativePath = path.relative(ROOT_DIR, filePath);

    // Archivos prohibidos en dist
    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(fileName)) {
        logError(`Archivo de prueba filtrado a la carpeta dist/: ${relativePath}`);
      }
    }

    // Verificar en bundles de JavaScript
    if (/\.js$/i.test(fileName)) {
      bundleCount++;
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
        if (pattern.test(content)) {
          logError(`Fuga de datos demo detectada en el bundle compilado ${relativePath} (${pattern})`);
        }
      }
    }
  });

  if (bundleCount > 0) {
    logSuccess(`Se auditaron ${bundleCount} bundles compilados en dist/ sin fugas de datos.`);
  } else {
    logWarning('dist/ existe pero no contiene archivos .js.');
  }

  // Verificar que el recurso oficial de login exista en dist/
  const hasLoginBg = fs.existsSync(path.join(DIST_DIR, 'sicoven-login-reference.png')) ||
    fs.readdirSync(path.join(DIST_DIR, 'assets')).some(f => /sicoven-login-reference/i.test(f));
  if (hasLoginBg) {
    logSuccess('El recurso oficial de inicio de sesión (sicoven-login-reference) está presente en dist/.');
  } else {
    logError('El recurso oficial de inicio de sesión no se encontró en dist/.');
  }
} else {
  console.log('  ℹ La carpeta dist/ aún no ha sido generada (ejecute npm run build para auditar los bundles).');
}

// 5. Resumen final
logSection('5. Resultado de la auditoría');

if (issues.length > 0) {
  console.log(`\n\x1b[1m\x1b[31mRESULTADO: FALLÓ la auditoría con ${issues.length} problema(s):\x1b[0m`);
  issues.forEach((err, idx) => console.log(`  ${idx + 1}. ${err}`));
  console.log('\nPor favor corrija los problemas anteriores antes de compilar y empaquetar el .exe.\n');
  process.exit(1);
} else {
  console.log(`\n\x1b[1m\x1b[32mRESULTADO: Auditoría exitosa.\x1b[0m`);
  console.log('Todos los recursos locales están libres de datos demo o archivos de prueba para el empaquetado final.');
  if (warnings.length > 0) {
    console.log(`\x1b[33mAdvertencias leves observadas (${warnings.length}):\x1b[0m`);
    warnings.forEach((warn, idx) => console.log(`  - ${warn}`));
  }
  console.log('');
  process.exit(0);
}
