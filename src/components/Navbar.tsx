import React, { useState, useRef, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {
  Building2,
  DollarSign,
  Plus,
  BookOpen,
  FileSpreadsheet,
  ShoppingCart,
  TrendingUp,
  Wallet,
  HandCoins,
  Package,
  Receipt,
  FileText,
  ListTree,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  const [licenseStatus, setLicenseStatus] = useState<{ authorized: boolean; status: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    const refreshLicenseStatus = () => {
      window.sicovenStore?.getLicenseStatus().then((result) => {
        if (mounted) setLicenseStatus(result);
      }).catch(() => {
        if (mounted) setLicenseStatus(null);
      });
    };
    refreshLicenseStatus();
    window.addEventListener('focus', refreshLicenseStatus);
    window.addEventListener('online', refreshLicenseStatus);
    return () => {
      mounted = false;
      window.removeEventListener('focus', refreshLicenseStatus);
      window.removeEventListener('online', refreshLicenseStatus);
    };
  }, []);

  const tabs = [
    { id: 'diario', label: 'Libro Diario', icon: BookOpen },
    { id: 'mayor', label: 'Libro Mayor', icon: ListTree },
    { id: 'balances', label: 'Balances VEN-NIF', icon: Scale },
    { id: 'tesoreria', label: 'Tesorería', icon: Wallet },
    { id: 'conciliacion', label: 'Conciliación Bancaria', icon: Landmark },
    { id: 'compras', label: 'Libro de Compras', icon: ShoppingCart },
    { id: 'cxp', label: 'Cuentas por pagar', icon: Wallet },
    { id: 'ventas', label: 'Libro de Ventas', icon: TrendingUp },
    { id: 'cxc', label: 'Cuentas por cobrar', icon: HandCoins },
    { id: 'inventario', label: 'Inventario', icon: Package },
    { id: 'ret-iva', label: 'Retenciones IVA & TXT', icon: Receipt },
    { id: 'ret-islr', label: 'Retenciones ISLR & XML', icon: FileText },
    { id: 'catalogo', label: 'Plan de Cuentas', icon: FileSpreadsheet },
    { id: 'config', label: 'Configuración', icon: Settings },
  ];

  const navContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = navContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  const scrollNav = (direction: 'left' | 'right') => {
    if (navContainerRef.current) {
      const offset = direction === 'left' ? -220 : 220;
      navContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkScroll, 200);
    }
  };

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md no-print w-full">
      {licenseStatus?.authorized && licenseStatus.status === 'trial' && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 border-b border-amber-300/20 bg-amber-500/10 px-3 py-2 text-center">
          <p className="text-xs sm:text-sm text-amber-100">
            Prueba gratuita de 24 horas activa. Si desea adquirir su licencia antes de que termine, seleccione «Ver Planes».
          </p>
          <a
            href="https://crm-sicoven.vercel.app/comprar"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-500"
          >
            Ver Planes y Pagos
          </a>
        </div>
      )}
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Logo & Brand (New Official Identity) */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 min-w-0">
            <img
              src="./sicoven-logo-horizontal.svg"
              alt="SICOVEN · Sistema Contable Integral Multiempresas"
              className="h-8 sm:h-10 w-auto max-w-[170px] sm:max-w-[220px] object-contain flex-shrink-0"
            />
            <span className="hidden lg:inline-block text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              VEN-NIF
            </span>
          </div>

          {/* Tasa BCV visible y acceso a actualización manual */}
          <button onClick={() => onOpenBcvModal?.()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 hover:bg-slate-700 transition min-w-0" title="Consultar o actualizar tasa BCV manualmente">
            <img src="./bcv-emblem.svg" alt="BCV" className="h-7 w-7 object-contain bg-white rounded-full p-0.5" />
            <span className="text-left leading-tight"><span className="block text-[9px] uppercase tracking-wide text-slate-400">Tasa BCV</span><span className="block text-[11px] sm:text-xs font-bold text-emerald-300 whitespace-nowrap">Bs. {Number(currentCompany.bcvRate || 0).toLocaleString('es-VE',{minimumFractionDigits:2,maximumFractionDigits:4})}/$</span><span className="hidden sm:block text-[9px] text-slate-400">{currentCompany.lastRateUpdate || 'Sin fecha'}</span></span>
          </button>

          {/* Company Switcher, Currency View & Mobile Menu Button */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            {/* Multi-Company Selector */}
            <div className="relative">
              <button
                onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 transition text-left cursor-pointer"
                title={`Empresa activa: ${currentCompany.name} (${currentCompany.rif})`}
              >
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0" />
                <div className="max-w-[85px] xs:max-w-[120px] sm:max-w-[190px] md:max-w-[240px] truncate">
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

              {/* Company Dropdown Menu */}
              {companyDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-850 rounded-xl shadow-2xl border border-slate-700 py-2 z-50 divide-y divide-slate-800"
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
                <span className="hidden xs:inline">Bs. / $</span>
                <span className="xs:hidden">Dual</span>
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
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-850 hover:text-white border border-slate-800'
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

      {/* Navigation Tabs Bar with explicit Horizontal Scroll and Desktop Scroll Arrows */}
      <div className="relative bg-slate-950 border-t border-slate-800 flex items-center">
        {/* Left Scroll Button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollNav('left')}
            className="absolute left-0 z-20 h-full px-1.5 sm:px-2 bg-gradient-to-r from-slate-950 via-slate-950/95 to-transparent text-slate-300 hover:text-white flex items-center transition cursor-pointer"
            aria-label="Desplazar módulos hacia la izquierda"
            title="Desplazar módulos a la izquierda"
          >
            <ChevronLeft className="w-5 h-5 bg-slate-800 hover:bg-slate-700 rounded-full p-0.5 border border-slate-700 shadow-md text-emerald-400" />
          </button>
        )}

        {/* Horizontal Scrollable Tabs */}
        <nav
          ref={navContainerRef}
          onScroll={checkScroll}
          className="w-full overflow-x-auto scroll-smooth px-3 sm:px-6 py-2 flex items-center gap-1.5 [scrollbar-width:thin] [scrollbar-color:#334155_transparent] touch-pan-x"
        >
          <div className="flex items-center space-x-1.5 min-w-max mx-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right Scroll Button */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollNav('right')}
            className="absolute right-0 z-20 h-full px-1.5 sm:px-2 bg-gradient-to-l from-slate-950 via-slate-950/95 to-transparent text-slate-300 hover:text-white flex items-center transition cursor-pointer"
            aria-label="Desplazar módulos hacia la derecha"
            title="Desplazar módulos a la derecha"
          >
            <ChevronRight className="w-5 h-5 bg-slate-800 hover:bg-slate-700 rounded-full p-0.5 border border-slate-700 shadow-md text-emerald-400" />
          </button>
        )}
      </div>
    </header>
  );
};
