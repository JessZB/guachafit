#!/usr/bin/env node

/**
 * SDD Drift Check Tool
 * 
 * Verifica que los cambios de código fuente en `apps/` y `packages/`
 * mantengan correspondencia con la documentación de especificación SDD
 * en `02_Requerimientos/`, `04_Decisiones/` y `05_Arquitectura/`.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 [SDD Drift Check] Iniciando verificación de coherencia entre Especificaciones y Código...');

const REQUIRED_SPEC_PATHS = [
  '02_Requerimientos/RF',
  '02_Requerimientos/RNF',
  '03_Dominio',
  '04_Decisiones',
  '05_Arquitectura',
];

// 1. Verificar existencia de la estructura de especificación SDD
let specMissing = false;
for (const relPath of REQUIRED_SPEC_PATHS) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ [SDD ERROR] Ruta de especificación requerida no encontrada: ${relPath}`);
    specMissing = true;
  }
}

if (specMissing) {
  console.error('💥 Falla en verificación SDD: La estructura de documentación está incompleta.');
  process.exit(1);
}

// 2. Comprobar diferencias en git
try {
  const statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
  if (!statusOutput) {
    console.log('✅ [SDD Drift Check] Árbol de trabajo limpio. Sin divergencias detectadas.');
    process.exit(0);
  }

  const lines = statusOutput.split('\n');
  const codeChanges = [];
  const specChanges = [];

  for (const line of lines) {
    const file = line.slice(3).trim();
    if (file.startsWith('apps/') || file.startsWith('packages/')) {
      codeChanges.push(file);
    }
    if (
      file.startsWith('02_Requerimientos/') ||
      file.startsWith('03_Dominio/') ||
      file.startsWith('04_Decisiones/') ||
      file.startsWith('05_Arquitectura/') ||
      file === '00_Dashboard.md' ||
      file === '00_Reglas_Desarrollo_SDD.md'
    ) {
      specChanges.push(file);
    }
  }

  console.log(`📊 Archivos de código modificados: ${codeChanges.length}`);
  console.log(`📝 Archivos de especificación modificados: ${specChanges.length}`);

  if (codeChanges.length > 0 && specChanges.length === 0) {
    console.warn('\n⚠️ [SDD ADVERTENCIA] Se han detectado cambios en código fuente sin modificaciones en la documentación.');
    console.warn('   Asegúrate de invocar al "Agente Sincronizador de Documentación (Reverse Doc-Sync)"');
    console.warn('   o documentar cualquier ajuste de regla de negocio o nuevo ADR.\n');
  } else {
    console.log('✅ [SDD Drift Check] Coherencia verificada satisfactoriamente.');
  }
} catch (error) {
  console.warn('⚠️ No se pudo ejecutar git status (¿entorno sin git?). Omitiendo chequeo de diffs:', error.message);
}

process.exit(0);
