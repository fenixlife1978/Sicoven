import React, { useState } from 'react';

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
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const handleQuickFill = () => {
    setUsername('admin');
    setPassword('Admin123');
    setStatusMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setBusy(true);

    try {
      const userVal = username.trim();
      if (!userVal || !password) {
        throw new Error('Ingrese sus credenciales para acceder al sistema.');
      }

      if (window.sicovenStore?.login) {
        // Desktop SQLite Authentication
        const res = await window.sicovenStore.login({ username: userVal, password });
        if (!res.ok || !res.token || !res.user) {
          throw new Error(res.message || 'No se pudo iniciar sesión. Verifica tus credenciales.');
        }
        setStatusMessage({ text: 'Acceso verificado. Entrando al sistema…', type: 'success' });
        onLogin(res.token, res.user);
      } else {
        // Web preview / Demo interactive fallback
        setStatusMessage({ text: 'Acceso verificado. Entrando al sistema…', type: 'success' });
        onLogin('session-token', {
          username: userVal,
          role: 'admin',
          isSeed: userVal.toLowerCase() === 'admin',
        });
      }
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : 'No se pudo iniciar sesión. Verifica tus credenciales.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        :root {
          --navy: #071f3d;
          --blue: #164d80;
          --yellow: #ffca05;
          --green: #009b7e;
          --white: #ffffff;
        }

        .login-screen {
          position: relative;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          background-color: #f4f7fb;
          background-image:
            radial-gradient(ellipse at 15% 15%, rgba(0, 155, 126, 0.20), transparent 34%),
            linear-gradient(112deg, #071f3d 0%, #103b65 43%, #edf3f8 43.1%, #ffffff 100%);
          background-repeat: no-repeat;
          background-position: center center;
          background-size: cover;
          font-family: "Segoe UI", Arial, sans-serif;
        }

        .login-brand {
          position: absolute;
          z-index: 1;
          left: 5.5%;
          top: 7%;
          width: min(32vw, 360px);
          max-height: 100px;
          object-fit: contain;
          object-position: left center;
          filter: drop-shadow(0 3px 12px rgba(0,0,0,.08));
        }

        .login-form {
          position: absolute;
          z-index: 2;
          left: 58.78%;
          top: 47.65%;
          width: 35.05%;
          margin: 0;
        }

        .field {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          height: clamp(42px, 6.75vh, 70px);
          margin-bottom: clamp(8px, 1.56vh, 16px);
          padding: 0 18px 0 70px;
          border: 1px solid #c8d2df;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 1px 2px rgba(10, 36, 65, 0.06);
          box-sizing: border-box;
        }

        .field svg.icon-field {
          position: absolute;
          left: 23px;
          width: 27px;
          height: 27px;
          fill: none;
          stroke: #183b60;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          pointer-events: none;
        }

        .field:first-child svg.icon-field {
          stroke: #6397ce;
        }

        .field input {
          width: 100%;
          min-width: 0;
          padding: 0;
          border: 0;
          outline: none;
          background: transparent;
          color: #18304f;
          font: 400 clamp(12px, 1.3vw, 20px) "Segoe UI", Arial, sans-serif;
        }

        .field input::placeholder {
          color: #64758d;
          opacity: 1;
        }

        .field:focus-within {
          border-color: #3c83bd;
          box-shadow: 0 0 0 3px rgba(60, 131, 189, 0.14);
        }

        .password-field {
          padding-right: 57px;
        }

        .toggle-password {
          position: absolute;
          right: 14px;
          top: 50%;
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          padding: 0;
          transform: translateY(-50%);
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #173555;
          cursor: pointer;
        }

        .toggle-password svg {
          position: static;
          width: 25px;
          height: 25px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .submit-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 13px;
          width: 100%;
          height: clamp(46px, 7.3vh, 75px);
          margin-top: clamp(15px, 2.93vh, 30px);
          border: 0;
          border-radius: 14px;
          background: linear-gradient(110deg, #008f79, #009c7d);
          color: white;
          font: 700 clamp(14px, 1.65vw, 24px) "Segoe UI", Arial, sans-serif;
          cursor: pointer;
          transition: filter 0.2s, transform 0.2s;
          box-sizing: border-box;
        }

        .submit-button:hover {
          filter: brightness(1.06);
        }

        .submit-button:active {
          transform: scale(0.99);
        }

        .submit-button:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        .submit-button svg {
          width: 27px;
          height: 27px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .status-message {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          width: 100%;
          margin: 0;
          padding: 10px 12px;
          border-radius: 8px;
          background: white;
          color: #18304f;
          font-size: 13px;
          box-shadow: 0 3px 12px #10243a18;
          box-sizing: border-box;
        }

        .status-message.error {
          color: #a32323;
          border: 1px solid #fecaca;
          background: #fef2f2;
        }

        .status-message.success {
          color: #00775e;
          border: 1px solid #a7f3d0;
          background: #ecfdf5;
        }

        .quick-credentials-hint {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 11px;
          color: #64748b;
        }

        .quick-credentials-btn {
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid #cbd5e1;
          color: #334155;
          padding: 3px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          transition: background 0.15s;
        }

        .quick-credentials-btn:hover {
          background: #ffffff;
          color: #0f172a;
        }

        @media (max-width: 700px) {
          .login-screen {
            min-height: 100dvh;
            height: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
            background-image: linear-gradient(135deg, #071f3d 0, #164d80 180px, #edf2f8 180px, #edf2f8 100%);
            background-color: #edf2f8;
            overflow: auto;
          }

          .login-screen::before {
            content: "";
            position: absolute;
            inset: 0 0 auto;
            height: 180px;
            background:
              linear-gradient(135deg, transparent 75%, #164d80 75%),
              linear-gradient(120deg, #071f3d 0 75%, #ffca05 75% 78%, #071f3d 78%);
          }

          .login-brand {
            left: 24px;
            top: 28px;
            width: min(70vw, 280px);
            max-height: 68px;
          }

          .login-form {
            position: relative;
            left: auto;
            top: auto;
            width: min(100%, 430px);
            margin-top: 115px;
            padding: 28px 22px;
            border: 1px solid #dbe3ed;
            border-radius: 18px;
            background: #fff;
            box-shadow: 0 18px 50px #10243a1c;
          }

          .login-form::before {
            content: "SICOVEN";
            display: block;
            margin-bottom: 8px;
            color: #102b4b;
            font-size: 27px;
            font-weight: 800;
          }

          .login-form::after {
            content: "Sistema Contable Integral Multiempresas";
            display: block;
            margin-top: 22px;
            color: #ffffff;
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            text-shadow: 0 1px 3px rgba(7, 31, 61, 0.85);
          }

          .field {
            height: 54px;
            margin-bottom: 13px;
            border-radius: 10px;
          }

          .field input {
            font-size: 15px;
          }

          .submit-button {
            height: 56px;
            margin-top: 18px;
            border-radius: 10px;
            font-size: 17px;
          }
        }

        @media (max-height: 600px) and (min-width: 701px) {
          .field {
            height: 42px;
            margin-bottom: 8px;
          }

          .submit-button {
            height: 46px;
            margin-top: 12px;
          }
        }
      `}</style>

      <main className="login-screen">
        <img className="login-brand" src="./sicoven-logo-horizontal.svg" alt="SICOVEN · Sistema contable" />
        <form className="login-form" id="loginForm" autoComplete="on" onSubmit={handleSubmit}>
          <label className="field" htmlFor="username">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-field">
              <circle cx="12" cy="8" r="4"></circle>
              <path d="M4 21v-2a8 8 0 0 1 16 0v2z"></path>
            </svg>

            <input
              id="username"
              name="username"
              type="text"
              placeholder="Usuario o correo electrónico"
              autoComplete="username"
              maxLength={254}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="field password-field" htmlFor="password">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-field">
              <rect x="4" y="10" width="16" height="11" rx="2"></rect>
              <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
              <path d="M12 14v3"></path>
            </svg>

            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              autoComplete="current-password"
              maxLength={1024}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              className="toggle-password"
              id="togglePassword"
              type="button"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title="Mostrar u ocultar contraseña"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {showPassword ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </>
                ) : (
                  <>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </>
                )}
              </svg>
            </button>
          </label>

          <button className="submit-button" id="submitButton" type="submit" disabled={busy}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 17l5-5-5-5"></path>
              <path d="M15 12H3"></path>
              <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"></path>
            </svg>
            <span>{busy ? 'Verificando…' : 'Iniciar sesión'}</span>
          </button>

          <div className="quick-credentials-hint">
            <button
              type="button"
              onClick={handleQuickFill}
              className="quick-credentials-btn"
              title="Autocompletar credenciales por defecto (admin / Admin123)"
            >
              Completar: admin / Admin123
            </button>
            {isDemoMode && (
              <span style={{ fontWeight: 600, color: '#b45309' }}>
                Versión Demo
              </span>
            )}
          </div>

          {statusMessage && (
            <p className={`status-message ${statusMessage.type}`} role="status" aria-live="polite">
              {statusMessage.text}
            </p>
          )}
        </form>
      </main>
    </>
  );
};