import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Landmark, X, Check } from 'lucide-react';

interface NewBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewBankAccountModal: React.FC<NewBankAccountModalProps> = ({ isOpen, onClose }) => {
  const { accounts, addBankAccount } = useAccounting();

  const [bankName, setBankName] = useState('');
  const [accountCode, setAccountCode] = useState('1.1.1.03');
  const [accountNumber, setAccountNumber] = useState('');
  const [currency, setCurrency] = useState<'BS' | 'USD'>('BS');
  const [initialBalanceBs, setInitialBalanceBs] = useState<number>(0);

  if (!isOpen) return null;

  // Filter bank asset accounts
  const bankAccountsList = accounts.filter(
    a => a.code.startsWith('1.1.1') && a.isMovement
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim()) return;

    addBankAccount({
      bankName: bankName.trim(),
      accountCode,
      accountNumber: accountNumber.trim() || '0000-0000-00-0000000000',
      currency,
      initialBalanceBs: Number(initialBalanceBs) || 0,
      initialBalanceUsd: currency === 'USD' ? Number(initialBalanceBs) : 0
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative z-[1001] pointer-events-auto bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Registrar Cuenta Bancaria</h3>
              <p className="text-xs text-slate-400">Vincular cuenta de banco para conciliación</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nombre de la Institución Bancaria *</label>
            <input
              type="text"
              required
              autoFocus
              autoComplete="organization"
              placeholder="Ej: Banco Provincial BBVA, Banco de Venezuela..."
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              className="pointer-events-auto select-text w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Cuenta Contable en Plan VEN-NIF *</label>
            <select
              value={accountCode}
              onChange={e => setAccountCode(e.target.value)}
              className="pointer-events-auto select-text w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              {bankAccountsList.map(a => (
                <option key={a.code} value={a.code}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Número de Cuenta Bancaria (20 dígitos)
            </label>
            <input
              type="text"
              placeholder="0102-0000-00-0000000000"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              className="pointer-events-auto select-text w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Moneda</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value as 'BS' | 'USD')}
                className="pointer-events-auto select-text w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="BS">Bolívares (Bs.)</option>
                <option value="USD">Dólares ($ USD)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Saldo Inicial en Libros</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={initialBalanceBs || ''}
                placeholder="0.00"
                onChange={e => setInitialBalanceBs(parseFloat(e.target.value) || 0)}
                className="pointer-events-auto select-text w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
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
              disabled={!bankName.trim()}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Guardar Cuenta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
