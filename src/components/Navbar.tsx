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
  Landmark,
  Menu,
  X
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md no-print w-full">
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Logo & Brand (New Official Identity) */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 min-w-0">
            <img
              src="/assets/aistudio/sicoven-logo-horizontal-nav.svg"
              alt="SICOVEN · Sistema Contable Integral Multiempresas"
              className="h-8 sm:h-10 w-auto max-w-[170px] sm:max-w-[220px] object-contain flex-shrink-0"
            />
            <span className="hidden lg:inline-block text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              VEN-NIF
            </span>
          </div>

          {/* Company Switcher, Currency View & Mobile Menu Button */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            {/* Multi-Company Selector */}
            <div className="relative">
              <button
                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition text-left cursor-pointer"
                title={`Empresa activa: ${currentCompany.name} (${currentCompany.rif})`}
              >
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0" />
                <div className="max-w-[70px] min-[390px]:max-w-[110px] min-[480px]:max-w-[160px] sm:max-w-[190px] md:max-w-[240px] truncate">
                  <div className="text-[11px] sm:text-xs font-semibold text-slate-100 truncate">
                    {currentCompany.name}
                  </div>
                  <div className="hidden sm:flex text-[10px] sm:text-[11px] text-slate-400 items-center gap-1">
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
                        ? 'C. Especial'
                        : 'Ordinario'}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-0.5" />
              </button>

              {/* Company Dropdown Menu with solid background & backdrop dismiss */}
              {companyDropdownOpen && (
                <>
                  {/* Backdrop to prevent click-through and close on tap outside */}
                  <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                    onClick={() => setCompanyDropdownOpen(false)}
                  />

                  {/* Dropdown Card */}
                  <div
                    className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-900 rounded-xl shadow-2xl border border-slate-700 py-2 z-50 divide-y divide-slate-800 ring-1 ring-black/50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3.5 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between bg-slate-950/60">
                      <span>Empresas Registradas ({companies.length})</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">RIF: {currentCompany.rif}</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-800/50 bg-slate-900">
                      {companies.map(comp => (
                        <button
                          key={comp.id}
                          onClick={() => {
                            setCurrentCompanyId(comp.id);
                            setCompanyDropdownOpen(false);
                          }}
                          className={`w-full px-3.5 py-2.5 text-left flex items-start gap-2.5 transition hover:bg-slate-800 cursor-pointer ${
                            comp.id === currentCompany.id
                              ? 'bg-emerald-950/70 border-l-4 border-emerald-400'
                              : 'bg-slate-900'
                          }`}
                        >
                          <Building2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${comp.id === currentCompany.id ? 'text-emerald-400' : 'text-slate-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-100 truncate">
                              {comp.name}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-slate-300 font-medium">{comp.rif}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                comp.taxpayerType === 'ESPECIAL'
                                  ? 'bg-purple-900/80 text-purple-200 border border-purple-700/60'
                                  : 'bg-sky-900/80 text-sky-200 border border-sky-700/60'
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
                    <div className="p-2.5 bg-slate-900">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompanyDropdownOpen(false);
                          onOpenCompanyModal();
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Crear Nueva Empresa
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Currency View Switcher */}
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px] sm:text-xs">
              <button
                onClick={() => setDisplayCurrency('BS')}
                className={`px-1.5 sm:px-2 py-1 rounded font-medium transition cursor-pointer ${
                  displayCurrency === 'BS'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mostrar valores en Bolívares (Bs.)"
              >
                Bs.
              </button>
              <button
                onClick={() => setDisplayCurrency('USD')}
                className={`px-1.5 sm:px-2 py-1 rounded font-medium transition cursor-pointer ${
                  displayCurrency === 'USD'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mostrar valores en Dólares ($ USD)"
              >
                USD
              </button>
              <button
                onClick={() => setDisplayCurrency('DUAL')}
                className={`px-1.5 sm:px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                  displayCurrency === 'DUAL'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mostrar en simultáneo: Bolívares (Bs.) y Dólares ($)"
              >
                <span className="hidden sm:inline">Bs. / $</span>
                <span className="sm:hidden">Dual</span>
              </button>
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 sm:p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
              aria-label="Abrir menú de módulos"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer (visible when mobileMenuOpen is true) */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-950 border-t border-slate-800 px-4 py-3 animate-in slide-in-from-top-2 duration-150">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Módulos Contables
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleSelectTab(tab.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium text-left transition cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-emerald-400'}`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation Tabs Bar (Horizontal swipeable for all screens) */}
      <nav className="bg-slate-950/80 border-t border-slate-800/80 overflow-x-auto no-scrollbar scroll-smooth">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 flex space-x-1 py-1 min-w-max">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
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
