import React, { useEffect, useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { X, TrendingUp, Check, Calendar, AlertCircle } from 'lucide-react';

interface BcvRateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * La tasa BCV se registra exclusivamente de forma manual.
 * SICOVEN no consulta proveedores externos ni sustituye la tasa ingresada por el usuario.
 */
export const BcvRateModal: React.FC<BcvRateModalProps> = ({ isOpen, onClose }) => {
  const { currentCompany, updateBcvRate } = useAccounting();
  const [rate, setRate] = useState<string>(currentCompany.bcvRate ? String(currentCompany.bcvRate) : '');
  const [effectiveDate, setEffectiveDate] = useState<string>(
    currentCompany.lastRateUpdate || new Date().toISOString().slice(0, 10)
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setRate(currentCompany.bcvRate ? String(currentCompany.bcvRate) : '');
    setEffectiveDate(currentCompany.lastRateUpdate || new Date().toISOString().slice(0, 10));
    setValidationError(null);
  }, [currentCompany]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedRate = rate.trim().replace(',', '.');
    const parsedRate = Number(normalizedRate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setValidationError('Ingrese una tasa BCV numérica mayor que cero.');
      return;
    }
    if (!effectiveDate || !/^\\d{4}-\\d{2}-\\d{2}$/.test(effectiveDate)) {
      setValidationError('Seleccione la fecha valor correspondiente a la tasa.');
      return;
    }
    updateBcvRate(parsedRate, effectiveDate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bcv-rate-title"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-600 p-2.5">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h3 id="bcv-rate-title" className="text-base font-bold">Tasa BCV manual</h3>
              <p className="text-xs text-slate-300">Registre la tasa y su fecha valor para esta empresa</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <p className="text-xs leading-relaxed text-sky-950">
                La tasa no se consulta ni se actualiza automáticamente. Verifique la publicación oficial del BCV e introduzca manualmente la tasa aplicable a la fecha de cada operación.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="bcv-rate-value" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Tasa de cambio (Bs. por USD)
            </label>
            <input
              id="bcv-rate-value"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              value={rate}
              onChange={event => { setRate(event.target.value); setValidationError(null); }}
              placeholder="Ej.: 875,2500"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div>
            <label htmlFor="bcv-rate-date" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Calendar className="h-3.5 w-3.5" />
              Fecha valor aplicable
            </label>
            <input
              id="bcv-rate-date"
              type="date"
              required
              value={effectiveDate}
              onChange={event => { setEffectiveDate(event.target.value); setValidationError(null); }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          {validationError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
              {validationError}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              Guardar tasa manual
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
