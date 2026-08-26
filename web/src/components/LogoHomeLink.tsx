import { Link } from 'react-router-dom';
import { Logo } from './Logo';

/** Clickable brand mark — home. */
export function LogoHomeLink({ height = 40 }: { height?: number }) {
  return (
    <Link
      to="/"
      aria-label="Ana sayfa"
      className="logo-home-link inline-flex cursor-pointer rounded-lg transition-transform duration-150 hover:scale-[1.04] hover:shadow-md"
    >
      <Logo height={height} />
    </Link>
  );
}
