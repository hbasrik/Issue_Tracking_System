import { Link } from 'react-router-dom';
import { Logo } from './Logo';

/** Clickable brand mark — home. Hover lifts the white plate slightly. */
export function LogoHomeLink({ height = 40 }: { height?: number }) {
  return (
    <Link
      to="/"
      aria-label="Ana sayfa"
      className="inline-flex cursor-pointer rounded-lg transition-transform duration-150 hover:scale-[1.04] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sidebar-text)]"
    >
      <Logo height={height} />
    </Link>
  );
}
