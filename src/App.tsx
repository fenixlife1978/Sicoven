import React, { useEffect, useState } from 'react';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { Navbar } from './components/Navbar';
import { CompanyModal } from './components/CompanyModal';
import { BcvRateModal } from './components/BcvRateModal';
import { LibroDiarioView } from './components/LibroDiario/LibroDiarioView';
import { LibroMayorView } from './components/LibroMayor/LibroMayorView';
import { BalancesView } from './components/Balances/BalancesView';
import { LibroComprasView } from './components/LibroCompras/LibroComprasView';
import { LibroVentasView } from './components/LibroVentas/LibroVentasView';
import { InventarioView } from './components/Inventario/InventarioView';
import { RetencionesIvaView } from './components/Retenciones/RetencionesIvaView';
import { RetencionesIslrView } from './components/Retenciones/RetencionesIslrView';
import { CatalogoView } from './components/Catalogo/CatalogoView';
import { ConfiguracionView } from './components/Configuracion/ConfiguracionView';
import { ConciliacionBancariaView } from './components/Conciliacion/ConciliacionBancariaView';
import { Scale, ShieldCheck, Building2 } from 'lucide-react';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('diario');
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isBcvModalOpen, setIsBcvModalOpen] = useState(false);
  const { currentCompany, companies, isStorageReady, storageError, isDemoMode, demoUsage } = useAccounting();

  useEffect(() => {
    if (isStorageReady && companies.length === 0) setIsCompanyModalOpen(true);
  }, [isStorageReady, companies.length]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'diario':
        return <LibroDiarioView />;
      case 'mayor':
        return <LibroMayorView />;
      case 'balances':
        return <BalancesView />;
      case 'conciliacion':
        return <ConciliacionBancariaView />;
      case 'compras':
        return <LibroComprasView />;
      case 'ventas':
        return <LibroVentasView />;
      case 'inventario':
        return <InventarioView />;
      case 'ret-iva':
        return <RetencionesIvaView />;
      case 'ret-islr':
        return <RetencionesIslrView />;
      case 'catalogo':
        return <CatalogoView />;
      case 'config':
        return <ConfiguracionView />;
      default:
        return <LibroDiarioView />;
    }
  };

  if (!isStorageReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-6">
        <div role="status" aria-live="polite" className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
          <h1 className="text-lg font-bold text-slate-900">{storageError ? 'No se pudo abrir la base de datos local' : 'Iniciando SICOVEN'}</h1>
          <p className="mt-2 text-sm text-slate-600">{storageError || 'Verificando y cargando los datos locales antes de habilitar las operaciones contables.'}</p>
          <p className="mt-3 text-xs text-slate-500">{storageError ? 'Las operaciones permanecen bloqueadas para proteger sus datos. Cierre SICOVEN y compruebe los permisos de escritura de la carpeta de datos antes de volver a abrirlo.' : 'Si esta pantalla no desaparece, cierre el programa y compruebe los permisos de escritura de la carpeta de datos.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {isDemoMode && (
        <div role="status" aria-live="polite" className="sticky top-0 z-[100] w-full bg-amber-300 text-slate-950 border-b-2 border-amber-500 shadow-md no-print">
          <div className="mx-auto max-w-7xl px-3 py-2 text-center text-xs sm:text-sm font-bold leading-relaxed">
            DEMO SICOVEN · Máximo 10 acciones por módulo. Uso por módulo: Empresas {demoUsage.empresa || 0}/10 · Diario {demoUsage.diario || 0}/10 · Compras {demoUsage.compras || 0}/10 · Ventas {demoUsage.ventas || 0}/10 · Inventario {demoUsage.inventario || 0}/10 · Catálogo {demoUsage.catalogo || 0}/10 · Retenciones {demoUsage.retenciones || 0}/10 · Configuración {demoUsage.configuracion || 0}/10 · Conciliación {demoUsage.conciliacion || 0}/10. · Adquiere SICOVEN completo por €250 al cambio de la tasa BCV, o aprovecha la promoción por solo $200 USD en efectivo físico. · Compra la versión completa para trabajar sin límites.
          </div>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-hidden">
        {renderActiveTab()}
      </main>

      {/* Footer (hidden on print) */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-6 text-xs no-print mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-200">SICOVEN</span>
            <span className="text-slate-600">•</span>
            <span>Sistema Contable Multi-Empresa VEN-NIF & SENIAT</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Providencia SNAT/2015/0049 • Decreto 1808 • VEN-NIF
            </span>
            <span className="text-slate-600">•</span>
            <span>Valores expresados en Bolívares (Bs.) y Dólares ($ USD)</span>
          </div>
        </div>
      </footer>

      {/* Global Modals */}
      <CompanyModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
      />
      <BcvRateModal
        isOpen={isBcvModalOpen}
        onClose={() => setIsBcvModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <AccountingProvider>
      <AppContent />
    </AccountingProvider>
  );
}
