import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  RefreshCw,
  X,
  TrendingUp,
  AlertCircle,
  Check,
  Globe,
  Radio,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Clock,
  Sparkles,
  Sliders
} from 'lucide-react';
import { formatBs } from '../utils/formatters';

interface BcvRateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BcvRateModal: React.FC<BcvRateModalProps> = ({ isOpen, onClose }) => {
  const {
    currentCompany,
    updateBcvRate,
    isSyncingBcv,
    bcvSyncStatus,
    bcvSyncResult,
    syncBcvRate,
    autoSyncBcv,
    setAutoSyncBcv
  } = useAccounting();

  const [rate, setRate] = useState<number>(currentCompany.bcvRate || 881.06);
  const [effectiveDate, setEffectiveDate] = useState<string>(
    currentCompany.lastRateUpdate || new Date().toISOString().slice(0, 10)
  );
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (currentCompany.bcvRate) {
      setRate(currentCompany.bcvRate);
    }
    if (currentCompany.lastRateUpdate) {
      setEffectiveDate(currentCompany.lastRateUpdate);
    }
  }, [currentCompany]);

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    setSyncFeedback(null);
    const result = await syncBcvRate();
    if (result.success && result.usd > 0) {
      setRate(result.usd);
      if (result.effectiveDate) setEffectiveDate(result.effectiveDate);
      setSyncFeedback(`Sincronizado con éxito: Bs. ${result.usd.toFixed(4)} (Fecha valor: ${result.effectiveDate})`);
    } else {
      setSyncFeedback(`Error de sincronización: ${result.error || 'Verifique conexión'}`);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rate > 0) {
      updateBcvRate(Number(rate), effectiveDate);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white rounded-xl shadow-md">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">Tasa Oficial de Cambio BCV</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  Activo
                </span>
              </div>
              <p className="text-xs text-slate-400">Banco Central de Venezuela (Bs. / USD)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Sincronización con bcv.today Hero Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-700 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-xs font-bold tracking-wide uppercase text-slate-200">
                  Sincronización con bcv.today
                </span>
                <span className="bg-emerald-500 text-slate-950 text-[10px] font-black px-2 py-0.2 rounded-md">
                  ACTIVO
                </span>
              </div>
              <a
                href="https://bcv.today/api/rate.json"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition"
                title="Ver JSON oficial de bcv.today"
              >
                <span>API JSON</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800">
              <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                <span>Fuente Oficial API:</span>
                <span className="font-mono text-[10px] text-slate-300">https://bcv.today/api/rate.json</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 mt-1 border-t border-slate-800/80">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Dólar BCV (USD)</div>
                  <div className="text-xl font-bold font-mono text-emerald-400">
                    Bs. {currentCompany.bcvRate ? currentCompany.bcvRate.toFixed(4) : '---'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Fecha Valor / Vigencia</div>
                  <div className="text-xs font-semibold font-mono text-slate-200 mt-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {currentCompany.lastRateUpdate || 'Hoy'}
                  </div>
                </div>
              </div>

              {bcvSyncResult?.eur && (
                <div className="text-[11px] text-slate-400 pt-2 mt-2 border-t border-slate-800/60 flex items-center justify-between font-mono">
                  <span>Euro BCV (EUR):</span>
                  <span className="text-slate-200 font-semibold">Bs. {bcvSyncResult.eur.toFixed(4)}</span>
                </div>
              )}
            </div>

            {/* Sync Now Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  Última sincronización:{' '}
                  <strong className="text-slate-300">
                    {bcvSyncResult?.syncedAt || 'Automática'}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncingBcv}
                className="flex items-center justify-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBcv ? 'animate-spin' : ''}`} />
                {isSyncingBcv ? 'Sincronizando...' : 'Sincronizar ahora con bcv.today'}
              </button>
            </div>

            {syncFeedback && (
              <div
                className={`text-xs p-2 rounded-lg ${
                  syncFeedback.startsWith('Error')
                    ? 'bg-rose-950/70 text-rose-300 border border-rose-800'
                    : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                }`}
              >
                {syncFeedback}
              </div>
            )}
          </div>

          {/* Auto-Sync Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="text-xs font-bold text-slate-800">
                Sincronización automática de tasa al iniciar
              </div>
              <div className="text-[11px] text-slate-500">
                Actualiza de inmediato con la API oficial de bcv.today al abrir el sistema.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoSyncBcv(!autoSyncBcv)}
              className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition duration-200 ${
                autoSyncBcv ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                  autoSyncBcv ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* VEN-NIF NIC 21 Compliance Badge */}
          <div className="p-3 bg-emerald-50/80 border border-emerald-200/90 rounded-xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-emerald-900 leading-relaxed">
              <strong className="font-semibold text-emerald-950">Normas VEN-NIF (NIC 21) & SENIAT:</strong> Toda transacción en divisas debe ser convertida a la tasa oficial BCV correspondiente a la fecha de la operación, utilizándose como base imponible y para la emisión de retenciones y comprobantes oficiales.
            </div>
          </div>

          {/* Manual Override Accordion */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowManualOverride(!showManualOverride)}
              className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-semibold text-slate-700">
                  Ajuste Manual / Tasa Histórica Personalizada
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {showManualOverride ? 'Ocultar' : 'Modificar'}
              </span>
            </button>

            {showManualOverride && (
              <form onSubmit={handleManualSubmit} className="p-4 space-y-3 bg-white border-t border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Empresa Activa
                  </label>
                  <div className="text-xs font-semibold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    {currentCompany.name} ({currentCompany.rif})
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tasa Manual (Bs. / USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">Bs.</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        required
                        value={rate}
                        onChange={e => setRate(Number(e.target.value))}
                        className="w-full pl-9 pr-3 py-1.5 text-sm font-bold font-mono text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Fecha Valor Aplicable
                    </label>
                    <input
                      type="date"
                      required
                      value={effectiveDate}
                      onChange={e => setEffectiveDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-medium text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Fijar Tasa Manual
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
