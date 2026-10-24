import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Wifi, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

type LicenseStatus = {
  authorized: boolean;
  needsActivation: boolean;
  status: string;
  customer?: string;
  product?: string;
  offlineUntil?: string | null;
  lastCheckedAt?: string | null;
  message?: string;
};

export function LicenseGate({ onReady }: { onReady: () => void }) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    window.sicovenStore?.getLicenseStatus().then((result) => {
      if (!mounted) return;
      setStatus(result);
      if (result.authorized) onReady();
    }).catch(() => {
      if (mounted) setError('No se pudo consultar la licencia local. Cierre y vuelva a abrir SICOVEN.');
    });
    return () => { mounted = false; };
  }, []);

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await window.sicovenStore?.activateLicense(key.trim());
      if (!result?.ok || !result.license?.authorized) throw new Error(result?.message || 'No se pudo activar la licencia.');
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
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await window.sicovenStore?.revalidateLicense();
      if (!result) throw new Error('No se recibió respuesta de validación.');
      setStatus(result);
      if (result.authorized) { setNotice(result.message || 'Licencia válida.'); onReady(); }
      else setError(result.message || 'Licencia no autorizada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revalidar.');
    } finally { setBusy(false); }
  };

  const offlineUntil = status?.offlineUntil ? new Date(status.offlineUntil).toLocaleString() : '';

  return <main className="min-h-screen bg-[#0b1428] flex items-center justify-center p-4 sm:p-8">
    <section className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl sm:p-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><KeyRound className="h-6 w-6" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Activación de SICOVEN</h1><p className="text-sm text-slate-500">Licencia vinculada a este equipo</p></div>
      </div>
      {status?.authorized ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" /> Licencia autorizada {status.status === 'offline' ? '(modo offline)' : ''}</p>
        {status.product && <p className="mt-1">Producto: {status.product}</p>}
        {status.customer && <p>Cliente: {status.customer}</p>}
        {offlineUntil && <p className="mt-1 text-xs">Revalidar antes de: {offlineUntil}</p>}
      </div> : <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="flex items-center gap-2 font-semibold text-slate-800"><Wifi className="h-4 w-4" /> Se requiere internet para la activación inicial</p>
        <p className="mt-1">Después de activar, SICOVEN puede seguir trabajando localmente dentro del plazo offline autorizado. Al reconectarse, comprobará el estado de la licencia.</p>
      </div>}
      {status?.message && !status.authorized && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{status.message}</p>}
      <form onSubmit={activate} className="space-y-4">
        <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Clave de licencia</span>
          <input autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required maxLength={120} placeholder="SIC-XXXX-XXXX-XXXX" className="h-12 w-full rounded-xl border border-slate-200 px-4 font-mono text-sm tracking-wide outline-none focus:border-emerald-500" />
        </label>
        {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy ? 'Verificando con el CRM…' : 'Activar licencia'}</button>
      </form>
      {status?.needsActivation === false && <button type="button" disabled={busy} onClick={() => void revalidate()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className="h-4 w-4" />{busy ? 'Comprobando…' : 'Revalidar licencia con internet'}</button>}
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400"><ShieldCheck className="h-4 w-4" /> La clave se almacena cifrada en el equipo y no se muestra después de guardarse.</p>
    </section>
  </main>;
}
