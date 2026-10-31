import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  ListTree,
  Printer,
  Search,
  ArrowUpDown,
  BookMarked,
  Filter,
  DollarSign,
  Download
} from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';
import { CompanyLogoHeader } from '../CompanyLogoHeader';
import { exportMayorPdf } from '../../utils/pdfGenerator';
import { getAccountBalanceNature } from '../../types/accountingReportIntegrity';

interface LedgerMovement {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  debitBs: number;
  creditBs: number;
  debitUsd: number;
  creditUsd: number;
  runningBalanceBs: number;
  runningBalanceUsd: number;
}

interface AccountLedger {
  code: string;
  name: string;
  type: string;
  movements: LedgerMovement[];
  totalDebitBs: number;
  totalCreditBs: number;
  totalDebitUsd: number;
  totalCreditUsd: number;
  balanceBs: number;
  balanceUsd: number;
  balanceNature: 'DEUDOR' | 'ACREEDOR';
}

export const LibroMayorView: React.FC = () => {
  const { currentCompany, accounts, journalEntries, displayCurrency } = useAccounting();

  const [selectedAccountCode, setSelectedAccountCode] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportMayorPdf(currentCompany, displayedLedgers, displayCurrency);
    } catch (err) {
      console.error('Error exporting Mayor to PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Calculate Ledger movements per account
  const accountsWithMovements: AccountLedger[] = accounts
    .filter(acc => acc.isMovement)
    .map(acc => {
      // Find all items affecting this account
      const allMovements: {
        entryId: string;
        entryNumber: number;
        date: string;
        description: string;
        debitBs: number;
        creditBs: number;
        debitUsd: number;
        creditUsd: number;
      }[] = [];

      for (const entry of journalEntries) {
        for (const it of entry.items) {
          if (it.accountCode === acc.code) {
            allMovements.push({
              entryId: entry.id,
              entryNumber: entry.entryNumber,
              date: entry.date,
              description: it.description || entry.description,
              debitBs: it.debitBs || 0,
              creditBs: it.creditBs || 0,
              debitUsd: it.debitUsd || 0,
              creditUsd: it.creditUsd || 0
            });
          }
        }
      }

      // Sort chronologically
      allMovements.sort((a, b) => a.date.localeCompare(b.date) || a.entryNumber - b.entryNumber);

      // Compute running balances
      // Standard nature: ACTIVO, COSTOS, GASTOS are typically DEUDOR (Debit - Credit)
      // PASIVO, PATRIMONIO, INGRESOS are typically ACREEDOR (Credit - Debit)
      const isDebitNature = ['ACTIVO', 'COSTOS', 'GASTOS'].includes(acc.type);

      let runningBs = 0;
      let runningUsd = 0;

      const movementsWithBalance: LedgerMovement[] = allMovements.map(m => {
        if (isDebitNature) {
          runningBs += m.debitBs - m.creditBs;
          runningUsd += m.debitUsd - m.creditUsd;
        } else {
          runningBs += m.creditBs - m.debitBs;
          runningUsd += m.creditUsd - m.debitUsd;
        }

        return {
          ...m,
          runningBalanceBs: runningBs,
          runningBalanceUsd: runningUsd
        };
      });

      const totalDebitBs = allMovements.reduce((sum, m) => sum + m.debitBs, 0);
      const totalCreditBs = allMovements.reduce((sum, m) => sum + m.creditBs, 0);
      const totalDebitUsd = allMovements.reduce((sum, m) => sum + m.debitUsd, 0);
      const totalCreditUsd = allMovements.reduce((sum, m) => sum + m.creditUsd, 0);

      const netBs = totalDebitBs - totalCreditBs;
      const netUsd = totalDebitUsd - totalCreditUsd;
      const balanceBs = isDebitNature ? netBs : -netBs;

      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        movements: movementsWithBalance,
        totalDebitBs,
        totalCreditBs,
        totalDebitUsd,
        totalCreditUsd,
        balanceBs,
        balanceUsd: isDebitNature ? netUsd : -netUsd,
        balanceNature: getAccountBalanceNature(balanceBs, isDebitNature)
      };
    })
    .filter(acc => acc.movements.length > 0);

  // Filter for display
  const displayedLedgers = accountsWithMovements.filter(acc => {
    if (selectedAccountCode !== 'ALL' && acc.code !== selectedAccountCode) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        acc.code.toLowerCase().includes(term) ||
        acc.name.toLowerCase().includes(term) ||
        acc.type.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Official Header with Selected Company Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <CompanyLogoHeader
          company={currentCompany}
          reportTitle="Libro Mayor General (Mayor Analítico)"
          subtitle="Movimientos y Saldos por Cuenta según Principios Contables VEN-NIF (FCCPV)"
          periodText={`Ejercicio Económico ${currentCompany.fiscalYear}`}
        />

        {/* Action buttons (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Cuentas con movimiento: <strong className="text-slate-900">{displayedLedgers.length}</strong></span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">Saldos Deudores y Acreedores Conciliados</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || displayedLedgers.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300 shadow-sm"
              title="Descargar archivo PDF oficial con logo y márgenes normalizados"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF Oficial'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Libro Mayor
            </button>
          </div>
        </div>

        {/* Toolbar (no-print) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 no-print">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={selectedAccountCode}
              onChange={e => setSelectedAccountCode(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Todas las Cuentas con Movimiento ({accountsWithMovements.length})</option>
              {accountsWithMovements.map(acc => (
                <option key={acc.code} value={acc.code}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end text-xs text-slate-500">
            <span>Cuentas con saldo activo: <strong className="text-slate-800">{displayedLedgers.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Ledgers List */}
      <div className="space-y-6">
        {displayedLedgers.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
            <ListTree className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700">No hay movimientos en el Libro Mayor</h3>
            <p className="text-xs text-slate-400 mt-1">
              Los movimientos del Libro Mayor se alimentan directamente de los asientos contables registrados.
            </p>
          </div>
        ) : (
          displayedLedgers.map(acc => (
            <div
              key={acc.code}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print-break-inside-avoid"
            >
              {/* Account Header */}
              <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm bg-emerald-600 px-2.5 py-0.5 rounded text-white shadow-sm">
                    {acc.code}
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-white tracking-wide">{acc.name}</h2>
                    <span className="text-[11px] text-slate-400 font-medium">Clasificación: {acc.type}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono-nums">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Saldo Actual (Bs.)</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      {formatBs(acc.balanceBs)}
                    </span>
                  </div>
                  <div className="text-right border-l border-slate-700 pl-3">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Saldo ($ USD)</span>
                    <span className="font-semibold text-slate-200 text-xs">
                      {formatUsd(acc.balanceUsd)}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    acc.balanceNature === 'DEUDOR' ? 'bg-sky-500/20 text-sky-300' : 'bg-purple-500/20 text-purple-300'
                  }`}>
                    {acc.balanceNature}
                  </span>
                </div>
              </div>

              {/* Account Movements Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2 px-3 w-24">Fecha</th>
                      <th className="py-2 px-3 w-20 text-center">Asiento</th>
                      <th className="py-2 px-3">Descripción de la Operación</th>
                      {displayCurrency !== 'USD' && (
                        <>
                          <th className="py-2 px-3 text-right w-32">Debe (Bs.)</th>
                          <th className="py-2 px-3 text-right w-32">Haber (Bs.)</th>
                          <th className="py-2 px-3 text-right w-36">Saldo Acumulado (Bs.)</th>
                        </>
                      )}
                      {displayCurrency !== 'BS' && (
                        <>
                          <th className="py-2 px-3 text-right w-24 text-slate-600">Debe ($)</th>
                          <th className="py-2 px-3 text-right w-24 text-slate-600">Haber ($)</th>
                          <th className="py-2 px-3 text-right w-28 text-slate-600">Saldo ($)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {acc.movements.map((mov, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {formatDate(mov.date)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                            #{mov.entryNumber}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-medium max-w-md truncate">
                          {mov.description}
                        </td>
                        {displayCurrency !== 'USD' && (
                          <>
                            <td className="py-2 px-3 text-right font-mono font-medium text-slate-900">
                              {mov.debitBs > 0 ? formatBs(mov.debitBs) : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-medium text-slate-900">
                              {mov.creditBs > 0 ? formatBs(mov.creditBs) : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/40">
                              {formatBs(mov.runningBalanceBs)}
                            </td>
                          </>
                        )}
                        {displayCurrency !== 'BS' && (
                          <>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {mov.debitUsd > 0 ? formatUsd(mov.debitUsd) : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600">
                              {mov.creditUsd > 0 ? formatUsd(mov.creditUsd) : '-'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700 bg-slate-50/40">
                              {formatUsd(mov.runningBalanceUsd)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-900">
                      <td colSpan={3} className="py-2.5 px-3 text-right text-slate-700">
                        TOTALES DE LA CUENTA {acc.code}:
                      </td>
                      {displayCurrency !== 'USD' && (
                        <>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                            {formatBs(acc.totalDebitBs)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                            {formatBs(acc.totalCreditBs)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-900 bg-emerald-50/60 font-black">
                            {formatBs(acc.balanceBs)}
                          </td>
                        </>
                      )}
                      {displayCurrency !== 'BS' && (
                        <>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {formatUsd(acc.totalDebitUsd)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {formatUsd(acc.totalCreditUsd)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800 bg-slate-200/50">
                            {formatUsd(acc.balanceUsd)}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Official Signatures block (print-only) */}
      <div className="hidden print:grid grid-cols-2 gap-12 pt-12 pb-6 text-xs print-break-inside-avoid">
        <div className="text-center space-y-1">
          <div className="border-t border-black w-60 mx-auto pt-1"></div>
          <p className="font-bold uppercase text-[11px]">CONTADOR PÚBLICO COLEGIADO</p>
          <p className="text-[10px] text-slate-500">C.P.C. N° _________ • Firma y Sello</p>
        </div>
        <div className="text-center space-y-1">
          <div className="border-t border-black w-60 mx-auto pt-1"></div>
          <p className="font-bold uppercase text-[11px]">{currentCompany.name}</p>
          <p className="text-[10px] text-slate-500">REPRESENTANTE LEGAL / ADMINISTRADOR</p>
        </div>
      </div>
    </div>
  );
};
