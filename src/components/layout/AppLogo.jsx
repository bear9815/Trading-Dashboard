/**
 * AppLogo — SVG mark + wordmark for Trading Dashboard.
 * size="sm"  → 32px mark, used in sidebar collapsed / login
 * size="md"  → 36px mark, used in sidebar expanded
 */
export default function AppLogo({ size = 'md', showWordmark = true }) {
  const dim = size === 'sm' ? 32 : 36

  return (
    <div className="flex items-center gap-2.5 shrink-0">
      {/* ── SVG Mark ── */}
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Rounded background */}
        <rect width="36" height="36" rx="9" fill="url(#bg_grad)" />

        {/* Grid lines (subtle) */}
        <line x1="7" y1="27" x2="29" y2="27" stroke="white" strokeOpacity="0.08" strokeWidth="0.75"/>
        <line x1="7" y1="21" x2="29" y2="21" stroke="white" strokeOpacity="0.06" strokeWidth="0.75"/>
        <line x1="7" y1="15" x2="29" y2="15" stroke="white" strokeOpacity="0.06" strokeWidth="0.75"/>

        {/* Area fill under the chart line */}
        <path
          d="M7 27 L11 22 L15 24 L20 14 L25 17 L29 9 L29 27 Z"
          fill="url(#area_grad)"
        />

        {/* Chart line */}
        <polyline
          points="7,27 11,22 15,24 20,14 25,17 29,9"
          stroke="url(#line_grad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Diamond accent on the peak */}
        <path
          d="M29 9 L31 7 L29 5 L27 7 Z"
          fill="#60a5fa"
          opacity="0.9"
        />

        {/* Dot on the peak */}
        <circle cx="29" cy="9" r="2" fill="white" opacity="0.95"/>

        {/* Gradient defs */}
        <defs>
          <linearGradient id="bg_grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1e3a5f"/>
            <stop offset="100%" stopColor="#0f1f3d"/>
          </linearGradient>
          <linearGradient id="area_grad" x1="18" y1="9" x2="18" y2="27" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03"/>
          </linearGradient>
          <linearGradient id="line_grad" x1="7" y1="27" x2="29" y2="9" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa"/>
            <stop offset="100%" stopColor="#a78bfa"/>
          </linearGradient>
        </defs>
      </svg>

      {/* ── Wordmark ── */}
      {showWordmark && (
        <div className="hidden md:flex flex-col leading-none">
          <span className="text-[14px] font-semibold text-white tracking-[0.14em] uppercase">Trading</span>
          <span className="text-[11px] font-semibold text-[#9bc5ff] tracking-[0.34em] uppercase">Dashboard</span>
        </div>
      )}
    </div>
  )
}
