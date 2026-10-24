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
import { CuentasPorPagarView } from './components/CuentasPorPagar/CuentasPorPagarView';
import { CuentasPorCobrarView } from './components/CuentasPorCobrar/CuentasPorCobrarView';
import { ShieldCheck, Building2 } from 'lucide-react';
import { LoginScreen, AuthUser } from './components/LoginScreen';
import { AdminUsers } from './components/AdminUsers';
import { LicenseGate } from './components/LicenseGate';

const AppContent: React.FC = () => {
  const [licenseAllowed, setLicenseAllowed] = useState(false);
  const [auth, setAuth] = useState<{token:string; user:AuthUser} | null>(null);
  const [showAdmins, setShowAdmins] = useState(false);
  const logout = async () => { if(auth&&window.sicovenStore) await window.sicovenStore.logout(auth.token); setAuth(null); setShowAdmins(false); };

  useEffect(() => {
    if (!window.sicovenStore) return;
    const enforceStatus = (status: { authorized: boolean }) => {
      if (!status.authorized) {
        setAuth(null);
        setShowAdmins(false);
        setLicenseAllowed(false);
      }
    };
    const unsubscribe = window.sicovenStore.onLicenseStatusChanged(enforceStatus);
    const onReconnect = () => { void window.sicovenStore?.revalidateLicense().then(enforceStatus); };
    window.addEventListener('online', onReconnect);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onReconnect);
    };
  }, []);
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
      case 'cxp':
        return <CuentasPorPagarView />;
      case 'cxc':
        return <CuentasPorCobrarView />;
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

  if (window.sicovenStore && !licenseAllowed) return <LicenseGate onReady={() => setLicenseAllowed(true)} />;
  if (!auth) return <LoginScreen onLogin={(token, user) => setAuth({ token, user })} isDemoMode={isDemoMode} />;
  if (auth && showAdmins) return <AdminUsers token={auth.token} user={auth.user} onLogout={logout} onBack={() => setShowAdmins(false)} />;
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
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <img src="./sicoven-logo-horizontal.svg" alt="Sicoven · Sistema contable" className="h-10 sm:h-12 w-auto max-w-[min(70vw,280px)] object-contain" />
                <span className="inline-flex items-center rounded-md border border-amber-700 bg-slate-950 px-3 py-1.5 text-[11px] sm:text-xs font-extrabold tracking-wider text-amber-300">VERSIÓN DEMO</span>
              </div>
              <p>Máximo 10 acciones por módulo. Uso por módulo: Empresas {demoUsage.empresa || 0}/10 · Diario {demoUsage.diario || 0}/10 · Compras {demoUsage.compras || 0}/10 · Ventas {demoUsage.ventas || 0}/10 · Inventario {demoUsage.inventario || 0}/10 · Catálogo {demoUsage.catalogo || 0}/10 · Retenciones {demoUsage.retenciones || 0}/10 · Configuración {demoUsage.configuracion || 0}/10 · Conciliación {demoUsage.conciliacion || 0}/10.</p>
              <p className="font-extrabold">ADQUIERE SICOVEN COMPLETO POR €250 EUR A LA TASA OFICIAL DEL DÍA SEGÚN EL BCV, O POR $200 USD EN EFECTIVO. · Compra la versión completa para trabajar sin límites.</p>
            </div>
          </div>
        </div>
      )}

      {auth && <div className="flex items-center justify-end gap-3 bg-slate-800 px-4 py-2 text-xs text-white no-print"><span>Sesión: <strong>{auth.user.username}</strong></span><button onClick={()=>setShowAdmins(true)} className="rounded-lg border border-slate-600 px-3 py-1.5 hover:bg-slate-700">Administradores</button><button onClick={logout} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold hover:bg-emerald-700">Cerrar sesión</button></div>}
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
          <div className="flex items-center gap-2.5">
            <img src="./sicoven-logo-horizontal.svg" alt="SICOVEN" className="h-6 w-auto object-contain" />
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
