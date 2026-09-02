import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { BRAND_NAME } from '../../../shared/brand';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { Logo } from '../components/Logo';
import { useI18n } from '../i18n';
import { ApiError } from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';

export default function LoginPage() {
  const { t } = useI18n();
  const { login, isAuthenticated, has, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotHint, setForgotHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated && user?.MustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  if (isAuthenticated && has(Perm.WebAccess)) {
    return <Navigate to="/" replace />;
  }
  if (isAuthenticated && !has(Perm.WebAccess)) {
    return <Navigate to="/not-authorized" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password, rememberMe);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err, t) : t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            <Logo height={56} alt={BRAND_NAME} className="mx-auto" />
            <p className="login-brand-name">{BRAND_NAME}</p>
            <p className="login-brand-sub">{t('login.productSubtitle')}</p>
          </div>

          <div className="login-intro">
            <h1 className="login-welcome">{t('login.welcome')}</h1>
            <p className="login-welcome-hint">{t('login.welcomeHint')}</p>
          </div>

          <form onSubmit={onSubmit} className="login-form">
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <label className="login-field">
              <span className="login-field-inner">
                <User
                  className="login-field-icon"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.emailPlaceholder')}
                  autoComplete="email"
                  required
                  className="login-input"
                />
              </span>
            </label>

            <label className="login-field">
              <span className="login-field-inner">
                <Lock
                  className="login-field-icon"
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  className="login-input login-input-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? t('login.hidePassword') : t('login.showPassword')
                  }
                >
                  {showPassword ? (
                    <EyeOff size={18} strokeWidth={2} aria-hidden />
                  ) : (
                    <Eye size={18} strokeWidth={2} aria-hidden />
                  )}
                </button>
              </span>
            </label>

            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="login-checkbox"
                />
                <span>{t('login.rememberMe')}</span>
              </label>
              <button
                type="button"
                className="login-forgot"
                onClick={() => setForgotHint(true)}
              >
                {t('login.forgotPassword')}
              </button>
            </div>

            {forgotHint && (
              <p className="login-forgot-hint" role="status">
                {t('login.forgotPasswordHint')}
              </p>
            )}

            <button type="submit" disabled={busy} className="login-submit">
              {busy ? t('login.submitting') : t('login.submit')}
            </button>
          </form>

          <p className="login-copyright">
            {t('login.copyright', { year: 2026, brand: BRAND_NAME })}
          </p>
        </div>
      </div>

      <div className="login-wallpaper-pane" aria-hidden>
        <img
          src="/karea_wallpaper.png"
          alt=""
          className="login-wallpaper-img"
          decoding="async"
        />
      </div>
    </div>
  );
}
