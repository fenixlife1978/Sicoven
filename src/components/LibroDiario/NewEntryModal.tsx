import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { JournalEntryItem, EntryType } from '../../types/accounting';
import { Plus, Trash2, X, Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatBs, formatUsd } from '../../utils/formatters';

interface NewEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewEntryModal: React.FC<NewEntryModalProps> = ({ isOpen, onClose }) => {
  const { currentCompany, accounts, addJournalEntry } = useAccounting();

  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('');
  const [type, setType] = useState<EntryType>('MANUAL');
  const [bcvRate, setBcvRate] = useState<number>(currentCompany.bcvRate || 68.50);
  const [referenceDoc, setReferenceDoc] = useState<string>('');
  const [isAdjusted, setIsAdjusted] = useState<boolean>(false);

  // Movement accounts only
  const movementAccounts = accounts.filter(a => a.isMovement);

  const [items, setItems] = useState<JournalEntryItem[]>([
    {
      accountCode: movementAccounts[0]?.code || '1.1.1.01',
      accountName: movementAccounts[0]?.name || 'Caja Principal (Moneda Nacional Bs.)',
      debitBs: 0,
      creditBs: 0,
      debitUsd: 0,
      creditUsd: 0,
      description: ''
    },
    {
      accountCode: movementAccounts[1]?.code || '1.1.1.03',
      accountName: movementAccounts[1]?.name || 'Banco Nacional de Crédito - Cta. Corriente Bs.',
      debitBs: 0,
      creditBs: 0,
      debitUsd: 0,
      creditUsd: 0,
      description: ''
    }
  ]);

  if (!isOpen) return null;

  const handleAccountChange = (index: number, code: string) => {
    const acc = movementAccounts.find(a => a.code === code);
    setItems(prev =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              accountCode: code,
              accountName: acc ? acc.name : item.accountName
            }
          : item
      )
    );
  };

  const handleDebitChange = (index: number, val: number) => {
    const rate = bcvRate > 0 ? bcvRate : 1;
    setItems(prev =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              debitBs: val,
              debitUsd: Number((val / rate).toFixed(2)),
              creditBs: 0,
              creditUsd: 0
            }
          : item
      )
    );
  };

  const handleCreditChange = (index: number, val: number) => {
    const rate = bcvRate > 0 ? bcvRate : 1;
    setItems(prev =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              creditBs: val,
              creditUsd: Number((val / rate).toFixed(2)),
              debitBs: 0,
              debitUsd: 0
            }
          : item
      )
    );
  };

  const addRow = () => {
    const firstAcc = movementAccounts[0];
    setItems(prev => [
      ...prev,
      {
        accountCode: firstAcc?.code || '1.1.1.01',
        accountName: firstAcc?.name || 'Caja Principal',
        debitBs: 0,
        creditBs: 0,
        debitUsd: 0,
        creditUsd: 0,
        description: ''
      }
    ]);
  };

  const removeRow = (index: number) => {
    if (items.length <= 2) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalDebitBs = items.reduce((sum, item) => sum + (Number(item.debitBs) || 0), 0);
  const totalCreditBs = items.reduce((sum, item) => sum + (Number(item.creditBs) || 0), 0);
  const diffBs = Math.abs(totalDebitBs - totalCreditBs);
  const isBalanced = diffBs < 0.01 && totalDebitBs > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) return;
    if (!description.trim()) return;

    addJournalEntry({
      entryNumber: 0, // context will calculate next
      date,
      description: description.trim(),
      type,
      bcvRate,
      items,
      isAdjusted: type === 'AJUSTE' || isAdjusted,
      referenceDoc: referenceDoc.trim() || undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white flex-shrink-0">
          <div>
            <h3 className="font-semibold text-base">Nuevo Asiento Contable</h3>
            <p className="text-xs text-slate-400">
              Libro Diario General • Partida Doble VEN-NIF • Empresa: {currentCompany.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Fecha del Asiento *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tipo de Asiento
              </label>
              <select
                value={type}
                onChange={e => {
                  const val = e.target.value as EntryType;
                  setType(val);
                  if (val === 'AJUSTE') setIsAdjusted(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="MANUAL">Operativo / Manual</option>
                <option value="APERTURA">Asiento de Apertura</option>
                <option value="AJUSTE">Asiento de Ajuste (VEN-NIF)</option>
                <option value="CIERRE">Asiento de Cierre Anual</option>
                <option value="INVENTARIO">Inventario / Kardex</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tasa BCV Aplicable (Bs/$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={bcvRate}
                onChange={e => setBcvRate(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                N° Documento Ref.
              </label>
              <input
                type="text"
                placeholder="Ej: CHQ-1049, OP-04"
                value={referenceDoc}
                onChange={e => setReferenceDoc(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descripción o Glosa del Asiento *
            </label>
            <input
              type="text"
              required
              placeholder="Detalle de la operación contable realizada..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold">
                    <th className="py-2.5 px-3 w-64">Cuenta Contable (VEN-NIF)</th>
                    <th className="py-2.5 px-3 text-right w-36">Debe (Bs.)</th>
                    <th className="py-2.5 px-3 text-right w-36">Haber (Bs.)</th>
                    <th className="py-2.5 px-3 text-right w-28 text-slate-500">Debe ($)</th>
                    <th className="py-2.5 px-3 text-right w-28 text-slate-500">Haber ($)</th>
                    <th className="py-2.5 px-2 text-center w-12">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="p-2">
                        <select
                          value={item.accountCode}
                          onChange={e => handleAccountChange(idx, e.target.value)}
                          className="w-full p-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none truncate"
                        >
                          {movementAccounts.map(acc => (
                            <option key={acc.code} value={acc.code}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.debitBs || ''}
                          placeholder="0,00"
                          onChange={e => handleDebitChange(idx, parseFloat(e.target.value) || 0)}
                          className="w-full text-right p-1.5 border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.creditBs || ''}
                          placeholder="0,00"
                          onChange={e => handleCreditChange(idx, parseFloat(e.target.value) || 0)}
                          className="w-full text-right p-1.5 border border-slate-300 rounded text-xs font-mono font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </td>
                      <td className="p-2 text-right font-mono text-slate-600 bg-slate-50/50">
                        {item.debitUsd > 0 ? formatUsd(item.debitUsd) : '-'}
                      </td>
                      <td className="p-2 text-right font-mono text-slate-600 bg-slate-50/50">
                        {item.creditUsd > 0 ? formatUsd(item.creditUsd) : '-'}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          disabled={items.length <= 2}
                          className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/80 font-bold border-t border-slate-300">
                    <td className="p-3 text-slate-700">SUMAS IGUALES:</td>
                    <td className="p-3 text-right font-mono text-emerald-700">
                      {formatBs(totalDebitBs)}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-700">
                      {formatBs(totalCreditBs)}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-600">
                      {formatUsd(totalDebitBs / (bcvRate || 1))}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-600">
                      {formatUsd(totalCreditBs / (bcvRate || 1))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar Renglón
              </button>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Asiento Cuadrado (Partida Doble Cumplida)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-100 px-3 py-1 rounded-full border border-rose-300">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Descuadrado por: {formatBs(diffBs)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isBalanced || !description.trim()}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Guardar Asiento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
