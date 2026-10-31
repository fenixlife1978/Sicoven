import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {
  Settings,
  Building2,
  Save,
  Download,
  Upload,
  RotateCcw,
  Plus,
  CheckCircle2,
  ShieldCheck,
  Scale,
  RefreshCw,
  Info,
  AlertCircle,
  CalendarCheck,
  LockKeyhole
} from 'lucide-react';
import { TaxpayerType, JournalEntryItem } from '../../types/accounting';
import { buildOpeningEntryItems } from '../../types/accountingYearOpening';
import { CompanyModal } from '../CompanyModal';
import { BcvRateModal } from '../BcvRateModal';
import { formatBs, validateVenezuelanRif } from '../../utils/formatters';
import { MigracionInteligente } from './MigracionInteligente';

export const ConfiguracionView: React.FC = () => {
  const {
    companies,
    currentCompany,
    setCurrentCompanyId,
    updateCompany,
    resetToSampleData,
    resetFactoryData,
    exportBackupJson,
    restoreBackupJson,
    closeAccountingPeriod,
    createAccountingYearOpening,
    accounts,
    journalEntries,
    isStorageReady
  } = useAccounting();

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isBcvModalOpen, setIsBcvModalOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [factoryResetBusy, setFactoryResetBusy] = useState(false);
  const [factoryResetStage, setFactoryResetStage] = useState('');
  const [backupRestoreBusy, setBackupRestoreBusy] = useState(false);
  const [periodCloseDate, setPeriodCloseDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
  const [periodCloseBusy, setPeriodCloseBusy] = useState(false);
  const [openingPeriodStart, setOpeningPeriodStart] = useState(() => String(currentCompany.fiscalYear) + '-01-01');
  const [openingPeriodEnd, setOpeningPeriodEnd] = useState(currentCompany.closedThroughDate || (String(currentCompany.fiscalYear) + '-12-31'));
  const [openingDate, setOpeningDate] = useState(() => {
    const end = currentCompany.closedThroughDate || (String(currentCompany.fiscalYear) + '-12-31');
    const date = new Date(end + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [retainedEarningsAccountCode, setRetainedEarningsAccountCode] = useState('');
  const [openingPreview, setOpeningPreview] = useState<JournalEntryItem[] | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);

  // Form state for current company editing
  const [name, setName] = useState(currentCompany.name);
  const [tradeName, setTradeName] = useState(currentCompany.tradeName || '');
  const [rif, setRif] = useState(currentCompany.rif);
  const [rifError, setRifError] = useState<string | null>(null);
  const [taxpayerType, setTaxpayerType] = useState<TaxpayerType>(currentCompany.taxpayerType);
  const [defaultIvaRetentionRate, setDefaultIvaRetentionRate] = useState<number>(
    currentCompany.defaultIvaRetentionRate
  );
  const [isIgtfPerceptionAgent, setIsIgtfPerceptionAgent] = useState<boolean>(currentCompany.isIgtfPerceptionAgent === true);
  const [address, setAddress] = useState(currentCompany.address);
  const [phone, setPhone] = useState(currentCompany.phone);
  const [email, setEmail] = useState(currentCompany.email);
  const [fiscalYear, setFiscalYear] = useState(currentCompany.fiscalYear);
  const [bcvRate, setBcvRate] = useState(String(currentCompany.bcvRate));

  // Sync state if currentCompany switches
  React.useEffect(() => {
    setName(currentCompany.name);
    setTradeName(currentCompany.tradeName || '');
    setRif(currentCompany.rif);
    setRifError(null);
    setTaxpayerType(currentCompany.taxpayerType);
    setDefaultIvaRetentionRate(currentCompany.defaultIvaRetentionRate);
    setIsIgtfPerceptionAgent(currentCompany.isIgtfPerceptionAgent === true);
    setAddress(currentCompany.address);
    setPhone(currentCompany.phone);
    setEmail(currentCompany.email);
    setFiscalYear(currentCompany.fiscalYear);
    setBcvRate(String(currentCompany.bcvRate));
    setPeriodCloseDate(currentCompany.closedThroughDate || (() => {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    })());
  }, [currentCompany]);

  React.useEffect(() => {
    const start = String(currentCompany.fiscalYear) + '-01-01';
    const end = currentCompany.closedThroughDate || (String(currentCompany.fiscalYear) + '-12-31');
    const next = new Date(end + 'T00:00:00.000Z');
    next.setUTCDate(next.getUTCDate() + 1);
    setOpeningPeriodStart(start);
    setOpeningPeriodEnd(end);
    setOpeningDate(next.toISOString().slice(0, 10));
    setRetainedEarningsAccountCode('');
    setOpeningPreview(null);
    setOpeningError(null);
  }, [currentCompany.id, currentCompany.fiscalYear, currentCompany.closedThroughDate]);

  React.useEffect(() => {
    setOpeningPreview(null);
    setOpeningError(null);
  }, [accounts, journalEntries]);

  const handlePreviewOpening = () => {
    setOpeningError(null);
    setOpeningPreview(null);
    try {
      if (!currentCompany.closedThroughDate || openingPeriodEnd !== currentCompany.closedThroughDate) {
        throw new Error('Cierre primero el ejercicio y use como fecha final el cierre confirmado de esta empresa.');
      }
      const preview = buildOpeningEntryItems({
        companyId: currentCompany.id,
        periodStartDate: openingPeriodStart,
        periodEndDate: openingPeriodEnd,
        openingDate,
        accounts,
        journalEntries,
        retainedEarningsAccountCode: retainedEarningsAccountCode || undefined
      });
      setOpeningPreview(preview);
    } catch (error) {
      setOpeningError(error instanceof Error ? error.message : 'No se pudo preparar la vista previa del asiento.');
    }
  };

  const handlePostOpening = async () => {
    if (!openingPreview) {
      setOpeningError('Genere y revise la vista previa antes de registrar el asiento.');
      return;
    }
    const totals = openingPreview.reduce((sum, item) => ({
      debitBs: sum.debitBs + item.debitBs, creditBs: sum.creditBs + item.creditBs,
      debitUsd: sum.debitUsd + item.debitUsd, creditUsd: sum.creditUsd + item.creditUsd
    }), { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 });
    const confirmed = window.confirm(
      'REGISTRAR ASIENTO DE APERTURA\\n\\nEmpresa: ' + currentCompany.name +
      '\\nFecha: ' + openingDate +
      '\\nTotal debe: Bs. ' + totals.debitBs.toFixed(2) + ' / $ ' + totals.debitUsd.toFixed(6) +
      '\\nTotal haber: Bs. ' + totals.creditBs.toFixed(2) + ' / $ ' + totals.creditUsd.toFixed(6) +
      '\\n\\nEl asiento se guardará en SQLite y quedará registrado en la bitácora. Esta acción no se ejecuta automáticamente. ¿Confirma?'
    );
    if (!confirmed) return;
    setOpeningBusy(true);
    setOpeningError(null);
    try {
      const created = await createAccountingYearOpening({
        periodStartDate: openingPeriodStart,
        periodEndDate: openingPeriodEnd,
        openingDate,
        retainedEarningsAccountCode: retainedEarningsAccountCode || undefined
      });
      setOpeningPreview(null);
      alert('Asiento de apertura #' + created.entryNumber + ' registrado y confirmado por SQLite. La bitácora fue actualizada.');
    } catch (error) {
      setOpeningError(error instanceof Error ? error.message : 'SQLite no confirmó el asiento de apertura.');
    } finally {
      setOpeningBusy(false);
    }
  };

  const handleRifChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setRif(val);
    if (rifError) {
      const res = validateVenezuelanRif(val);
      setRifError(res.error);
    }
  };

  const handleRifBlur = () => {
    const res = validateVenezuelanRif(rif);
    setRifError(res.error);
    if (res.isValid) {
      setRif(res.formattedRif);
    }
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    const rifValidation = validateVenezuelanRif(rif);
    if (!rifValidation.isValid) {
      setRifError(rifValidation.error);
      return;
    }
    setRifError(null);
    updateCompany({
      ...currentCompany,
      name: name.trim().toUpperCase(),
      tradeName: tradeName.trim() || undefined,
      rif: rifValidation.formattedRif,
      taxpayerType,
      defaultIvaRetentionRate: taxpayerType === 'ESPECIAL' ? defaultIvaRetentionRate : 0,
      isIgtfPerceptionAgent,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      fiscalYear: Number(fiscalYear),
      bcvRate: Number(bcvRate)
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleExportBackup = () => {
    const jsonStr = exportBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SICOVEN_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const confirmed = window.confirm(
      'RESTAURAR COPIA DE SEGURIDAD SICOVEN\n\nEsta operación reemplazará todas las empresas y sus datos contables actuales (asientos, compras, ventas, inventario, movimientos, retenciones, bancos y liquidaciones) por el contenido del archivo. No se puede deshacer.\n\n¿Deseas continuar?'
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async event => {
      const content = event.target?.result as string;
      if (!content) {
        alert('El archivo de respaldo está vacío o no se pudo leer.');
        return;
      }
      setBackupRestoreBusy(true);
      try {
        const ok = await restoreBackupJson(content);
        if (!ok) {
          alert('No se pudo validar el respaldo. No se confirmó la restauración.');
          return;
        }
        alert('¡Copia de seguridad restaurada y guardada correctamente en SQLite!');
      } catch (error) {
        console.error('No se pudo confirmar la restauración del respaldo en SQLite:', error);
        alert('La restauración no pudo confirmarse en SQLite. No continúe trabajando hasta revisar el estado de la base de datos.');
      } finally {
        setBackupRestoreBusy(false);
        input.value = '';
      }
    };
    reader.onerror = () => {
      input.value = '';
      alert('No se pudo leer el archivo de respaldo.');
    };
    reader.readAsText(file);
  };

  const handleCloseAccountingPeriod = async () => {
    if (!periodCloseDate) {
      alert('Seleccione la fecha hasta la cual desea cerrar la contabilidad.');
      return;
    }
    const confirmed = window.confirm(
      'CIERRE CONTABLE DEL PERÍODO\\n\\nSe bloquearán en SQLite las nuevas operaciones retroactivas con fecha igual o anterior a ' +
      periodCloseDate +
      '. El cierre no puede retrocederse desde esta pantalla; una reapertura requerirá un procedimiento formal y auditado.\\n\\n¿Confirma el cierre?'
    );
    if (!confirmed) return;
    setPeriodCloseBusy(true);
    try {
      await closeAccountingPeriod(periodCloseDate);
      alert('Cierre contable guardado y confirmado por SQLite hasta el ' + periodCloseDate + '.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'SQLite no confirmó el cierre contable. No continúe hasta revisar el estado de almacenamiento.');
    } finally {
      setPeriodCloseBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Parámetros Globales
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-600">Multi-Empresa</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              Configuración del Sistema Contable
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
              Gestión de empresas independientes, tasa oficial del BCV, calificación SENIAT y respaldos de datos.
            </p>
          </div>

          <button
            onClick={() => setIsCompanyModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nueva Empresa
          </button>
        </div>

        {/* Multi-Company Selector Card List */}
        <div className="pt-6">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
            Empresas Registradas en el Sistema ({companies.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {companies.map(c => {
              const isActive = c.id === currentCompany.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setCurrentCompanyId(c.id)}
                  className={`p-4 rounded-xl border transition cursor-pointer relative ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className="font-mono text-xs font-bold text-slate-700">{c.rif}</span>
                    </div>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3" /> Activa
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 mt-2 truncate" title={c.name}>
                    {c.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      c.taxpayerType === 'ESPECIAL' ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'
                    }`}>
                      {c.taxpayerType === 'ESPECIAL' ? 'Contribuyente Especial' : 'Contribuyente Ordinario'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      BCV: Bs. {c.bcvRate.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit Active Company Details */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h3 className="font-bold text-base text-slate-900">
              Datos Fiscales de la Empresa Activa
            </h3>
            <p className="text-xs text-slate-500">
              {currentCompany.name} ({currentCompany.rif})
            </p>
          </div>
          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Cambios Guardados
            </span>
          )}
        </div>

        <form onSubmit={handleSaveCompany} className="pt-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">RIF Oficial</label>
                <span className="text-[10px] text-slate-400 font-mono">[V,J,G,E,P]</span>
              </div>
              <input
                type="text"
                required
                value={rif}
                onChange={handleRifChange}
                onBlur={handleRifBlur}
                maxLength={14}
                className={`w-full px-3 py-1.5 border rounded-lg font-mono uppercase focus:outline-none transition ${
                  rifError
                    ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-1 focus:ring-rose-500'
                    : 'border-slate-300 focus:ring-1 focus:ring-emerald-500'
                }`}
              />
              {rifError && (
                <p className="mt-1 text-[11px] text-rose-600 flex items-start gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{rifError}</span>
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Razón Social</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg uppercase focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Calificación SENIAT</label>
              <select
                value={taxpayerType}
                onChange={e => {
                  const val = e.target.value as TaxpayerType;
                  setTaxpayerType(val);
                  if (val === 'ORDINARIO') setDefaultIvaRetentionRate(0);
                  else if (defaultIvaRetentionRate === 0) setDefaultIvaRetentionRate(75);
                }}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="ESPECIAL">Contribuyente Especial (Agente Retención)</option>
                <option value="ORDINARIO">Contribuyente Ordinario</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Retención IVA por Defecto</label>
              <select
                disabled={taxpayerType !== 'ESPECIAL'}
                value={defaultIvaRetentionRate}
                onChange={e => setDefaultIvaRetentionRate(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-50 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              >
                <option value={75}>75% (General)</option>
                <option value={100}>100%</option>
                <option value={0}>0%</option>
              </select>
            </div>
            <div className="sm:col-span-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <label className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
                <input type="checkbox" checked={isIgtfPerceptionAgent} onChange={e => setIsIgtfPerceptionAgent(e.target.checked)} className="mt-0.5" />
                <span><strong>Empresa designada agente de percepción del IGTF</strong><span className="block text-xs text-slate-600 mt-1">Actívelo únicamente si la designación aplica legalmente a esta empresa. Este parámetro habilita el cálculo en las facturas elegibles.</span></span>
              </label>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tasa Oficial BCV (Bs/$)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={bcvRate}
                  onChange={e => setBcvRate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Dirección Fiscal Completa</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-200">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Guardar Parámetros de Empresa
            </button>
          </div>
        </form>
      </div>

      {/* Cierre contable y control de períodos */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-2">
            <LockKeyhole className="w-5 h-5 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-slate-900">Cierre contable y bloqueo de períodos</h3>
            <p className="text-xs text-slate-500 mt-1">
              El cierre se registra en SQLite para esta empresa. Las nuevas operaciones retroactivas hasta la fecha cerrada serán rechazadas en la persistencia local.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cerrar operaciones hasta</label>
            <input
              type="date"
              value={periodCloseDate}
              min={currentCompany.closedThroughDate || undefined}
              max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
              onChange={e => setPeriodCloseDate(e.target.value)}
              disabled={periodCloseBusy || !isStorageReady}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={handleCloseAccountingPeriod}
            disabled={periodCloseBusy || !isStorageReady || !periodCloseDate}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarCheck className="w-4 h-4" />
            {periodCloseBusy ? 'Confirmando en SQLite…' : currentCompany.closedThroughDate ? 'Actualizar fecha de cierre' : 'Cerrar período'}
          </button>
        </div>
        <div className={`rounded-lg border p-3 text-xs ${currentCompany.closedThroughDate ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {currentCompany.closedThroughDate
            ? <><strong>Cierre vigente:</strong> operaciones hasta {currentCompany.closedThroughDate}. La fecha solo puede avanzarse desde esta pantalla.</>
            : <><strong>Sin cierre registrado.</strong> La empresa todavía no tiene un período bloqueado.</>}
        </div>
        {!isStorageReady && <p className="text-xs text-rose-700">El almacenamiento SQLite no está disponible. El cierre permanece deshabilitado.</p>}
      </div>

      {/* Preparación y registro controlado del asiento de apertura */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2">
            <CalendarCheck className="w-5 h-5 text-indigo-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-slate-900">Apertura del siguiente ejercicio</h3>
            <p className="text-xs text-slate-500 mt-1">
              Prepara los saldos patrimoniales y el resultado del ejercicio cerrado. La apertura solo se registra después de revisar la vista previa y confirmar; no se genera automáticamente.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Inicio del ejercicio</label>
            <input type="date" value={openingPeriodStart} onChange={e => setOpeningPeriodStart(e.target.value)} disabled={openingBusy || !isStorageReady} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cierre del ejercicio</label>
            <input type="date" value={openingPeriodEnd} onChange={e => setOpeningPeriodEnd(e.target.value)} disabled={openingBusy || !isStorageReady || Boolean(currentCompany.closedThroughDate)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha de apertura</label>
            <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} disabled={openingBusy || !isStorageReady} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Cuenta patrimonial para resultado</label>
            <select value={retainedEarningsAccountCode} onChange={e => setRetainedEarningsAccountCode(e.target.value)} disabled={openingBusy || !isStorageReady} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100">
              <option value="">Seleccionar si hay resultado del ejercicio</option>
              {accounts.filter(account => account.type === 'PATRIMONIO' && account.isMovement).map(account => (
                <option key={account.code} value={account.code}>{account.code} — {account.name}</option>
              ))}
            </select>
          </div>
        </div>
        {!currentCompany.closedThroughDate && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Para preparar la apertura, primero debe existir un cierre contable confirmado en SQLite para esta empresa.
          </p>
        )}
        {openingError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{openingError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handlePreviewOpening} disabled={openingBusy || !isStorageReady || !currentCompany.closedThroughDate} className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            Preparar vista previa
          </button>
          <button type="button" onClick={handlePostOpening} disabled={openingBusy || !openingPreview || !isStorageReady} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {openingBusy ? 'Guardando y verificando SQLite…' : 'Confirmar y registrar apertura'}
          </button>
        </div>
        {openingPreview && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold text-slate-800">Vista previa — {openingPreview.length} líneas</p>
              <p className="text-[11px] text-slate-500">No se ha contabilizado todavía. Revise ambas monedas antes de confirmar.</p>
            </div>
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Cuenta</th>
                  <th className="px-3 py-2 text-right">Debe Bs.</th>
                  <th className="px-3 py-2 text-right">Haber Bs.</th>
                  <th className="px-3 py-2 text-right">Debe USD</th>
                  <th className="px-3 py-2 text-right">Haber USD</th>
                </tr>
              </thead>
              <tbody>
                {openingPreview.map((item, index) => (
                  <tr key={item.accountCode} className="border-t border-slate-100">
                    <td className="px-3 py-2"><span className="font-mono">{item.accountCode}</span> — {item.accountName}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.debitBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.creditBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.debitUsd.toFixed(6)}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.creditUsd.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                <tr>
                  <td className="px-3 py-2">Totales</td>
                  <td className="px-3 py-2 text-right font-mono">{openingPreview.reduce((sum, item) => sum + item.debitBs, 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-mono">{openingPreview.reduce((sum, item) => sum + item.creditBs, 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-mono">{openingPreview.reduce((sum, item) => sum + item.debitUsd, 0).toFixed(6)}</td>
                  <td className="px-3 py-2 text-right font-mono">{openingPreview.reduce((sum, item) => sum + item.creditUsd, 0).toFixed(6)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {!isStorageReady && <p className="text-xs text-rose-700">SQLite no está disponible. La preparación y el registro permanecen deshabilitados.</p>}
      </div>

      <MigracionInteligente />

      {/* Normativas Legales y Respaldo de Información */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Normativas Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-3">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Scale className="w-4 h-4 text-emerald-600" />
            Normas Legales y Tributarias Integradas
          </div>
          <div className="space-y-2.5 text-xs text-slate-600">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-800 block">SENIAT Providencia SNAT/2015/0049:</strong>
              Régimen de Retenciones de IVA para Contribuyentes Especiales (75% y 100%), emisión de comprobantes de 14 caracteres y archivo TXT delimitado por tabuladores.
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-800 block">Decreto Presidencial 1.808 (ISLR):</strong>
              Retenciones en fuente de Impuesto sobre la Renta para personas naturales (con sustraendo) y personas jurídicas (honorarios 5%, fletes 2%, adquisición bienes 2%).
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-800 block">Normas VEN-NIF (FCCPV):</strong>
              Principios de contabilidad de aceptación general en Venezuela: NIC 1 (Presentación), NIC 2 (Inventarios al costo promedio ponderado), NIC 21 (Moneda extranjera a tasa oficial BCV).
            </div>
          </div>
        </div>

        {/* Respaldo y Mantenimiento Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Download className="w-4 h-4 text-indigo-600" />
            Respaldo y Seguridad de Datos
          </div>
          <p className="text-xs text-slate-500">
            Exporta o restaura toda la contabilidad (asientos, compras, ventas, inventarios, retenciones) en formato JSON estructurado.
          </p>

          <div className="space-y-2.5 pt-1">
            <button
              onClick={handleExportBackup}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Descargar Respaldo JSON Completo
            </button>

            <label className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-300 transition cursor-pointer">
              <Upload className="w-4 h-4" />
              {backupRestoreBusy ? 'Restaurando y verificando SQLite…' : 'Restaurar desde Archivo JSON'}
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                  disabled={backupRestoreBusy}
                className="hidden"
              />
            </label>

            <button
              onClick={() => {
                if (confirm('¿Restablecer el sistema a los datos de muestra iniciales? Se sobrescribirán los datos actuales.')) {
                  resetToSampleData();
                  alert('Sistema restablecido a los datos de prueba oficiales.');
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Restablecer a Datos de Prueba Oficiales
            </button>

            <button
              disabled={factoryResetBusy}
              onClick={async () => {
                const first = window.confirm('RESET DE FÁBRICA SICOVEN\\n\\nSe eliminarán los registros operativos: asientos, compras, ventas, inventario, movimientos, retenciones, conciliaciones, liquidaciones y cuentas bancarias operativas. Se eliminarán todas las empresas registradas y sus parámetros, junto con todos los registros operativos. Se conservarán el acceso administrativo y la licencia/prueba actual. Esta acción no se puede deshacer. ¿Deseas continuar?');
                if (!first) return;
                const confirmation = window.prompt('Para confirmar definitivamente, escribe: RESETEAR SICOVEN');
                if (confirmation !== 'RESETEAR SICOVEN') { alert('Reset cancelado. No se modificaron los datos.'); return; }
                setFactoryResetBusy(true);
                setFactoryResetStage('Verificando sesión y preparando el reinicio…');
                try {
                  setFactoryResetStage('Eliminando datos operativos y empresas de SQLite…');
                  await resetFactoryData();
                  setFactoryResetStage('Verificación completada. Datos operativos eliminados.');
                  alert('Reinicio de fábrica verificado: se eliminaron las empresas y los datos operativos. Se conservaron usuarios, licencia y valores predeterminados del sistema.');
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'No se pudo completar el reset. No se confirmó el borrado.');
                } finally { setFactoryResetBusy(false); setFactoryResetStage(''); }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-60"
            >
              <RotateCcw className="w-4 h-4" />
              {factoryResetBusy ? 'Restableciendo SQLite…' : 'Reset de fábrica: borrar datos operativos'}
            </button>
            {factoryResetBusy && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4" role="status" aria-live="polite">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-rose-900">{factoryResetStage || 'Restableciendo el sistema…'}</span>
                  <span className="text-[10px] font-bold text-rose-700">EN CURSO</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-rose-100">
                  <div className="h-full w-2/5 animate-pulse rounded-full bg-rose-600" />
                </div>
                <p className="mt-2 text-[10px] text-rose-800">No cierre SICOVEN hasta que termine la verificación de SQLite.</p>
              </div>
            )}

          </div>
        </div>
      </div>

      <CompanyModal isOpen={isCompanyModalOpen} onClose={() => setIsCompanyModalOpen(false)} />
      <BcvRateModal isOpen={isBcvModalOpen} onClose={() => setIsBcvModalOpen(false)} />
    </div>
  );
};
