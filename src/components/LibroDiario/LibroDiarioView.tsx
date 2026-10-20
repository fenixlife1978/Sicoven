import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  BookOpen,
  Plus,
  Printer,
  Search,
  Filter,
  Trash2,
  CheckCircle2,
  FileSpreadsheet,
  Calendar,
  Layers
} from 'lucide-react';
import { formatBs, formatUsd, formatDate } from '../../utils/formatters';
import { NewEntryModal } from './NewEntryModal';
import { EntryType } from '../../types/accounting';

import { CompanyLogoHeader } from '../CompanyLogoHeader';
import { exportDiarioPdf } from '../../utils/pdfGenerator';
import { Download } from 'lucide-react';

export const LibroDiarioView: React.FC = () => {
  const { currentCompany, journalEntries, deleteJournalEntry, displayCurrency } = useAccounting();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Filter entries
  const filteredEntries = journalEntries
    .filter(entry => {
      if (typeFilter !== 'ALL' && entry.type !== typeFilter) return false;
      if (startDate && entry.date < startDate) return false;
      if (endDate && entry.date > endDate) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesDesc = entry.description.toLowerCase().includes(term);
        const matchesDoc = entry.referenceDoc?.toLowerCase().includes(term);
        const matchesItems = entry.items.some(
          it =>
            it.accountCode.toLowerCase().includes(term) ||
            it.accountName.toLowerCase().includes(term)
        );
        return matchesDesc || matchesDoc || matchesItems;
      }
      return true;
    })
    .sort((a, b) => a.entryNumber - b.entryNumber);

  // Overall totals
  const totalDebitsBs = filteredEntries.reduce(
    (acc, e) => acc + e.items.reduce((sum, it) => sum + (it.debitBs || 0), 0),
    0
  );
  const totalCreditsBs = filteredEntries.reduce(
    (acc, e) => acc + e.items.reduce((sum, it) => sum + (it.creditBs || 0), 0),
    0
  );
  const totalDebitsUsd = filteredEntries.reduce(
    (acc, e) => acc + e.items.reduce((sum, it) => sum + (it.debitUsd || 0), 0),
    0
  );
  const totalCreditsUsd = filteredEntries.reduce(
    (acc, e) => acc + e.items.reduce((sum, it) => sum + (it.creditUsd || 0), 0),
    0
  );

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportDiarioPdf(currentCompany, filteredEntries, displayCurrency);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const getTypeBadge = (type: EntryType, isAdjusted?: boolean) => {
    if (isAdjusted || type === 'AJUSTE') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
          Ajuste VEN-NIF
        </span>
      );
    }
    switch (type) {
      case 'APERTURA':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300">
            Apertura
          </span>
        );
      case 'COMPRA':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
            Compra (SENIAT)
          </span>
        );
      case 'VENTA':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
            Venta (SENIAT)
          </span>
        );
      case 'INVENTARIO':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 border border-cyan-300">
            Inventario
          </span>
        );
      case 'CIERRE':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
            Cierre
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
            Manual
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Official Header with Selected Company Logo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 print:border-none print:shadow-none print:p-0">
        <CompanyLogoHeader
          company={currentCompany}
          reportTitle="Libro Diario General"
          subtitle="Conforme al Código de Comercio de Venezuela y Normas de Información Financiera VEN-NIF (FCCPV)"
          periodText={`Ejercicio Económico ${currentCompany.fiscalYear}`}
        />

        {/* Action buttons (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Registros: <strong className="text-slate-900">{filteredEntries.length}</strong></span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">Partida Doble Verificada</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || filteredEntries.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300 shadow-sm"
              title="Descargar archivo PDF oficial con logo y márgenes normalizados"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              {isExportingPdf ? 'Generando PDF...' : 'Descargar PDF Oficial'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Libro
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow shadow-emerald-700/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nuevo Asiento
            </button>
          </div>
        </div>

        {/* Filters and search toolbar (no-print) */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-4 no-print">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar cuenta o glosa..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Todos los Tipos de Asientos</option>
              <option value="MANUAL">Asientos Manuales</option>
              <option value="APERTURA">Asientos de Apertura</option>
              <option value="COMPRA">Compras (Automáticos)</option>
              <option value="VENTA">Ventas (Automáticos)</option>
              <option value="INVENTARIO">Inventario / Kardex</option>
              <option value="AJUSTE">Ajustes VEN-NIF</option>
              <option value="CIERRE">Cierre</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              title="Fecha inicial"
            />
            <span className="text-slate-400 text-xs">a</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              title="Fecha final"
            />
          </div>

          {/* Quick Summary Pill */}
          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
            <span className="text-slate-500">
              Total Registros: <strong className="text-slate-800">{filteredEntries.length}</strong>
            </span>
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded font-medium border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Balance Cuadrado
            </span>
          </div>
        </div>
      </div>

      {/* Entries List */}
      <div className="space-y-4">
        {filteredEntries.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700">No se encontraron asientos contables</h3>
            <p className="text-xs text-slate-400 mt-1">
              {journalEntries.length === 0
                ? 'Comienza creando un nuevo asiento manual o registra compras y ventas.'
                : 'Prueba ajustando los filtros de búsqueda o fechas.'}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Crear Primer Asiento
            </button>
          </div>
        ) : (
          filteredEntries.map(entry => {
            const sumDebitBs = entry.items.reduce((s, it) => s + (it.debitBs || 0), 0);
            const sumCreditBs = entry.items.reduce((s, it) => s + (it.creditBs || 0), 0);
            const sumDebitUsd = entry.items.reduce((s, it) => s + (it.debitUsd || 0), 0);
            const sumCreditUsd = entry.items.reduce((s, it) => s + (it.creditUsd || 0), 0);

            return (
              <div
                key={entry.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print-break-inside-avoid"
              >
                {/* Entry Header */}
                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                      Asiento N° {entry.entryNumber}
                    </span>
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDate(entry.date)}
                    </span>
                    {getTypeBadge(entry.type, entry.isAdjusted)}
                    {entry.referenceDoc && (
                      <span className="text-[11px] text-slate-500 font-mono">
                        Ref: {entry.referenceDoc}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-500 font-mono-nums">
                      Tasa BCV: <span className="font-semibold text-slate-700">Bs. {entry.bcvRate.toFixed(2)}</span>
                    </div>
                    {/* Delete entry button (no-print) */}
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar asiento contable N° ${entry.entryNumber}?`)) {
                          deleteJournalEntry(entry.id);
                        }
                      }}
                      className="no-print p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      title="Eliminar asiento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Entry Description / Glosa */}
                <div className="px-4 py-2 bg-slate-50/30 text-xs font-medium text-slate-800 border-b border-slate-100">
                  <span className="text-slate-500 font-normal">Descripción: </span>
                  {entry.description}
                </div>

                {/* Entry Accounts Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 font-semibold bg-slate-50/40">
                        <th className="py-2 px-4 w-28">Código</th>
                        <th className="py-2 px-4">Cuenta Contable</th>
                        {displayCurrency !== 'USD' && (
                          <>
                            <th className="py-2 px-4 text-right w-36">Debe (Bs.)</th>
                            <th className="py-2 px-4 text-right w-36">Haber (Bs.)</th>
                          </>
                        )}
                        {displayCurrency !== 'BS' && (
                          <>
                            <th className="py-2 px-4 text-right w-28 text-slate-600">Debe ($)</th>
                            <th className="py-2 px-4 text-right w-28 text-slate-600">Haber ($)</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entry.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60 transition">
                          <td className="py-2 px-4 font-mono font-medium text-slate-700">
                            {item.accountCode}
                          </td>
                          <td className="py-2 px-4">
                            <span className="font-medium text-slate-800">{item.accountName}</span>
                            {item.description && (
                              <span className="block text-[11px] text-slate-400 italic">
                                {item.description}
                              </span>
                            )}
                          </td>
                          {displayCurrency !== 'USD' && (
                            <>
                              <td className="py-2 px-4 text-right font-mono font-medium text-slate-900">
                                {item.debitBs > 0 ? formatBs(item.debitBs) : '-'}
                              </td>
                              <td className="py-2 px-4 text-right font-mono font-medium text-slate-900">
                                {item.creditBs > 0 ? formatBs(item.creditBs) : '-'}
                              </td>
                            </>
                          )}
                          {displayCurrency !== 'BS' && (
                            <>
                              <td className="py-2 px-4 text-right font-mono text-slate-600">
                                {item.debitUsd > 0 ? formatUsd(item.debitUsd) : '-'}
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-slate-600">
                                {item.creditUsd > 0 ? formatUsd(item.creditUsd) : '-'}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100/60 font-bold border-t border-slate-200 text-slate-800">
                        <td colSpan={2} className="py-2.5 px-4 text-right text-slate-600">
                          TOTAL ASIENTO N° {entry.entryNumber}:
                        </td>
                        {displayCurrency !== 'USD' && (
                          <>
                            <td className="py-2.5 px-4 text-right font-mono text-emerald-800">
                              {formatBs(sumDebitBs)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-emerald-800">
                              {formatBs(sumCreditBs)}
                            </td>
                          </>
                        )}
                        {displayCurrency !== 'BS' && (
                          <>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                              {formatUsd(sumDebitUsd)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                              {formatUsd(sumCreditUsd)}
                            </td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Global Book Summary Footer */}
      {filteredEntries.length > 0 && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Total Acumulado del Período
            </div>
            <div className="text-sm font-bold text-slate-200 mt-0.5">
              {filteredEntries.length} Asientos Contables Registrados
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-right">
            <div>
              <div className="text-[11px] text-slate-400">Total Débitos (Debe):</div>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {formatBs(totalDebitsBs)}
              </div>
              <div className="text-xs font-mono text-slate-400">
                {formatUsd(totalDebitsUsd)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Total Créditos (Haber):</div>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {formatBs(totalCreditsBs)}
              </div>
              <div className="text-xs font-mono text-slate-400">
                {formatUsd(totalCreditsUsd)}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* New Entry Modal */}
      <NewEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};
