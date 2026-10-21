import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Building2, X, ShieldAlert, Check, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { TaxpayerType } from '../types/accounting';
import { generateCompanyLogo } from '../data/defaultLogos';

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CompanyModal: React.FC<CompanyModalProps> = ({ isOpen, onClose }) => {
  const { addCompany } = useAccounting();

  const [rif, setRif] = useState('');
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [taxpayerType, setTaxpayerType] = useState<TaxpayerType>('ESPECIAL');
  const [defaultIvaRetentionRate, setDefaultIvaRetentionRate] = useState<number>(75);
  const [bcvRate, setBcvRate] = useState<number>(68.50);
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear());
  const [customLogo, setCustomLogo] = useState<string>('');

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('El archivo no debe exceder los 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCustomLogo(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const currentPreviewLogo = customLogo || generateCompanyLogo({
    name: name.trim() || 'NUEVA EMPRESA',
    rif: rif.trim() || 'J-00000000-0',
    taxpayerType
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rif.trim() || !name.trim()) return;

    const finalLogo = customLogo || generateCompanyLogo({
      name: name.trim().toUpperCase(),
      rif: rif.trim().toUpperCase(),
      taxpayerType
    });

    addCompany({
      rif: rif.trim().toUpperCase(),
      name: name.trim().toUpperCase(),
      tradeName: tradeName.trim() || undefined,
      address: address.trim() || 'Venezuela',
      phone: phone.trim() || '(0212) 000-0000',
      email: email.trim() || 'contacto@empresa.com.ve',
      taxpayerType,
      defaultIvaRetentionRate: taxpayerType === 'ESPECIAL' ? defaultIvaRetentionRate : 0,
      fiscalYear,
      bcvRate: Number(bcvRate) || 68.50,
      lastRateUpdate: new Date().toISOString().split('T')[0],
      logoUrl: finalLogo
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Registrar Nueva Empresa</h3>
              <p className="text-xs text-slate-400">Crear entidad contable independiente (SENIAT / VEN-NIF)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* RIF & Razón Social */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                RIF Oficial *
              </label>
              <input
                type="text"
                required
                placeholder="J-12345678-9"
                value={rif}
                onChange={e => setRif(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Razón Social *
              </label>
              <input
                type="text"
                required
                placeholder="EJEMPLO COMERCIAL, C.A."
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nombre Comercial (Opcional)
            </label>
            <input
              type="text"
              placeholder="Nombre de fantasía o marca"
              value={tradeName}
              onChange={e => setTradeName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Calificación SENIAT */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
              Calificación Tributaria SENIAT
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                  taxpayerType === 'ESPECIAL'
                    ? 'border-purple-500 bg-purple-50/50 text-purple-900 font-semibold'
                    : 'border-slate-200 hover:bg-white text-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="taxpayerType"
                  value="ESPECIAL"
                  checked={taxpayerType === 'ESPECIAL'}
                  onChange={() => {
                    setTaxpayerType('ESPECIAL');
                    setDefaultIvaRetentionRate(75);
                  }}
                  className="mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="block font-bold">Contribuyente Especial</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Agente de Retención designado por el SENIAT (75% / 100% IVA e ISLR).
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                  taxpayerType === 'ORDINARIO'
                    ? 'border-sky-500 bg-sky-50/50 text-sky-900 font-semibold'
                    : 'border-slate-200 hover:bg-white text-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="taxpayerType"
                  value="ORDINARIO"
                  checked={taxpayerType === 'ORDINARIO'}
                  onChange={() => {
                    setTaxpayerType('ORDINARIO');
                    setDefaultIvaRetentionRate(0);
                  }}
                  className="mt-0.5 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="block font-bold">Contribuyente Ordinario</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    No designado como agente de retención de IVA.
                  </span>
                </div>
              </label>
            </div>

            {taxpayerType === 'ESPECIAL' && (
              <div className="pt-2 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">Porcentaje de Retención IVA por Defecto:</span>
                <select
                  value={defaultIvaRetentionRate}
                  onChange={e => setDefaultIvaRetentionRate(Number(e.target.value))}
                  className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value={75}>75% (General)</option>
                  <option value={100}>100% (No inscritos o casos especiales)</option>
                </select>
              </div>
            )}
          </div>

          {/* Domicilio Fiscal y Contacto */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Dirección Fiscal
            </label>
            <textarea
              rows={2}
              placeholder="Av., Edificio, Piso, Oficina, Ciudad, Estado"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Teléfono de Contacto
              </label>
              <input
                type="text"
                placeholder="(0212) 123-4567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="contabilidad@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Logotipo Institucional */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                Logotipo Oficial de la Empresa
              </label>
              {customLogo && (
                <button
                  type="button"
                  onClick={() => setCustomLogo('')}
                  className="text-[11px] text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-3 h-3" />
                  Restaurar automático
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Sube el logo corporativo de la empresa (PNG, JPG o SVG) para los encabezados de Libros y Balances. Si no subes uno, el sistema genera automáticamente un isotipo exclusivo con sus iniciales y RIF.
            </p>

            <div className="flex items-center gap-3 pt-1">
              <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-xs flex-shrink-0">
                <img
                  src={currentPreviewLogo}
                  alt="Vista previa del logo"
                  className="h-10 w-auto object-contain max-w-[150px]"
                />
              </div>
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer transition">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>{customLogo ? 'Cambiar archivo de logo' : 'Subir imagen de logo'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Parámetros Financieros */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tasa Oficial BCV Inicial (Bs/$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={bcvRate}
                onChange={e => setBcvRate(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ejercicio Económico (Año)
              </label>
              <input
                type="number"
                min="2000"
                max="2099"
                required
                value={fiscalYear}
                onChange={e => setFiscalYear(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Guardar y Activar Empresa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
