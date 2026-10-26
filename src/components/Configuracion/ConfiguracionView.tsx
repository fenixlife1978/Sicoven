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
  Info
} from 'lucide-react';
import { TaxpayerType } from '../../types/accounting';
import { CompanyModal } from '../CompanyModal';
import { BcvRateModal } from '../BcvRateModal';
import { formatBs } from '../../utils/formatters';

export const ConfiguracionView: React.FC = () => {
  const {
    companies,
    currentCompany,
    setCurrentCompanyId,
    updateCompany,
    resetToSampleData,
    resetFactoryData,
    exportBackupJson,
    importBackupJson
  } = useAccounting();

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isBcvModalOpen, setIsBcvModalOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state for current company editing
  const [name, setName] = useState(currentCompany.name);
  const [tradeName, setTradeName] = useState(currentCompany.tradeName || '');
  const [rif, setRif] = useState(currentCompany.rif);
  const [taxpayerType, setTaxpayerType] = useState<TaxpayerType>(currentCompany.taxpayerType);
  const [defaultIvaRetentionRate, setDefaultIvaRetentionRate] = useState<number>(
    currentCompany.defaultIvaRetentionRate
  );
  const [address, setAddress] = useState(currentCompany.address);
  const [phone, setPhone] = useState(currentCompany.phone);
  const [email, setEmail] = useState(currentCompany.email);
  const [fiscalYear, setFiscalYear] = useState(currentCompany.fiscalYear);
  const [bcvRate, setBcvRate] = useState(currentCompany.bcvRate);

  // Sync state if currentCompany switches
  React.useEffect(() => {
    setName(currentCompany.name);
    setTradeName(currentCompany.tradeName || '');
    setRif(currentCompany.rif);
    setTaxpayerType(currentCompany.taxpayerType);
    setDefaultIvaRetentionRate(currentCompany.defaultIvaRetentionRate);
    setAddress(currentCompany.address);
    setPhone(currentCompany.phone);
    setEmail(currentCompany.email);
    setFiscalYear(currentCompany.fiscalYear);
    setBcvRate(currentCompany.bcvRate);
  }, [currentCompany]);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompany({
      ...currentCompany,
      name: name.trim().toUpperCase(),
      tradeName: tradeName.trim() || undefined,
      rif: rif.trim().toUpperCase(),
      taxpayerType,
      defaultIvaRetentionRate: taxpayerType === 'ESPECIAL' ? defaultIvaRetentionRate : 0,
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
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content) {
        const ok = importBackupJson(content);
        if (ok) {
          alert('¡Copia de seguridad restaurada exitosamente!');
        } else {
          alert('Error al leer el archivo JSON de respaldo. Verifique el formato.');
        }
      }
    };
    reader.readAsText(file);
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
              <label className="block font-semibold text-slate-700 mb-1">RIF Oficial</label>
              <input
                type="text"
                required
                value={rif}
                onChange={e => setRif(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono uppercase focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
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
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tasa Oficial BCV (Bs/$)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={bcvRate}
                  onChange={e => setBcvRate(parseFloat(e.target.value) || 0)}
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
              Restaurar desde Archivo JSON
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
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
              onClick={() => {
                const first = window.confirm('RESET DE FÁBRICA SICOVEN\n\nSe eliminarán los registros operativos: asientos, compras, ventas, inventario, movimientos, retenciones, conciliaciones, liquidaciones y cuentas bancarias operativas. Se conservarán las empresas, sus parámetros fiscales, los administradores y la licencia/prueba actual. Esta acción no se puede deshacer. ¿Deseas continuar?');
                if (!first) return;
                const confirmation = window.prompt('Para confirmar definitivamente, escribe: RESETEAR SICOVEN');
                if (confirmation !== 'RESETEAR SICOVEN') {
                  alert('Reset cancelado. No se modificaron los datos.');
                  return;
                }
                resetFactoryData();
                alert('Reset de fábrica ejecutado. Se conservaron el acceso administrativo, la configuración de empresas y el estado de licencia/prueba.');
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reset de fábrica: borrar datos operativos
            </button>
          </div>
        </div>
      </div>

      <CompanyModal isOpen={isCompanyModalOpen} onClose={() => setIsCompanyModalOpen(false)} />
      <BcvRateModal isOpen={isBcvModalOpen} onClose={() => setIsBcvModalOpen(false)} />
    </div>
  );
};
