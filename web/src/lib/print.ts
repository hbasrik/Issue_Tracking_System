/** Activate one print document and open the browser print dialog. */
export async function printSection(id: string): Promise<void> {
  document.body.dataset.print = id;
  const root = document.querySelector(`.print-root[data-print-id="${CSS.escape(id)}"]`);
  if (root) {
    const imgs = Array.from(root.querySelectorAll('img'));
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              }),
      ),
    );
  }
  // Two frames + short settle so Recharts SVGs layout at fixed print sizes.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 350);
  });
  const cleanup = () => {
    delete document.body.dataset.print;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
