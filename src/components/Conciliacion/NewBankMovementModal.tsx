import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { BankAccount, BankMovementType } from '../../types/accounting';
import { Landmark, X, Check } from 'lucide-react';
import { formatBs, formatUsd } from '../../utils/formatters';

interface NewBankMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccount: BankAccount;
}

export const NewBankMovementModal: React.FC<NewBankMovementModalProps> = ({
  isOpen,
  onClose,
  bankAccount
}) => {
  const { currentCompany, addBankStatementMovement } = useAccounting();

  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [type, setType] = useState<BankMovementType>('CREDIT');
  const [amountBs, setAmountBs] = useState<string>('');

  if (!isOpen) return null;

  const bcvRate = currentCompany.bcvRate || 68.50;
  const parsedAmountBs = Number(amountBs) || 0;
  const amountUsd = bcvRate > 0 ? parsedAmountBs / bcvRate : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedAmountBs <= 0) return;
    if (!description.trim()) return;

    addBankStatementMovement({
      bankAccountId: bankAccount.id,
      date,
      reference: reference.trim() || `REF-${Date.now().toString().slice(-6)}`,
      description: description.trim(),
      type,
      amountBs: parsedAmountBs,
      amountUsd: Number(amountUsd.toFixed(2)),
      isReconciled: false
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Registrar Movimiento en Extracto Bancario</h3>
              <p className="text-xs text-slate-400">{bankAccount.bankName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha del Movimiento *</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de Operación Bancaria *</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as BankMovementType)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="CREDIT">Crédito (+) Depósito / Cobranza</option>
                <option value="DEBIT">Débito (-) Pago / Comisión / Retiro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Número de Referencia / Cheque / Transferencia *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: 00008401, CHQ-1049, ND-89124"
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Concepto / Descripción del Banco *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Transferencia Interbancaria Recibida de Cliente..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Monto de la Operación (Bs.) *</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Bs.</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amountBs}
                onChange={e => setAmountBs(e.target.value)}
                className="w-full pl-10 pr-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold text-sm focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <span className="text-[11px] text-slate-500 font-mono mt-1 block">
              Equivalente en Divisa: {formatUsd(amountUsd)} (Tasa BCV: Bs. {bcvRate.toFixed(2)})
            </span>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={amountBs <= 0 || !description.trim()}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Guardar Movimiento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
