/** In-card section title — Satsuma, not body text. */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[15px] font-semibold text-[var(--accent)]">{children}</h3>
  );
}
