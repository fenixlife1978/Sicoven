import React, { useState } from 'react';
import {
  BarChart3,
  ShoppingCart,
  CreditCard,
  Package,
  Landmark,
  ShieldCheck,
  User,
  LockKeyhole,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  KeyRound,
} from 'lucide-react';

export type AuthUser = {
  username: string;
  role: string;
  isSeed: boolean;
};

interface LoginScreenProps {
  onLogin: (token: string, user: AuthUser) => void;
  isDemoMode?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, isDemoMode = false }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleQuickFill = () => {
    setUsername('admin');
    setPassword('Admin123');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (window.sicovenStore?.login) {
        // Desktop SQLite Authentication
        const res = await window.sicovenStore.login({ username, password });
        if (!res.ok || !res.token || !res.user) {
          throw new Error(res.message || 'Usuario o contraseña incorrectos.');
        }
        onLogin(res.token, res.user);
      } else {
        // Web preview / Demo fallback mode: allows immediate interactive testing
        const trimmedUser = username.trim();
        if (!trimmedUser || !password) {
          throw new Error('Por favor complete su usuario y contraseña.');
        }
        // Allow admin / Admin123 or standard test credentials
        onLogin('web-preview-session-token', {
          username: trimmedUser,
          role: 'admin',
          isSeed: trimmedUser.toLowerCase() === 'admin',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al verificar credenciales.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0a182d] text-white flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Background Corporate Scene with Office Laptop & Calculator in soft focus */}
      <div
        className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-25 mix-blend-luminosity filter blur-[1px] scale-105"
        style={{ backgroundImage: `url('/assets/images/login_background.jpg')` }}
      />

      {/* Deep Executive Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#071324]/95 via-[#0a1e3b]/90 to-[#071426]/95 pointer-events-none" />

      {/* Diagonal Yellow & Navy Stripes - Top Left Corner */}
      <div className="absolute -top-12 -left-12 w-64 h-64 pointer-events-none z-10 hidden sm:block">
        <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-12">
          {/* Main Dark Navy Angled Band */}
          <polygon points="0,0 80,0 0,80" fill="#0c2040" opacity="0.9" />
          {/* Yellow Primary Stripe */}
          <polygon points="50,0 78,0 0,78 0,50" fill="#FFC72C" />
          {/* Secondary Yellow Accent Stripe */}
          <polygon points="88,0 98,0 0,98 0,88" fill="#FFC72C" opacity="0.85" />
          {/* Deep Blue Shadow Line */}
          <polygon points="106,0 120,0 0,120 0,106" fill="#081426" opacity="0.9" />
        </svg>
      </div>

      {/* Diagonal Yellow & Navy Stripes - Bottom Center Corner Accent */}
      <div className="absolute -bottom-16 left-1/3 w-80 h-80 pointer-events-none z-10 hidden lg:block">
        <svg viewBox="0 0 200 200" className="w-full h-full transform rotate-45 opacity-90">
          <polygon points="0,150 200,150 200,175 0,175" fill="#FFC72C" />
          <polygon points="0,182 200,182 200,188 0,188" fill="#FFC72C" opacity="0.9" />
          <polygon points="0,130 200,130 200,145 0,145" fill="#071830" opacity="0.8" />
        </svg>
      </div>

      {/* Main Content Area */}
      <div className="relative z-20 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-10 py-6 sm:py-10 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* LEFT COLUMN: Brand identity, headline, modules grid & slogan */}
          <div className="lg:col-span-7 flex flex-col justify-between py-2 sm:py-4">
            
            {/* Top Brand Logo */}
            <div className="flex items-center gap-3.5 mb-6 sm:mb-8">
              {/* Dark Rounded Icon Box with S and double yellow underline */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0c1f3d] border border-blue-900/60 shadow-xl flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-3xl sm:text-4xl font-black text-white leading-none font-sans">
                  S
                </span>
                <div className="mt-1 flex flex-col gap-0.5 w-6 sm:w-8">
                  <div className="h-[2px] sm:h-[3px] bg-[#FFC72C] rounded-full w-full" />
                  <div className="h-[2px] sm:h-[3px] bg-[#FFC72C] rounded-full w-full" />
                </div>
              </div>

              {/* Brand Name & Tag */}
              <div className="flex flex-col">
                <span className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-sans leading-tight">
                  Sicoven
                </span>
                <div className="my-0.5 flex flex-col gap-0.5 w-full">
                  <div className="h-[2px] sm:h-[3px] bg-[#FFC72C] rounded-full w-full" />
                  <div className="h-[2px] sm:h-[3px] bg-[#FFC72C] rounded-full w-full" />
                </div>
                <span className="text-xs sm:text-sm text-slate-300 font-medium tracking-wide">
                  Sistema contable
                </span>
              </div>
            </div>

            {/* Headline and Tagline */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-snug">
                Sistema Contable Integral
              </h1>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#FFC72C] tracking-tight">
                Multiemprasas
              </div>
              <p className="mt-2 text-xs sm:text-sm md:text-base text-slate-300 font-normal tracking-wide">
                Controla <span className="text-[#FFC72C] mx-1">•</span> Gestiona <span className="text-[#FFC72C] mx-1">•</span> Cumple <span className="text-[#FFC72C] mx-1">•</span> Crece
              </p>
            </div>

            {/* 6 Feature Modules Grid (2 Columns x 3 Rows) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 max-w-xl mb-8">
              
              {/* 1. Contabilidad */}
              <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#0c1e38]/70 border border-blue-900/40 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#102a52] border border-sky-500/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">Contabilidad</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 truncate">Libros, asientos y reportes</div>
                </div>
              </div>

              {/* 2. Compras */}
              <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#0c1e38]/70 border border-blue-900/40 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#102a52] border border-sky-500/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">Compras</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 truncate">Proveedores y cuentas por pagar</div>
                </div>
              </div>

              {/* 3. Ventas */}
              <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#0c1e38]/70 border border-blue-900/40 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#102a52] border border-sky-500/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">Ventas</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 truncate">Facturación y punto de venta</div>
                </div>
              </div>

              {/* 4. Inventario */}
              <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#0c1e38]/70 border border-blue-900/40 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#102a52] border border-sky-500/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">Inventario</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 truncate">Existencias y kardex valorado</div>
                </div>
              </div>

              {/* 5. Bancario */}
              <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#0c1e38]/70 border border-blue-900/40 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#102a52] border border-sky-500/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  <Landmark className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">Bancario</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 truncate">Conciliación y movimientos</div>
                </div>
              </div>

              {/* 6. Fiscal */}
              <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#0c1e38]/70 border border-blue-900/40 backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-[#102a52] border border-sky-500/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">Fiscal</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 truncate">IVA, ISLR y archivos XML/TXT</div>
                </div>
              </div>
            </div>

            {/* Bottom phrase */}
            <div className="text-slate-100 font-bold text-sm sm:text-base leading-tight">
              Tu información,<br />
              siempre bajo control.
            </div>
          </div>

          {/* RIGHT COLUMN: The Floating White & Navy Login Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="w-full max-w-[460px] rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden bg-white border border-slate-700/30 transition-all duration-300">
              
              {/* Card Top Banner with Sicoven Logo and Diagonal Yellow Accents */}
              <div className="bg-[#0b1c36] px-6 py-5 sm:px-8 sm:py-6 relative overflow-hidden flex items-center justify-between border-b border-slate-800">
                
                {/* Logo and Brand inside Card Header */}
                <div className="flex items-center gap-3 relative z-10">
                  {/* Rounded S Box */}
                  <div className="w-12 h-12 rounded-xl bg-[#0f2347] border border-blue-800/60 shadow-md flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-black text-white leading-none font-sans">
                      S
                    </span>
                    <div className="mt-0.5 flex flex-col gap-0.5 w-5">
                      <div className="h-[2px] bg-[#FFC72C] rounded-full w-full" />
                      <div className="h-[2px] bg-[#FFC72C] rounded-full w-full" />
                    </div>
                  </div>

                  {/* Text */}
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold tracking-tight text-white font-sans leading-tight">
                      Sicoven
                    </span>
                    <div className="my-0.5 flex flex-col gap-0.5 w-full">
                      <div className="h-[2px] bg-[#FFC72C] rounded-full w-full" />
                      <div className="h-[2px] bg-[#FFC72C] rounded-full w-full" />
                    </div>
                    <span className="text-[10px] text-slate-300 font-medium">
                      Sistema contable
                    </span>
                  </div>
                </div>

                {/* Diagonal Yellow Accent in Top-Right of Card */}
                <div className="absolute -top-3 -right-3 w-32 h-32 pointer-events-none z-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <polygon points="45,0 75,0 100,25 100,0" fill="#FFC72C" />
                    <polygon points="82,0 95,0 100,5 100,0" fill="#E5A812" />
                    <polygon points="25,0 40,0 100,60 100,45" fill="#08152a" opacity="0.6" />
                  </svg>
                </div>
              </div>

              {/* Card White Body */}
              <div className="p-6 sm:p-8 lg:p-9 text-slate-800">
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0d1e38] tracking-tight">
                    Iniciar sesión
                  </h2>
                  <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
                    Ingrese sus credenciales para acceder al sistema.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Field: Username */}
                  <div>
                    <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-300 bg-white transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
                      <User className="w-5 h-5 text-sky-600 flex-shrink-0" />
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Usuario o correo electrónico"
                        className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
                      />
                    </div>
                  </div>

                  {/* Field: Password */}
                  <div>
                    <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-300 bg-white transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
                      <LockKeyhole className="w-5 h-5 text-slate-600 flex-shrink-0" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña"
                        className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="text-slate-400 hover:text-slate-600 transition p-0.5 cursor-pointer"
                        title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Error Notification */}
                  {error && (
                    <div
                      role="alert"
                      className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs animate-shake"
                    >
                      <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Helper pill for default desktop credentials */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <button
                      type="button"
                      onClick={handleQuickFill}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer font-medium"
                      title="Rellenar usuario 'admin' y contraseña 'Admin123'"
                    >
                      <KeyRound className="w-3 h-3 text-emerald-600" />
                      <span>Completar credenciales predeterminadas</span>
                    </button>
                    {isDemoMode && (
                      <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Demo
                      </span>
                    )}
                  </div>

                  {/* Primary Submit Button (Emerald Green #008766) */}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#008766] hover:bg-[#007357] active:scale-[0.99] text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-900/20 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <LogIn className="w-5 h-5 flex-shrink-0" />
                    <span>{busy ? 'Verificando...' : 'Iniciar sesión'}</span>
                  </button>
                </form>

                {/* Acceso Seguro Badge */}
                <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-600 font-medium">
                  <LockKeyhole className="w-3.5 h-3.5 text-slate-600" />
                  <span>Acceso seguro</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER (Bottom Right Outside the card) */}
      <footer className="relative z-20 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-10 pb-4 pt-2 text-right">
        <p className="text-[11px] sm:text-xs text-slate-400 font-medium tracking-wide">
          SICOVEN <span className="mx-1">|</span> Sistema Contable Integral Multiemprasas
        </p>
        <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
          © 2026. Todos los derechos reservados.
        </p>
      </footer>
    </main>
  );
};