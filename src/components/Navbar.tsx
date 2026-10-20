import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  Building2,
  DollarSign,
  Plus,
  BookOpen,
  FileSpreadsheet,
  ShoppingCart,
  TrendingUp,
  Package,
  Receipt,
  FileText,
  ListTree,
  Settings,
  ChevronDown,
  CheckCircle2,
  ShieldCheck,
  Scale,
  Landmark
} from 'lucide-react';
import { formatBs, formatUsd } from '../utils/formatters';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenCompanyModal: () => void;
  onOpenBcvModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenCompanyModal,
  onOpenBcvModal
}) => {
  const {
    companies,
    currentCompany,
    setCurrentCompanyId,
    displayCurrency,
    setDisplayCurrency
  } = useAccounting();

  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);

  const tabs = [
    { id: 'diario', label: 'Libro Diario', icon: BookOpen },
    { id: 'mayor', label: 'Libro Mayor', icon: ListTree },
    { id: 'balances', label: 'Balances VEN-NIF', icon: Scale },
    { id: 'conciliacion', label: 'Conciliación Bancaria', icon: Landmark },
    { id: 'compras', label: 'Libro de Compras', icon: ShoppingCart },
    { id: 'ventas', label: 'Libro de Ventas', icon: TrendingUp },
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'ret-iva', label: 'Retenciones IVA & TXT', icon: Receipt },
    { id: 'ret-islr', label: 'Retenciones ISLR & XML', icon: FileText },
    { id: 'catalogo', label: 'Plan de Cuentas', icon: FileSpreadsheet },
    { id: 'config', label: 'Configuración', icon: Settings },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md no-print">
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-emerald-600 to-teal-400 p-2.5 rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  SICOVEN
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  VEN-NIF • SENIAT
                </span>
              </div>
              <p className="text-xs text-slate-400 font-normal">
                Sistema Contable Integral Multi-Empresa
              </p>
            </div>
          </div>

          {/* Company Switcher & Currency Control */}
          <div className="flex items-center gap-3">
            {/* Multi-Company Selector */}
            <div className="relative">
              <button
                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 transition text-left cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div className="max-w-[200px] sm:max-w-[260px] truncate">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {currentCompany.name}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span>{currentCompany.rif}</span>
                    <span className="text-slate-600">•</span>
                    <span
                      className={`font-medium ${
                        currentCompany.taxpayerType === 'ESPECIAL'
                          ? 'text-purple-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {currentCompany.taxpayerType === 'ESPECIAL'
                        ? 'C. Especial (75%)'
                        : 'C. Ordinario'}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
              </button>

              {/* Company Dropdown Menu */}
              {companyDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-80 bg-slate-850 rounded-xl shadow-2xl border border-slate-700 py-2 z-50 divide-y divide-slate-800"
                  onClick={() => setCompanyDropdownOpen(false)}
                >
                  <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Empresas Disponibles ({companies.length})
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {companies.map(comp => (
                      <button
                        key={comp.id}
                        onClick={() => setCurrentCompanyId(comp.id)}
                        className={`w-full px-3 py-2 text-left flex items-start gap-2.5 transition hover:bg-slate-800 ${
                          comp.id === currentCompany.id ? 'bg-emerald-950/40 border-l-2 border-emerald-400' : ''
                        }`}
                      >
                        <Building2 className={`w-4 h-4 mt-0.5 ${comp.id === currentCompany.id ? 'text-emerald-400' : 'text-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-200 truncate">
                            {comp.name}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>{comp.rif}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                              comp.taxpayerType === 'ESPECIAL' ? 'bg-purple-900/60 text-purple-300' : 'bg-sky-900/60 text-sky-300'
                            }`}>
                              {comp.taxpayerType === 'ESPECIAL' ? 'Especial' : 'Ordinario'}
                            </span>
                          </div>
                        </div>
                        {comp.id === currentCompany.id && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCompanyDropdownOpen(false);
                        onOpenCompanyModal();
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Crear Nueva Empresa
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Currency View Switcher */}
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
              <button
                onClick={() => setDisplayCurrency('BS')}
                className={`px-2 py-1 rounded font-medium transition cursor-pointer ${
                  displayCurrency === 'BS'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mostrar valores únicamente en Bolívares (Bs.)"
              >
                Bs.
              </button>
              <button
                onClick={() => setDisplayCurrency('USD')}
                className={`px-2 py-1 rounded font-medium transition cursor-pointer ${
                  displayCurrency === 'USD'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mostrar valores únicamente en Dólares ($ USD)"
              >
                USD ($)
              </button>
              <button
                onClick={() => setDisplayCurrency('DUAL')}
                className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                  displayCurrency === 'DUAL'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mostrar en simultáneo: Bolívares (Bs.) y Dólares ($)"
              >
                Bs. / $
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <nav className="bg-slate-950/80 border-t border-slate-800/80 overflow-x-auto scrollbar-thin">
        <div className="max-w-7xl mx-auto px-4 flex space-x-1 py-1 min-w-max">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
