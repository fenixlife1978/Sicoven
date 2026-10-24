import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  RefreshCw,
  ArrowLeft,
  LogOut,
  UserCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface AdminUsersProps {
  token: string;
  user: {
    username: string;
    isSeed: boolean;
  };
  onLogout: () => void;
  onBack: () => void;
}

interface AdminUserRecord {
  id: number;
  username: string;
  isSeed: boolean;
  createdAt: string;
}

const WEB_ADMINS_STORAGE_KEY = 'sicoven_web_admin_users';

function getWebAdminsFromStorage(): AdminUserRecord[] {
  try {
    const raw = localStorage.getItem(WEB_ADMINS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  const defaults: AdminUserRecord[] = [
    { id: 1, username: 'admin', isSeed: true, createdAt: new Date().toISOString() },
  ];
  try {
    localStorage.setItem(WEB_ADMINS_STORAGE_KEY, JSON.stringify(defaults));
  } catch {}
  return defaults;
}

export function AdminUsers({ token, user, onLogout, onBack }: AdminUsersProps) {
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      if (window.sicovenStore?.listAdmins) {
        const r = await window.sicovenStore.listAdmins(token);
        if (r?.ok) {
          setAdmins(r.admins || []);
        } else {
          setMessage({ text: r?.message || 'No se pudo consultar usuarios administradores.', type: 'error' });
        }
      } else {
        // Fallback for Web preview mode
        setAdmins(getWebAdminsFromStorage());
      }
    } catch {
      setMessage({ text: 'Error al consultar la lista de administradores.', type: 'error' });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const rawUser = username.trim();
    const cleanUser = rawUser.replace(/\s+/g, '_');

    if (!cleanUser || cleanUser.length < 3 || cleanUser.length > 32) {
      setMessage({
        text: 'El nombre de usuario debe tener entre 3 y 32 caracteres.',
        type: 'error',
      });
      setBusy(false);
      return;
    }

    if (!password || password.length < 6) {
      setMessage({
        text: 'La contraseña debe tener al menos 6 caracteres.',
        type: 'error',
      });
      setBusy(false);
      return;
    }

    try {
      if (window.sicovenStore?.createAdmin) {
        // Desktop SQLite Authentication
        const r = await window.sicovenStore.createAdmin(token, {
          username: cleanUser,
          password,
        });
        if (!r?.ok) {
          throw new Error(r?.message || 'No se pudo crear el administrador.');
        }
      } else {
        // Web preview mode fallback with localStorage
        const currentList = getWebAdminsFromStorage();
        if (currentList.some((a) => a.username.toLowerCase() === cleanUser.toLowerCase())) {
          throw new Error('Ese nombre de usuario ya existe. Elige uno diferente.');
        }
        const newRecord: AdminUserRecord = {
          id: Date.now(),
          username: cleanUser,
          isSeed: false,
          createdAt: new Date().toISOString(),
        };
        const updatedList = [...currentList, newRecord];
        localStorage.setItem(WEB_ADMINS_STORAGE_KEY, JSON.stringify(updatedList));
      }

      setUsername('');
      setPassword('');
      setMessage({ text: 'Administrador creado correctamente.', type: 'success' });
      await refresh();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Error al registrar el administrador.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSeed = async () => {
    if (!confirm('¿Confirma que desea eliminar el administrador semilla predeterminado "admin"?')) {
      return;
    }
    try {
      if (window.sicovenStore?.deleteSeedAdmin) {
        const r = await window.sicovenStore.deleteSeedAdmin(token);
        if (r?.ok) {
          setMessage({ text: 'Administrador semilla eliminado con éxito.', type: 'success' });
        } else {
          setMessage({ text: r?.message || 'No se pudo eliminar el administrador semilla.', type: 'error' });
        }
      } else {
        // Web preview mode fallback
        const currentList = getWebAdminsFromStorage();
        const filtered = currentList.filter((a) => !a.isSeed);
        localStorage.setItem(WEB_ADMINS_STORAGE_KEY, JSON.stringify(filtered));
        setMessage({ text: 'Administrador semilla eliminado con éxito.', type: 'success' });
      }
      await refresh();
    } catch {
      setMessage({ text: 'Error al procesar la solicitud.', type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Top Bar with Branding and Navigation */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-md no-print">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Logo & System Identity */}
          <div className="flex items-center gap-3">
            <img
              src="/sicoven-logo-horizontal-nav.svg"
              alt="SICOVEN"
              className="h-8 sm:h-9 w-auto max-w-[180px] sm:max-w-[220px] object-contain"
            />
            <span className="hidden sm:inline-block text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Gestión de Seguridad
            </span>
          </div>

          {/* Action Buttons: Volver al sistema & Cerrar sesión */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer"
              title="Regresar al panel de contabilidad y módulos del sistema"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al sistema</span>
            </button>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs sm:text-sm font-medium transition cursor-pointer"
              title="Cerrar la sesión actual"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        
        {/* Page Title & Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Control de Administradores
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Administración de usuarios autorizados con acceso al sistema y base de datos local.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm self-start sm:self-auto">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Sesión activa: <strong className="text-slate-900">{user.username}</strong></span>
          </div>
        </div>

        {/* Feedback Message Banner */}
        {message && (
          <div
            role="status"
            className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        {/* Form: Create New Administrator */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base mb-4 pb-2 border-b border-slate-100">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            <h2>Registrar Nuevo Administrador</h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nombre de usuario
                </label>
                <input
                  required
                  type="text"
                  minLength={3}
                  maxLength={32}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej: contador_principal o juan_perez"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  3 a 32 caracteres (letras, números, punto, guion o guion bajo).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Contraseña de acceso
                </label>
                <input
                  required
                  type="password"
                  minLength={6}
                  maxLength={256}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Mínimo 6 caracteres (admite letras, números y símbolos).
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-sm transition cursor-pointer disabled:opacity-60"
              >
                <UserPlus className="w-4 h-4" />
                <span>{busy ? 'Creando administrador...' : 'Crear Administrador'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Existing Administrators List */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2>Usuarios Administradores ({admins.length})</h2>
            </div>
            <button
              onClick={() => void refresh()}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              title="Actualizar lista"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {admins.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Cargando o no se encontraron administradores registrados.
              </p>
            ) : (
              admins.map((adm) => (
                <div
                  key={adm.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm">
                      {adm.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {adm.username}
                        </span>
                        {adm.isSeed && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Semilla inicial
                          </span>
                        )}
                        {adm.username.toLowerCase() === user.username.toLowerCase() && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Tú
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Registrado el: {new Date(adm.createdAt).toLocaleString('es-VE')}
                      </p>
                    </div>
                  </div>

                  {adm.isSeed && admins.length >= 2 && (
                    <button
                      onClick={handleRemoveSeed}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer self-start sm:self-auto"
                      title="Eliminar usuario semilla 'admin' ya que existen administradores personalizados"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar administrador semilla</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100">
            * El usuario semilla «admin» solo puede eliminarse una vez que se haya creado al menos otro administrador para no bloquear el acceso al sistema.
          </p>
        </section>
      </main>
    </div>
  );
}