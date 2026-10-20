import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { JournalEntryItem, EntryType } from '../../types/accounting';
import {
  Plus,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Wand2,
  Info
} from 'lucide-react';
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
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    setSubmitError(null);
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
    setSubmitError(null);
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
    const defaultAcc = movementAccounts[0];
    setItems(prev => [
      ...prev,
      {
        accountCode: defaultAcc?.code || '1.1.1.01',
        accountName: defaultAcc?.name || 'Caja Principal',
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

  // Verificación de Asientos: Cálculos de balance
  const totalDebitBs = items.reduce((sum, item) => sum + (Number(item.debitBs) || 0), 0);
  const totalCreditBs = items.reduce((sum, item) => sum + (Number(item.creditBs) || 0), 0);
  const diffBs = Math.abs(totalDebitBs - totalCreditBs);
  const isBalanced = diffBs < 0.01 && totalDebitBs > 0;
  const isZeroTotal = totalDebitBs === 0 && totalCreditBs === 0;

  // Lado que falta para cuadrar
  const missingSide =
    isBalanced || isZeroTotal
      ? null
      : totalDebitBs > totalCreditBs
      ? 'HABER'
      : 'DEBE';

  // Reglas de Verificación de Asientos
  const rules = {
    partidaDoble: isBalanced,
    montoMayorCero: totalDebitBs > 0,
    minimoRenglones: items.length >= 2,
    cuentasValidas: items.every(it => !!it.accountCode && movementAccounts.some(a => a.code === it.accountCode)),
    sinDobleImputacion: items.every(it => !(it.debitBs > 0 && it.creditBs > 0)),
    glosaPresente: description.trim().length >= 3
  };

  const allRulesPassed =
    rules.partidaDoble &&
    rules.montoMayorCero &&
    rules.minimoRenglones &&
    rules.cuentasValidas &&
    rules.sinDobleImputacion &&
    rules.glosaPresente;

  // Función Inteligente: Auto-Cuadrar Asiento con un Clic
  const handleAutoBalance = () => {
    if (diffBs < 0.01) return;
    const rate = bcvRate > 0 ? bcvRate : 1;
    setSubmitError(null);

    if (totalDebitBs > totalCreditBs) {
      // Falta en el Haber
      const missingCredit = Number((totalDebitBs - totalCreditBs).toFixed(2));
      const lastIdx = items.length - 1;
      if (items[lastIdx].debitBs === 0 && items[lastIdx].creditBs === 0) {
        handleCreditChange(lastIdx, missingCredit);
      } else {
        const defaultAcc = movementAccounts[1] || movementAccounts[0];
        setItems(prev => [
          ...prev,
          {
            accountCode: defaultAcc?.code || '1.1.1.03',
            accountName: defaultAcc?.name || 'Banco Nacional de Crédito',
            debitBs: 0,
            creditBs: missingCredit,
            debitUsd: 0,
            creditUsd: Number((missingCredit / rate).toFixed(2)),
            description: 'Contrapartida de cuadre'
          }
        ]);
      }
    } else {
      // Falta en el Debe
      const missingDebit = Number((totalCreditBs - totalDebitBs).toFixed(2));
      const lastIdx = items.length - 1;
      if (items[lastIdx].debitBs === 0 && items[lastIdx].creditBs === 0) {
        handleDebitChange(lastIdx, missingDebit);
      } else {
        const defaultAcc = movementAccounts[0];
        setItems(prev => [
          ...prev,
          {
            accountCode: defaultAcc?.code || '1.1.1.01',
            accountName: defaultAcc?.name || 'Caja Principal',
            debitBs: missingDebit,
            creditBs: 0,
            debitUsd: Number((missingDebit / rate).toFixed(2)),
            creditUsd: 0,
            description: 'Contrapartida de cuadre'
          }
        ]);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Verificación estricta de cuadre antes de guardar
    if (!isBalanced) {
      setSubmitError(
        `Verificación de Asiento Bloqueada: El asiento está descuadrado por ${formatBs(diffBs)}. La suma del Debe (${formatBs(totalDebitBs)}) debe ser idéntica al Haber (${formatBs(totalCreditBs)}).`
      );
      return;
    }

    if (!description.trim()) {
      setSubmitError('Debe ingresar la descripción o glosa del asiento contable.');
      return;
    }

    try {
      addJournalEntry({
        entryNumber: 0, // calculado automáticamente
        date,
        description: description.trim(),
        type,
        bcvRate,
        items,
        isAdjusted: type === 'AJUSTE' || isAdjusted,
        referenceDoc: referenceDoc.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Error al guardar el asiento contable.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header con estatus de verificación */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex-shrink-0">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base text-slate-100">
                Nuevo Asiento Contable
              </h3>
              {/* Badge de Verificación de Asiento */}
              {isBalanced ? (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Asiento Cuadrado
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  Descuadre: {formatBs(diffBs)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">
              Libro Diario General • Verificación Automática VEN-NIF • {currentCompany.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Banner de error de validación si existe */}
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{submitError}</div>
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                className="text-rose-500 hover:text-rose-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Form fields */}
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
                onChange={e => setType(e.target.value as EntryType)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="MANUAL">Asiento Manual</option>
                <option value="APERTURA">Asiento de Apertura</option>
                <option value="AJUSTE">Asiento de Ajuste (VEN-NIF)</option>
                <option value="CIERRE">Asiento de Cierre</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tasa Oficial BCV ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={bcvRate}
                onChange={e => setBcvRate(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
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
              placeholder="Detalle claro de la operación contable realizada..."
              value={description}
              onChange={e => {
                setDescription(e.target.value);
                setSubmitError(null);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-semibold whitespace-nowrap">
                    <th className="py-2.5 px-3 min-w-[240px]">Cuenta Contable (Plan VEN-NIF)</th>
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
                          className={`w-full text-right p-1.5 border rounded text-xs font-mono font-medium focus:ring-1 focus:outline-none ${
                            item.debitBs > 0
                              ? 'border-emerald-400 bg-emerald-50/20 text-emerald-900 font-bold focus:ring-emerald-500'
                              : 'border-slate-300'
                          }`}
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
                          className={`w-full text-right p-1.5 border rounded text-xs font-mono font-medium focus:ring-1 focus:outline-none ${
                            item.creditBs > 0
                              ? 'border-emerald-400 bg-emerald-50/20 text-emerald-900 font-bold focus:ring-emerald-500'
                              : 'border-slate-300'
                          }`}
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
                          title="Eliminar renglón"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
                    <td className="p-3 text-slate-800">
                      SUMAS IGUALES DE PARTIDA DOBLE:
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-800 text-sm">
                      {formatBs(totalDebitBs)}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-800 text-sm">
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

            {/* Table actions bar */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar Renglón
              </button>

              {/* Botón de Auto-Cuadrar Asiento con 1 Clic */}
              {!isBalanced && diffBs > 0 && (
                <button
                  type="button"
                  onClick={handleAutoBalance}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition shadow-sm cursor-pointer"
                  title="Ajusta o crea automáticamente la contrapartida con la diferencia exacta"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-700" />
                  Auto-Cuadrar en {missingSide} ({formatBs(diffBs)})
                </button>
              )}
            </div>
          </div>

          {/* PANEL DE VERIFICACIÓN DE ASIENTOS CONTABLES */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Panel de Verificación de Asiento (Validación Automática)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                {showDiagnostics ? 'Ocultar Criterios' : 'Ver Criterios'}
              </button>
            </div>

            {/* Live Status Card */}
            <div
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isBalanced
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                  : isZeroTotal
                  ? 'bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-rose-50/90 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {isBalanced ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : isZeroTotal ? (
                  <Info className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5 animate-bounce" />
                )}
                <div>
                  <div className="font-bold text-xs sm:text-sm">
                    {isBalanced
                      ? '✓ Asiento Verificado y Cuadrado'
                      : isZeroTotal
                      ? 'Sin montos registrados'
                      : `⚠ Asiento Descuadrado: Falta registrar en el ${missingSide}`}
                  </div>
                  <p className="text-[11px] opacity-85 mt-0.5">
                    {isBalanced
                      ? 'Los débitos y créditos son idénticos. La partida doble se cumple rigurosamente.'
                      : isZeroTotal
                      ? 'Ingrese los montos en los renglones correspondientes para validar la partida doble.'
                      : `Diferencia pendiente por cuadrar: ${formatBs(diffBs)} (${formatUsd(diffBs / (bcvRate || 1))}). El guardado está bloqueado hasta que la diferencia sea cero.`}
                  </p>
                </div>
              </div>

              {/* Metric pills */}
              <div className="flex items-center gap-2 self-end sm:self-auto text-xs font-mono font-semibold">
                <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-slate-300/80 shadow-xs">
                  Debe: {formatBs(totalDebitBs)}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-slate-300/80 shadow-xs">
                  Haber: {formatBs(totalCreditBs)}
                </span>
              </div>
            </div>

            {/* Diagnostic Checklist */}
            {showDiagnostics && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    rules.partidaDoble
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {rules.partidaDoble ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>
                    <strong>Partida Doble:</strong> Débitos = Créditos (Δ = {formatBs(diffBs)})
                  </span>
                </div>

                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    rules.montoMayorCero
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {rules.montoMayorCero ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                  <span>
                    <strong>Importe Positivo:</strong> Total mayor a Bs. 0,00
                  </span>
                </div>

                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    rules.cuentasValidas
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {rules.cuentasValidas ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>
                    <strong>Plan de Cuentas:</strong> Cuentas de movimiento válidas
                  </span>
                </div>

                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    rules.glosaPresente
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {rules.glosaPresente ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  )}
                  <span>
                    <strong>Glosa Explicativa:</strong> Descripción del asiento
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions with strict save locking */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              {isBalanced ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Listo para asentar en el Libro Diario Oficial.
                </span>
              ) : (
                <span className="text-rose-700 font-medium flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Guardado bloqueado hasta verificar igualdad de débitos y créditos.
                </span>
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
                type="submit"
                disabled={!allRulesPassed}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow transition ${
                  allRulesPassed
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-700/20'
                    : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60'
                }`}
                title={
                  allRulesPassed
                    ? 'Asiento cuadrado y verificado. Haga clic para guardar.'
                    : 'Guardado bloqueado: el asiento contable no está cuadrado o faltan campos obligatorios.'
                }
              >
                {allRulesPassed ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>Guardar Asiento Cuadrado</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>Guardado Bloqueado (Descuadrado)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
