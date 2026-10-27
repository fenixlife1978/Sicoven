import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  Landmark,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Printer,
  Plus,
  ArrowRightLeft,
  Search,
  RotateCcw,
  CheckSquare,
  Square,
  FileSpreadsheet,
  Calendar,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  Download
} from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';
import { NewBankMovementModal } from './NewBankMovementModal';
import { BankStatementMovement } from '../../types/accounting';
import { CompanyLogoHeader } from '../CompanyLogoHeader';
import { exportConciliacionPdf } from '../../utils/pdfGenerator';

export const ConciliacionBancariaView: React.FC = () => {
  const {
    currentCompany,
    journalEntries,
    bankAccounts,
    bankStatementMovements,
    reconcileMovementManual,
    unreconcileMovement,
    runAutoReconciliation,
    unreconcileAll,
    createAdjustingEntryForBankMovement,
    displayCurrency
  } = useAccounting();

  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(
    bankAccounts[0]?.id || ''
  );
  const [activeSubTab, setActiveSubTab] = useState<'COTEJO' | 'CEDULA'>('COTEJO');
  const [cutoffDate, setCutoffDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewMovementModalOpen, setIsNewMovementModalOpen] = useState(false);
  const [autoReconcileFeedback, setAutoReconcileFeedback] = useState<string | null>(null);

  // Manual pair selection state
  const [selectedBookEntryId, setSelectedBookEntryId] = useState<string | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const companyBanks = bankAccounts.filter(b => b.companyId === currentCompany.id);
  const activeBank =
    companyBanks.find(b => b.id === selectedBankAccountId) || companyBanks[0];

  // If no bank accounts, display empty state
  if (!activeBank) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
        <Landmark className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-700">No hay cuentas bancarias registradas</h3>
        <p className="text-xs text-slate-400 mt-1">
          Registra una cuenta bancaria para conciliar los movimientos contables con los extractos del banco.
        </p>
        <p className="mt-4 text-xs font-semibold text-emerald-700">Para registrar o administrar bancos, utilice el módulo Tesorería. Esta pantalla queda dedicada al cotejo de extractos y la cédula de conciliación.</p>
      </div>
    );
  }

  // 1. Libros Contables: Asientos que afectan a la cuenta contable del banco activo
  const bookMovements: {
    entryId: string;
    entryNumber: number;
    date: string;
    description: string;
    referenceDoc?: string;
    debitBs: number; // Cargos en banco (depósitos)
    creditBs: number; // Abonos en banco (salidas / cheques)
    debitUsd: number;
    creditUsd: number;
    isReconciled: boolean;
  }[] = [];

  const companyEntries = journalEntries.filter(
    e => e.companyId === currentCompany.id && e.date <= cutoffDate
  );

  for (const entry of companyEntries) {
    for (const it of entry.items) {
      if (it.accountCode === activeBank.accountCode) {
        // Check if there is a reconciled statement movement linked to this entry
        const isMatched = bankStatementMovements.some(
          m =>
            m.companyId === currentCompany.id &&
            m.bankAccountId === activeBank.id &&
            m.isReconciled &&
            m.reconciledWithJournalEntryId === entry.id
        );

        bookMovements.push({
          entryId: entry.id,
          entryNumber: entry.entryNumber,
          date: entry.date,
          description: it.description || entry.description,
          referenceDoc: entry.referenceDoc,
          debitBs: it.debitBs || 0,
          creditBs: it.creditBs || 0,
          debitUsd: it.debitUsd || 0,
          creditUsd: it.creditUsd || 0,
          isReconciled: isMatched
        });
      }
    }
  }

  // Sort book movements chronologically
  bookMovements.sort((a, b) => a.date.localeCompare(b.date) || a.entryNumber - b.entryNumber);

  // 2. Extracto Bancario: Movimientos cargados del banco
  const statementMovements = bankStatementMovements
    .filter(m => m.companyId === currentCompany.id && m.bankAccountId === activeBank.id && m.date <= cutoffDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculations for Conciliation
  // Saldo según Libros (Debe - Haber)
  const totalBookDebitsBs = bookMovements.reduce((sum, m) => sum + m.debitBs, 0);
  const totalBookCreditsBs = bookMovements.reduce((sum, m) => sum + m.creditBs, 0);
  const bookBalanceBs = totalBookDebitsBs - totalBookCreditsBs;

  // Saldo según Extracto Bancario (Créditos - Débitos)
  const totalBankCreditsBs = statementMovements.reduce(
    (sum, m) => sum + (m.type === 'CREDIT' ? m.amountBs : 0),
    0
  );
  const totalBankDebitsBs = statementMovements.reduce(
    (sum, m) => sum + (m.type === 'DEBIT' ? m.amountBs : 0),
    0
  );
  const bankStatementBalanceBs = totalBankCreditsBs - totalBankDebitsBs;

  // Partidas en tránsito y pendientes
  // A. Depósitos en tránsito: Cargos en libros (Debe > 0) que NO están conciliados en el extracto bancario
  const depositsInTransit = bookMovements.filter(m => !m.isReconciled && m.debitBs > 0);
  const totalDepositsInTransitBs = depositsInTransit.reduce((sum, m) => sum + m.debitBs, 0);

  // B. Cheques y transferencias en tránsito: Abonos en libros (Haber > 0) que NO han sido cobrados en banco
  const checksInTransit = bookMovements.filter(m => !m.isReconciled && m.creditBs > 0);
  const totalChecksInTransitBs = checksInTransit.reduce((sum, m) => sum + m.creditBs, 0);

  // C. Notas de Débito del banco no registradas en libros (comisiones, IGTF, etc.)
  const bankDebitsNotInBooks = statementMovements.filter(m => !m.isReconciled && m.type === 'DEBIT');
  const totalBankDebitsNotInBooksBs = bankDebitsNotInBooks.reduce((sum, m) => sum + m.amountBs, 0);

  // D. Notas de Crédito del banco no registradas en libros (intereses ganados, abonos directos)
  const bankCreditsNotInBooks = statementMovements.filter(m => !m.isReconciled && m.type === 'CREDIT');
  const totalBankCreditsNotInBooksBs = bankCreditsNotInBooks.reduce((sum, m) => sum + m.amountBs, 0);

  // Cédula: Saldos ajustados
  // Saldo Bancario Ajustado = Saldo Banco + Depósitos en Tránsito - Cheques en Tránsito
  const adjustedBankBalanceBs =
    bankStatementBalanceBs + totalDepositsInTransitBs - totalChecksInTransitBs;

  // Saldo en Libros Ajustado = Saldo Libros + Notas de Crédito Banco - Notas de Débito Banco
  const adjustedBookBalanceBs =
    bookBalanceBs + totalBankCreditsNotInBooksBs - totalBankDebitsNotInBooksBs;

  const differenceBs = Math.abs(adjustedBankBalanceBs - adjustedBookBalanceBs);
  const isReconciledBalanced = differenceBs < 0.05;

  // Handle Automatic Reconciliation execution
  const handleRunAuto = () => {
    const res = runAutoReconciliation(activeBank.id);
    if (res.matchedCount > 0) {
      setAutoReconcileFeedback(
        `¡Conciliación automática exitosa! Se vincularon ${res.matchedCount} partidas coincidentes.`
      );
    } else {
      setAutoReconcileFeedback(
        'No se encontraron partidas automáticas pendientes por vincular (verifique referencias o montos).'
      );
    }
    setTimeout(() => setAutoReconcileFeedback(null), 4000);
  };

  // Handle manual pair matching
  const handleLinkSelectedPair = () => {
    if (!selectedStatementId) return;
    reconcileMovementManual(selectedStatementId, selectedBookEntryId || undefined);
    setSelectedStatementId(null);
    setSelectedBookEntryId(null);
  };

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportConciliacionPdf(
        currentCompany,
        activeBank,
        cutoffDate,
        {
          bankStatementBalanceBs,
          depositsInTransit,
          checksInTransit,
          adjustedBankBalanceBs,
          bookBalanceBs,
          bankCreditsNotInBooks,
          bankDebitsNotInBooks,
          adjustedBookBalanceBs,
          differenceBs
        }
      );
    } catch (err) {
      console.error('Error generating conciliation PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Official Header with Selected Company Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <CompanyLogoHeader
          company={currentCompany}
          reportTitle="Cédula de Conciliación Bancaria"
          subtitle={`Cotejo de Extracto Bancario vs. Mayor General • Banco: ${activeBank.bankName}`}
          periodText={`Fecha de Corte: ${formatDate(cutoffDate)}`}
        />

        {/* Action buttons (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Cuenta: <strong className="text-slate-900">{activeBank.bankName}</strong> ({activeBank.accountNumber})</span>
            <span>•</span>
            <span className={isReconciledBalanced ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {isReconciledBalanced ? 'Conciliación Cuadrada (Diferencia: Bs. 0,00)' : `Diferencia: ${formatBs(differenceBs)}`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300 shadow-sm"
              title="Descargar cédula de conciliación oficial en PDF con logo"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF Cédula'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Cédula
            </button>
            <button
              onClick={() => setIsNewMovementModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition cursor-pointer border border-emerald-200"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Movimiento Extracto
            </button>
            <button
              onClick={handleRunAuto}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl transition shadow shadow-emerald-700/20 cursor-pointer"
              title="Comparar automáticamente por referencia y montos exactos"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" />
              Conciliación Automática
            </button>
          </div>
        </div>

        {/* Bank Selector Bar & Date Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-4 no-print items-center">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Seleccionar Cuenta Bancaria
            </label>
            <div className="flex gap-2">
              <select
                value={selectedBankAccountId}
                onChange={e => setSelectedBankAccountId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} ({b.accountNumber}) - Cuenta {b.accountCode}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Fecha de Corte de la Conciliación
            </label>
            <input
              type="date"
              value={cutoffDate}
              onChange={e => setCutoffDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end pt-5">
            <button
              onClick={() => {
                if (confirm('¿Desea desconciliar todos los movimientos de esta cuenta bancaria?')) {
                  unreconcileAll(activeBank.id);
                }
              }}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-600 font-medium transition cursor-pointer"
              title="Restablecer estado de conciliación de todos los registros"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Desconciliar Todo
            </button>
          </div>
        </div>

        {/* Feedback alert after automatic reconciliation */}
        {autoReconcileFeedback && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-800 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              {autoReconcileFeedback}
            </div>
            <button
              onClick={() => setAutoReconcileFeedback(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Balance Status Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-6">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Saldo según Libros Contables
            </span>
            <div className="text-base font-bold font-mono text-slate-900 mt-1">
              {formatBs(bookBalanceBs)}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Cuenta: {activeBank.accountCode}
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Saldo según Extracto Bancario
            </span>
            <div className="text-base font-bold font-mono text-slate-900 mt-1">
              {formatBs(bankStatementBalanceBs)}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {statementMovements.length} movimientos
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">
              Saldo Bancario Ajustado
            </span>
            <div className="text-base font-bold font-mono text-emerald-700 mt-1">
              {formatBs(adjustedBankBalanceBs)}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Con partidas en tránsito
            </div>
          </div>

          <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
            isReconciledBalanced
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}>
            <span className="text-[10px] uppercase font-bold block">
              Estado de Conciliación
            </span>
            <div className="flex items-center gap-1.5 font-bold text-sm mt-1">
              {isReconciledBalanced ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Conciliación Cuadrada</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Diferencia: {formatBs(differenceBs)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* View Switcher Tabs (no-print) */}
        <div className="flex items-center gap-2 pt-6 border-t border-slate-200 mt-6 no-print">
          <button
            onClick={() => setActiveSubTab('COTEJO')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'COTEJO'
                ? 'bg-slate-900 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
            1. Cotejo Interactivo (Selectores Manuales y Automáticos)
          </button>
          <button
            onClick={() => setActiveSubTab('CEDULA')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'CEDULA'
                ? 'bg-slate-900 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-sky-400" />
            2. Cédula Oficial de Conciliación Bancaria (VEN-NIF)
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: COTEJO INTERACTIVO (DUAL COLUMN WITH SELECTORS) */}
      {activeSubTab === 'COTEJO' && (
        <div className="space-y-4">
          {/* Action bar for multi-selector matching */}
          {(selectedBookEntryId || selectedStatementId) && (
            <div className="bg-emerald-900 text-white p-3 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-3">
                <span className="font-bold">Selección para Conciliar:</span>
                {selectedBookEntryId && (
                  <span className="bg-emerald-800 px-2 py-0.5 rounded font-mono text-[11px]">
                    Asiento en Libros Seleccionado
                  </span>
                )}
                {selectedStatementId && (
                  <span className="bg-emerald-800 px-2 py-0.5 rounded font-mono text-[11px]">
                    Movimiento de Extracto Seleccionado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedBookEntryId(null);
                    setSelectedStatementId(null);
                  }}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold cursor-pointer"
                >
                  Limpiar Selección
                </button>
                <button
                  onClick={handleLinkSelectedPair}
                  className="px-4 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded shadow cursor-pointer"
                >
                  Vincular y Conciliar Selección
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT COLUMN: LIBROS CONTABLES */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Libros Contables (Mayor de la Cuenta {activeBank.accountCode})
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Movimientos registrados en el Libro Diario
                  </p>
                </div>
                <div className="text-right font-mono-nums">
                  <span className="text-[10px] text-slate-400 uppercase block">Saldo en Libros</span>
                  <span className="font-bold text-emerald-400 text-xs">{formatBs(bookBalanceBs)}</span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5 w-8 text-center">Sel.</th>
                      <th className="py-2 px-2.5 w-20">Fecha</th>
                      <th className="py-2 px-2.5">Descripción / Ref.</th>
                      <th className="py-2 px-2.5 text-right w-24">Cargos (Debe)</th>
                      <th className="py-2 px-2.5 text-right w-24">Abonos (Haber)</th>
                      <th className="py-2 px-2.5 text-center w-20">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bookMovements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No hay movimientos en libros para esta cuenta en el período.
                        </td>
                      </tr>
                    ) : (
                      bookMovements.map(m => {
                        const isSelected = selectedBookEntryId === m.entryId;
                        return (
                          <tr
                            key={`${m.entryId}-${m.entryNumber}`}
                            onClick={() =>
                              setSelectedBookEntryId(isSelected ? null : m.entryId)
                            }
                            className={`transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-100/70 border-l-4 border-emerald-600'
                                : m.isReconciled
                                ? 'bg-slate-50/50 hover:bg-slate-100/60'
                                : 'bg-white hover:bg-amber-50/40'
                            }`}
                          >
                            <td className="py-2 px-2.5 text-center">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600 mx-auto" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 mx-auto" />
                              )}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                              {formatDate(m.date)}
                            </td>
                            <td className="py-2 px-2.5">
                              <div className="font-medium text-slate-900 truncate max-w-[200px]" title={m.description}>
                                {m.description}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Asiento #{m.entryNumber} {m.referenceDoc ? `• Ref: ${m.referenceDoc}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-slate-900 font-semibold whitespace-nowrap">
                              {m.debitBs > 0 ? formatBs(m.debitBs) : '-'}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-slate-900 font-semibold whitespace-nowrap">
                              {m.creditBs > 0 ? formatBs(m.creditBs) : '-'}
                            </td>
                            <td className="py-2 px-2.5 text-center whitespace-nowrap">
                              {m.isReconciled ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" /> Conciliado
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                                  En Tránsito
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT COLUMN: EXTRACTO BANCARIO */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs uppercase tracking-wide flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                    Extracto Bancario ({activeBank.bankName})
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Movimientos reportados por el banco
                  </p>
                </div>
                <div className="text-right font-mono-nums">
                  <span className="text-[10px] text-slate-400 uppercase block">Saldo Extracto</span>
                  <span className="font-bold text-sky-400 text-xs">{formatBs(bankStatementBalanceBs)}</span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5 w-8 text-center">Sel.</th>
                      <th className="py-2 px-2.5 w-20">Fecha</th>
                      <th className="py-2 px-2.5">Concepto / Referencia</th>
                      <th className="py-2 px-2.5 text-right w-24">Débito (-)</th>
                      <th className="py-2 px-2.5 text-right w-24">Crédito (+)</th>
                      <th className="py-2 px-2.5 text-center w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statementMovements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No hay movimientos en el extracto bancario.
                        </td>
                      </tr>
                    ) : (
                      statementMovements.map(s => {
                        const isSelected = selectedStatementId === s.id;
                        const isDebit = s.type === 'DEBIT';

                        return (
                          <tr
                            key={s.id}
                            className={`transition ${
                              isSelected
                                ? 'bg-emerald-100/70 border-l-4 border-emerald-600'
                                : s.isReconciled
                                ? 'bg-slate-50/50 hover:bg-slate-100/60'
                                : 'bg-white hover:bg-amber-50/40'
                            }`}
                          >
                            <td
                              className="py-2 px-2.5 text-center cursor-pointer"
                              onClick={() => setSelectedStatementId(isSelected ? null : s.id)}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600 mx-auto" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 mx-auto" />
                              )}
                            </td>
                            <td className="py-2 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                              {formatDate(s.date)}
                            </td>
                            <td className="py-2 px-2.5">
                              <div className="font-medium text-slate-900 truncate max-w-[180px]" title={s.description}>
                                {s.description}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Ref: {s.reference}
                              </div>
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-semibold text-rose-700 whitespace-nowrap">
                              {isDebit ? formatBs(s.amountBs) : '-'}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                              {!isDebit ? formatBs(s.amountBs) : '-'}
                            </td>
                            <td className="py-2 px-2.5 text-center whitespace-nowrap">
                              {s.isReconciled ? (
                                <button
                                  onClick={() => unreconcileMovement(s.id)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 hover:bg-rose-100 hover:text-rose-700 px-2 py-0.5 rounded-full border border-emerald-300 transition cursor-pointer"
                                  title="Click para desconciliar"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  {s.matchedBy === 'AUTO_REF'
                                    ? 'Auto (Ref)'
                                    : s.matchedBy === 'AUTO_AMOUNT'
                                    ? 'Auto (Monto)'
                                    : 'Conciliado'}
                                </button>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => reconcileMovementManual(s.id)}
                                    className="text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-emerald-100 hover:text-emerald-800 px-2 py-0.5 rounded-full border border-amber-300 transition cursor-pointer"
                                    title="Click para marcar conciliado manualmente"
                                  >
                                    Cotejar
                                  </button>
                                  {/* Quick adjusting entry creator for bank debits/credits not in books */}
                                  <button
                                    onClick={() => {
                                      const defaultAcc = isDebit ? '6.1.1.07' : '4.2.1.02';
                                      createAdjustingEntryForBankMovement(s, defaultAcc);
                                      alert(
                                        `Asiento de Ajuste generado automáticamente en el Libro Diario y partida conciliada.`
                                      );
                                    }}
                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                                    title={
                                      isDebit
                                        ? 'Crear asiento contable automático por gasto bancario'
                                        : 'Crear asiento contable automático por ingreso de intereses'
                                    }
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: CÉDULA OFICIAL DE CONCILIACIÓN BANCARIA (PRINTABLE VEN-NIF) */}
      {activeSubTab === 'CEDULA' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6 print:border-none print:shadow-none print:p-0">
          {/* Header of the Reconciliation Sheet */}
          <div className="border border-black p-4 text-center space-y-1">
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-700">
              {currentCompany.name} • RIF: {currentCompany.rif}
            </h2>
            <h1 className="font-black text-sm uppercase tracking-wide">
              CÉDULA DE CONCILIACIÓN BANCARIA
            </h1>
            <p className="text-xs font-semibold text-slate-800">
              BANCO: {activeBank.bankName} • CUENTA N°: {activeBank.accountNumber} • CUENTA CONTABLE: {activeBank.accountCode}
            </p>
            <p className="text-[11px] text-slate-600 font-mono">
              Al {formatDate(cutoffDate)} • Expresado en Bolívares (Bs.) y referencia en Dólares ($ USD)
            </p>
          </div>

          {/* Reconciliation Body (Standard Venezuelan Method) */}
          <div className="border border-black overflow-hidden text-xs">
            {/* PART 1: SALDO SEGÚN ESTADO DE CUENTA BANCARIO */}
            <div className="p-3 bg-slate-100 border-b border-black font-bold flex justify-between items-center">
              <span>1. SALDO SEGÚN EXTRACTO BANCARIO AL {formatDate(cutoffDate)}:</span>
              <span className="font-mono text-sm">{formatBs(bankStatementBalanceBs)}</span>
            </div>

            {/* (+) Depósitos en Tránsito */}
            <div className="p-3 border-b border-slate-200">
              <div className="font-bold text-slate-800 flex justify-between">
                <span>(+) DEPÓSITOS EN TRÁNSITO (Registrados en libros, no acreditados por el banco):</span>
                <span className="font-mono">{formatBs(totalDepositsInTransitBs)}</span>
              </div>
              {depositsInTransit.length === 0 ? (
                <div className="text-[11px] text-slate-400 pl-4 py-1 italic">Sin depósitos en tránsito</div>
              ) : (
                <div className="pl-4 pt-1 space-y-1">
                  {depositsInTransit.map((d, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-slate-600">
                      <span>• {formatDate(d.date)} - {d.description} {d.referenceDoc ? `(Ref: ${d.referenceDoc})` : ''}</span>
                      <span className="font-mono">{formatBs(d.debitBs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* (-) Cheques / Pagos en Tránsito */}
            <div className="p-3 border-b border-black">
              <div className="font-bold text-slate-800 flex justify-between">
                <span>(-) CHEQUES Y TRANSFERENCIAS PENDIENTES DE COBRO (Emitidos en libros, no cargados en banco):</span>
                <span className="font-mono">-{formatBs(totalChecksInTransitBs)}</span>
              </div>
              {checksInTransit.length === 0 ? (
                <div className="text-[11px] text-slate-400 pl-4 py-1 italic">Sin cheques o transferencias pendientes</div>
              ) : (
                <div className="pl-4 pt-1 space-y-1">
                  {checksInTransit.map((c, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-slate-600">
                      <span>• {formatDate(c.date)} - {c.description} {c.referenceDoc ? `(Ref: ${c.referenceDoc})` : ''}</span>
                      <span className="font-mono">-{formatBs(c.creditBs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* (=) Saldo Bancario Ajustado */}
            <div className="p-3 bg-emerald-50 border-b-2 border-black font-black flex justify-between items-center text-emerald-950">
              <span>(=) SALDO BANCARIO AJUSTADO:</span>
              <span className="font-mono text-sm">{formatBs(adjustedBankBalanceBs)}</span>
            </div>

            {/* PART 2: SALDO SEGÚN LIBROS CONTABLES */}
            <div className="p-3 bg-slate-100 border-b border-black font-bold flex justify-between items-center">
              <span>2. SALDO SEGÚN LIBROS CONTABLES DE LA EMPRESA AL {formatDate(cutoffDate)}:</span>
              <span className="font-mono text-sm">{formatBs(bookBalanceBs)}</span>
            </div>

            {/* (+) Notas de Crédito del Banco no en libros */}
            <div className="p-3 border-b border-slate-200">
              <div className="font-bold text-slate-800 flex justify-between">
                <span>(+) NOTAS DE CRÉDITO BANCARIAS (Abonos en banco no registrados en contabilidad):</span>
                <span className="font-mono">{formatBs(totalBankCreditsNotInBooksBs)}</span>
              </div>
              {bankCreditsNotInBooks.length === 0 ? (
                <div className="text-[11px] text-slate-400 pl-4 py-1 italic">Sin notas de crédito pendientes</div>
              ) : (
                <div className="pl-4 pt-1 space-y-1">
                  {bankCreditsNotInBooks.map((nc, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-slate-600">
                      <span>• {formatDate(nc.date)} - {nc.description} (Ref: {nc.reference})</span>
                      <span className="font-mono">+{formatBs(nc.amountBs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* (-) Notas de Débito del Banco no en libros */}
            <div className="p-3 border-b border-black">
              <div className="font-bold text-slate-800 flex justify-between">
                <span>(-) NOTAS DE DÉBITO BANCARIAS (Cargos por comisiones, mantenimiento, IGTF no contabilizados):</span>
                <span className="font-mono">-{formatBs(totalBankDebitsNotInBooksBs)}</span>
              </div>
              {bankDebitsNotInBooks.length === 0 ? (
                <div className="text-[11px] text-slate-400 pl-4 py-1 italic">Sin notas de débito pendientes</div>
              ) : (
                <div className="pl-4 pt-1 space-y-1">
                  {bankDebitsNotInBooks.map((nd, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-slate-600">
                      <span>• {formatDate(nd.date)} - {nd.description} (Ref: {nd.reference})</span>
                      <span className="font-mono">-{formatBs(nd.amountBs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* (=) Saldo en Libros Ajustado */}
            <div className="p-3 bg-emerald-50 border-b border-black font-black flex justify-between items-center text-emerald-950">
              <span>(=) SALDO EN LIBROS AJUSTADO:</span>
              <span className="font-mono text-sm">{formatBs(adjustedBookBalanceBs)}</span>
            </div>

            {/* Verificación de Cuadre */}
            <div className={`p-4 flex items-center justify-between font-black text-sm ${
              isReconciledBalanced
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {isReconciledBalanced
                    ? 'ESTADO: CONCILIACIÓN BANCARIA EXACTA Y CUADRADA'
                    : `ESTADO: DESCUADRE DE BS. ${formatBs(differenceBs)}`}
                </span>
              </div>
              <div className="text-right font-mono text-xs">
                Equivalente BCV: {formatUsd(adjustedBankBalanceBs / (currentCompany.bcvRate || 1))}
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-8 text-xs">
            <div className="text-center space-y-1">
              <div className="border-t border-black w-64 mx-auto pt-1"></div>
              <p className="font-bold uppercase">PREPARADO POR: DEPARTAMENTO DE CONTABILIDAD</p>
              <p className="text-[10px] text-slate-500">Contador Público Colegiado (CPC)</p>
            </div>
            <div className="text-center space-y-1">
              <div className="border-t border-black w-64 mx-auto pt-1"></div>
              <p className="font-bold uppercase">REVISADO Y APROBADO POR: GERENCIA DE ADMINISTRACIÓN</p>
              <p className="text-[10px] text-slate-500">Auditoría Interna / Administración</p>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <NewBankMovementModal
        isOpen={isNewMovementModalOpen}
        onClose={() => setIsNewMovementModalOpen(false)}
        bankAccount={activeBank}
      />
    </div>
  );
};
