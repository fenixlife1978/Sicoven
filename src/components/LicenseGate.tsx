import React, { useEffect, useState } from 'react';
import { KeyRound, Wifi, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, ShoppingCart, ExternalLink } from 'lucide-react';

type LicenseStatus = {
  authorized: boolean;
  needsActivation: boolean;
  status: string;
  customer?: string;
  product?: string;
  lastCheckedAt?: string | null;
  trialExpiresAt?: string | null;
  message?: string;
};

export function LicenseGate({ onReady }: { onReady: () => void }) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    window.sicovenStore
      ?.getLicenseStatus()
      .then((result) => {
        if (!mounted) return;
        setStatus(result);
        setChecking(false);
        if (result.authorized && result.status !== 'trial') onReady();
      })
      .catch(() => {
        if (mounted) {
          setError('No se pudo consultar la licencia local. Cierre y vuelva a abrir SICOVEN.');
          setChecking(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [onReady]);

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await window.sicovenStore?.activateLicense(key.trim());
      if (!result?.ok || !result.license?.authorized) {
        throw new Error(result?.message || 'No se pudo activar la licencia.');
      }
      setStatus(result.license);
      setKey('');
      setNotice('Licencia activada correctamente. SICOVEN ya puede iniciar.');
      onReady();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar la licencia.');
    } finally {
      setBusy(false);
    }
  };

  const revalidate = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await window.sicovenStore?.revalidateLicense();
      if (!result) throw new Error('No se recibió respuesta de validación.');
      setStatus(result);
      if (result.authorized) {
        setNotice(result.message || 'Licencia válida.');
        onReady();
      } else {
        setError(result.message || 'Licencia no autorizada.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revalidar.');
    } finally {
      setBusy(false);
    }
  };

  if (checking && !status) {
    return (
      <main className="min-h-screen bg-[#071e3b] flex items-center justify-center p-4">
        <section role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-white px-6 py-5 text-slate-700 shadow-xl">
          <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />
          <span>Comprobando licencia de SICOVEN…</span>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#071e3b] flex items-center justify-center p-4 sm:p-8">
      <section className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl sm:p-10">
        {/* Brand Header */}
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <img
            src="./sicoven-logo-horizontal.svg"
            alt="SICOVEN · Sistema Contable VEN-NIF & SENIAT"
            className="h-10 w-auto max-w-[200px] object-contain"
          />
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
            <KeyRound className="h-3.5 w-3.5" />
            <span>Licenciamiento</span>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Activación de SICOVEN</h1>
          <p className="text-sm text-slate-500 mt-1">Licencia vinculada a este equipo</p>
        </div>

        {status?.authorized ? (
          <div className={`mb-5 rounded-xl border p-4 text-sm ${status.status === 'trial' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            <p className="flex items-center gap-2 font-bold">
              <CheckCircle2 className={`h-5 w-5 ${status.status === 'trial' ? 'text-amber-600' : 'text-emerald-600'}`} />
              {status.status === 'trial' ? 'Prueba gratuita activa · 24 horas' : 'Licencia de pago autorizada'}
            </p>
            {status.status === 'trial' && <p className="mt-1">Puedes activar tu licencia de pago ahora o continuar con la prueba temporal.</p>}
            {status.product && <p className="mt-1">Producto: {status.product}</p>}
            {status.customer && <p>Cliente: {status.customer}</p>}
          </div>
        ) : (
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="flex items-center gap-2 font-semibold text-slate-800">
              <Wifi className="h-4 w-4 text-sky-600" /> Se requiere internet para la activación inicial
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Después de activar, SICOVEN guarda sus datos en SQLite local y puede trabajar sin conexión durante el plazo offline autorizado por tu plan. Al reconectarse, comprobará el estado de la licencia con el CRM.
            </p>
          </div>
        )}

        {status?.message && !status.authorized && (
          <p className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {status.message}
          </p>
        )}

        <form onSubmit={activate} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Clave de licencia</span>
            <input
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              maxLength={120}
              placeholder="SIC-XXXX-XXXX-XXXX"
              className="h-12 w-full rounded-xl border border-slate-300 px-4 font-mono text-sm tracking-wide outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </label>

          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition cursor-pointer"
          >
            {busy ? 'Verificando con el CRM…' : 'Activar licencia'}
          </button>
        </form>

        {status?.authorized && status.status === 'trial' && (
          <button
            type="button"
            onClick={onReady}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Continuar con la prueba gratuita
          </button>
        )}

        <a
          href="https://crm-sicoven.vercel.app/comprar"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-bold text-sky-900 hover:bg-sky-100 transition"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Ver planes y pagos · Activar sin esperar la prueba</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>

        {status?.needsActivation === false && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void revalidate()}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{busy ? 'Comprobando…' : 'Revalidar licencia con internet'}</span>
          </button>
        )}

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>La clave se almacena cifrada en el equipo y no se muestra después de guardarse.</span>
        </p>
      </section>
    </main>
  );
}
