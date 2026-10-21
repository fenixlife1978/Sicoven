import React, { useState, useRef } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { BankAccount } from '../../types/accounting';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Download,
  Info,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Database,
  Calendar,
  Layers,
  FileText
} from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';
import {
  parseBankStatementExcel,
  generateSampleBankStatementWorkbook,
  BankStatementParseResult
} from '../../utils/bankStatementParser';

interface UploadBankStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBankAccount: BankAccount;
  onSuccess: (importedCount: number, reconciledCount: number) => void;
}

export const UploadBankStatementModal: React.FC<UploadBankStatementModalProps> = ({
  isOpen,
  onClose,
  activeBankAccount,
  onSuccess
}) => {
  const {
    currentCompany,
    bankAccounts,
    bankStatementMovements,
    addBankStatementMovementsBulk,
    clearBankStatementMovements,
    runAutoReconciliation
  } = useAccounting();

  const [selectedBankId, setSelectedBankId] = useState<string>(activeBankAccount.id);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<BankStatementParseResult | null>(null);
  const [autoReconcile, setAutoReconcile] = useState(true);
  const [replaceExistingUnreconciled, setReplaceExistingUnreconciled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const targetBank = bankAccounts.find(b => b.id === selectedBankId) || activeBankAccount;

  // Manejar selección de archivo
  const handleFileProcess = async (selectedFile: File) => {
    setErrorMsg(null);
    setFile(selectedFile);
    setIsParsing(true);

    try {
      const result = await parseBankStatementExcel(selectedFile, currentCompany.bcvRate);
      if (!result.success) {
        setErrorMsg(result.error || 'No se pudieron extraer transacciones del archivo Excel.');
      }
      setParseResult(result);
    } catch (err: any) {
      console.error('Error parsing bank statement Excel:', err);
      setErrorMsg(err?.message || 'Error al procesar el archivo Excel. Verifique que no esté dañado.');
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileProcess(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Descargar plantilla Excel de ejemplo
  const handleDownloadSampleTemplate = () => {
    const bytes = generateSampleBankStatementWorkbook(targetBank.bankName, targetBank.accountNumber);
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Plantilla_Estado_Cuenta_${targetBank.bankName.replace(/[^A-Za-z0-9]/g, '_')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Cargar archivo de prueba en 1 clic
  const handleLoadSampleDemo = async () => {
    const bytes = generateSampleBankStatementWorkbook(targetBank.bankName, targetBank.accountNumber);
    const mockFile = new File([bytes as any], 'Estado_Cuenta_Bancario_BNC_Octubre2026.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    await handleFileProcess(mockFile);
  };

  // Confirmar e importar movimientos
  const handleConfirmImport = () => {
    if (!parseResult || parseResult.rows.length === 0) return;

    if (replaceExistingUnreconciled) {
      clearBankStatementMovements(targetBank.id);
    }

    // Convertir filas parseadas a formato de movimientos
    const movementsToImport = parseResult.rows.map(row => ({
      bankAccountId: targetBank.id,
      date: row.date,
      reference: row.reference,
      description: row.description,
      type: row.type,
      amountBs: row.amountBs,
      amountUsd: row.amountUsd,
      isReconciled: false
    }));

    addBankStatementMovementsBulk(movementsToImport);

    let reconciledCount = 0;
    if (autoReconcile) {
      const autoRes = runAutoReconciliation(targetBank.id);
      reconciledCount = autoRes.matchedCount;
    }

    onSuccess(movementsToImport.length, reconciledCount);
    onClose();
  };

  // Comprobar referencias duplicadas existentes
  const existingRefs = new Set(
    bankStatementMovements
      .filter(m => m.bankAccountId === targetBank.id)
      .map(m => m.reference.trim().toLowerCase())
  );

  const duplicateCount = parseResult?.rows.filter(
    r => r.reference && existingRefs.has(r.reference.trim().toLowerCase())
  ).length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-slate-900 text-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-100 flex items-center gap-2">
                Subir Estado de Cuenta Bancario (.XLS / .XLSX)
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Conciliación Automática
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Reconocimiento inteligente de columnas bancarias y cruce con el Libro Diario
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Target Bank Account Selector & Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Cuenta Bancaria Receptora
              </label>
              <select
                value={selectedBankId}
                onChange={e => setSelectedBankId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} - Cta. {b.accountNumber} ({b.accountCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-center space-y-1.5 text-xs text-slate-600">
              <div className="font-semibold text-slate-800">
                Empresa: <span className="text-emerald-700">{currentCompany.name}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Tasa de Conversión: <strong>Bs. {currentCompany.bcvRate.toFixed(2)}/USD</strong>
              </div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/50'
                : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50/60 bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleFileProcess(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-800">
                {file ? file.name : 'Haz clic para seleccionar o arrastra tu archivo Excel aquí'}
              </div>
              <p className="text-[11px] text-slate-500 max-w-md">
                Formatos compatibles: <strong>.XLS</strong>, <strong>.XLSX</strong> o <strong>.CSV</strong> de cualquier banco venezolano (BNC, Banesco, Mercantil, Provincial, Venezuela, Bancamiga, etc.).
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Día
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Referencia
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Descripción
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Fecha
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Tipo de Movimiento
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Crédito
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Débito
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Saldo
                </span>
              </div>
            </div>
          </div>

          {/* Quick Tools: Sample Template & Demo Data */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <button
              type="button"
              onClick={handleDownloadSampleTemplate}
              className="inline-flex items-center gap-1.5 text-slate-700 hover:text-emerald-700 font-semibold transition cursor-pointer"
              title="Descargar archivo Excel con las columnas exactas para rellenar"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              Descargar Plantilla Excel de Ejemplo (.xlsx)
            </button>

            <button
              type="button"
              onClick={handleLoadSampleDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-semibold border border-emerald-200 transition cursor-pointer"
              title="Cargar automáticamente datos de prueba para probar la conciliación bancaria"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Cargar Extracto de Prueba (10 Movimientos)
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {/* Parse Result Summary & Column Mapping */}
          {parseResult && parseResult.success && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {/* Detection Card */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-100">
                      Archivo Procesado con Éxito: {parseResult.rows.length} Movimientos Identificados
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Hoja: {parseResult.sheetName} • Fila Encabezados: {parseResult.headerRowIndex + 1}
                  </span>
                </div>

                {/* Column badges */}
                <div className="text-[11px] text-slate-300 mb-2">
                  Columnas Mapeadas Automáticamente:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(parseResult.detectedColumns).map(([key, rawName]) => (
                    <span
                      key={key}
                      className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700"
                    >
                      {key}: <strong className="text-white font-sans">{rawName}</strong>
                    </span>
                  ))}
                </div>

                {/* Totals metadata if detected */}
                {(parseResult.summary.totalCredit || parseResult.summary.totalDebit) && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono-nums">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Créditos (Abonos):</span>
                      <strong className="text-emerald-400">Bs. {formatBs(parseResult.summary.totalCredit || 0)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Débitos (Cargos):</span>
                      <strong className="text-rose-400">Bs. {formatBs(parseResult.summary.totalDebit || 0)}</strong>
                    </div>
                    {parseResult.summary.initialBalance !== undefined && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">Saldo Inicial:</span>
                        <span className="text-slate-200">Bs. {formatBs(parseResult.summary.initialBalance)}</span>
                      </div>
                    )}
                    {parseResult.summary.finalBalance !== undefined && (
                      <div>
                        <span className="text-slate-400 block text-[10px]">Saldo Final:</span>
                        <span className="text-slate-200">Bs. {formatBs(parseResult.summary.finalBalance)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Duplicate alert if any */}
              {duplicateCount > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>
                    Aviso: Se detectaron <strong>{duplicateCount}</strong> movimientos cuya referencia ya existe en el extracto de esta cuenta bancaria.
                  </span>
                </div>
              )}

              {/* Data Table Preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Vista Previa de Movimientos a Importar ({parseResult.rows.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Mostrando primeros 15 registros</span>
                </div>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 whitespace-nowrap">
                        <th className="py-2 px-3 text-center w-10">#</th>
                        <th className="py-2 px-3 w-24">Fecha</th>
                        <th className="py-2 px-3 w-28">Referencia</th>
                        <th className="py-2 px-3 min-w-[200px]">Descripción</th>
                        <th className="py-2 px-2 text-center w-24">Tipo</th>
                        <th className="py-2 px-3 text-right w-32">Monto (Bs.)</th>
                        <th className="py-2 px-3 text-right w-28">Saldo (Bs.)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono-nums">
                      {parseResult.rows.slice(0, 15).map(row => (
                        <tr key={row.rowNumber} className="hover:bg-slate-50 transition">
                          <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {row.rowNumber}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                            {formatDate(row.date)}
                          </td>
                          <td className="py-1.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {row.reference}
                          </td>
                          <td className="py-1.5 px-3 font-sans text-slate-800 truncate max-w-xs" title={row.description}>
                            {row.description}
                          </td>
                          <td className="py-1.5 px-2 text-center whitespace-nowrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                row.type === 'CREDIT'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border border-rose-200'
                              }`}
                            >
                              {row.type === 'CREDIT' ? (
                                <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3 text-rose-600" />
                              )}
                              {row.type === 'CREDIT' ? 'Crédito' : 'Débito'}
                            </span>
                          </td>
                          <td
                            className={`py-1.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                              row.type === 'CREDIT' ? 'text-emerald-700' : 'text-slate-900'
                            }`}
                          >
                            {formatBs(row.amountBs)}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                            {row.balanceBs !== undefined ? formatBs(row.balanceBs) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Options */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoReconcile}
                    onChange={e => setAutoReconcile(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Ejecutar Conciliación Automática inmediatamente al importar (cruce con asientos del sistema)
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceExistingUnreconciled}
                    onChange={e => setReplaceExistingUnreconciled(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Reemplazar movimientos previos no conciliados de esta cuenta bancaria</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 border-t border-slate-200 flex-shrink-0">
          <div className="text-xs text-slate-500">
            {parseResult?.success ? (
              <span className="font-medium text-emerald-700">
                ✓ Listo para asentar {parseResult.rows.length} movimientos en {targetBank.bankName}.
              </span>
            ) : (
              <span>Seleccione un archivo Excel para habilitar la importación.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!parseResult || !parseResult.success || parseResult.rows.length === 0}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow ${
                parseResult && parseResult.success && parseResult.rows.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-700/20'
                  : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                Importar {parseResult?.rows.length || 0} Movimientos {autoReconcile ? 'y Conciliar' : ''}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
