import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Logo } from './Logo';

/** Clickable brand mark — home. */
export function LogoHomeLink({
  height = 40,
  compact = false,
}: {
  height?: number;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Link
      to="/"
      aria-label={t('nav.homeAria')}
      className="logo-home-link inline-flex cursor-pointer rounded-lg transition-transform duration-150 hover:scale-[1.04] hover:shadow-md"
    >
      <Logo height={compact ? 28 : height} alt={t('login.brand')} />
    </Link>
  );
}
