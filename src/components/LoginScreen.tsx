import React, { useState } from 'react';
import loginReferenceImg from '../assets/sicoven-login-reference.png';

export type AuthUser = {
  username: string;
  role: string;
  isSeed: boolean;
};

interface LoginScreenProps {
  onLogin: (token: string, user: AuthUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
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
        // No existe un proveedor de autenticación web en este proyecto.
        // Fallar cerrado: nunca crear una sesión ficticia en el navegador.
        throw new Error('El acceso web no está habilitado. Utilice el instalador oficial de SICOVEN para autenticar contra SQLite local.');
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
          background-color: #071f3d;
          font-family: "Segoe UI", Arial, sans-serif;
        }

        .login-background-img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: fill;
          pointer-events: none;
          user-select: none;
          z-index: 1;
        }

        .login-form {
          position: absolute;
          left: 58.78%;
          top: 47.65%;
          width: 35.05%;
          margin: 0;
          z-index: 10;
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

        .developer-credit {
          position: absolute;
          right: 24px;
          bottom: 18px;
          left: auto;
          z-index: 12;
          display: flex;
          align-items: center;
          gap: 12px;
          max-width: min(36vw, 390px);
          padding: 8px 12px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 12px;
          background: rgba(7, 31, 61, 0.58);
          backdrop-filter: blur(5px);
          color: rgba(255, 255, 255, 0.9);
          font: 500 10px/1.35 "Segoe UI", Arial, sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          box-sizing: border-box;
        }

        .developer-credit img {
          display: block;
          width: clamp(112px, 12vw, 168px);
          max-height: 42px;
          object-fit: contain;
          flex: 0 0 auto;
        }

        .developer-credit-label {
          display: block;
          max-width: 105px;
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
          background: rgba(255, 255, 255, 0.9);
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
            background-color: #edf2f8 !important;
            overflow: auto;
          }

          .login-background-img {
            display: none;
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

          .developer-credit {
            position: relative;
            left: auto;
            bottom: auto;
            z-index: 2;
            max-width: min(100%, 430px);
            width: min(100%, 430px);
            justify-content: center;
            margin: 14px auto 0;
            padding: 9px 12px;
            background: #102b4b;
            border-color: #102b4b;
            border-radius: 10px;
          }

          .developer-credit img {
            width: 138px;
            max-height: 36px;
          }

          .developer-credit-label {
            max-width: 100px;
            font-size: 9px;
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
            color: #64758d;
            font-size: 12px;
            text-align: center;
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

      <main
        className="login-screen"
        style={{ backgroundImage: `url(${loginReferenceImg})`, backgroundSize: '100% 100%' }}
      >
        <img
          src={loginReferenceImg}
          alt="SICOVEN - Sistema Contable Integral Multiempresas"
          className="login-background-img"
          draggable={false}
        />
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

          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 7, textAlign: 'center' }}>
            <a href="https://crm-sicoven.vercel.app/comprar" target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '10px 14px', borderRadius: 10, background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#0c4a6e', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
              Ver Planes y Pagos
            </a>
            <p style={{ margin: 0, color: '#e2e8f0', fontSize: 11, lineHeight: 1.45 }}>
              Dispone de 24 horas de prueba. Si desea continuar usando SICOVEN sin interrupciones, puede adquirir su licencia desde Planes y Pagos.
            </p>
          </div>

          {statusMessage && (
            <p className={`status-message ${statusMessage.type}`} role="status" aria-live="polite">
              {statusMessage.text}
            </p>
          )}
        </form>
        <div className="developer-credit" aria-label="Empresa desarrolladora: EFASfreelancer">
          <img src="/efas-logo-horizontal.png" alt="EFASfreelancer" draggable={false} />
          <span className="developer-credit-label">Desarrollador de software SICOVEN</span>
        </div>
      </main>
    </>
  );
};