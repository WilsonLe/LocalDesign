/** Monochrome rounded-square line art, matching LocalCut's Lucide mark treatment. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#171717" />
      <g
        fill="none"
        stroke="#fafafa"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m17 42 10-24h10l10 24M22 31h20M32 18v-5M32 43v8M24 43h16" />
        <circle cx="32" cy="18" r="4" fill="#171717" />
      </g>
    </svg>
  );
}
