/**
 * The handful of icons this app needs, inline as SVG.
 *
 * Inline rather than a package: six glyphs don't justify a dependency, and
 * these inherit `currentColor` so they theme for free. Never emoji — they
 * render differently on every platform and can't be styled.
 *
 * Decorative by default (`aria-hidden`), because every icon here sits beside
 * a visible text label. Pass a `title` only for a genuinely standalone icon.
 */

const PATHS = {
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  close: 'M18 6L6 18M6 6l12 12',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z',
  filter: 'M4 5h16M7 12h10M10 19h4',
  'map-pin': 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  tag: 'M20.59 13.41L13.42 20.6a2 2 0 0 1-2.83 0L2.01 12l.01-7a2 2 0 0 1 2-2l7-.01 8.58 8.59a2 2 0 0 1 0 2.83zM7 7h.01',
  trophy: 'M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM7 5H4a3 3 0 0 0 3 3M17 5h3a3 3 0 0 1-3 3',
};

/**
 * @param {{name: keyof PATHS, size?: number, title?: string}} props
 */
export default function Icon({ name, size = 16, title }) {
  const d = PATHS[name];
  if (!d) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
