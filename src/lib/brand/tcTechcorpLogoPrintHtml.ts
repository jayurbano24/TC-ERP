/** Marca horizontal TC + TECHCORP para impresión (fondo claro). */
export function tcTechcorpLogoPrintHtml(): string {
  return `
    <div class="brand-bar">
      <svg class="brand-logo" viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Techcorp">
        <defs>
          <mask id="tc-logo-mask-print" maskUnits="userSpaceOnUse">
            <rect width="565" height="280" fill="black" />
            <circle cx="425" cy="140" r="140" fill="white" />
            <circle cx="425" cy="140" r="85" fill="black" />
            <rect x="500" y="100" width="80" height="60" fill="black" />
            <circle cx="425" cy="140" r="35" fill="white" />
          </mask>
        </defs>
        <g fill="#2e3165">
          <rect x="8" y="9" width="232" height="60" />
          <rect x="92" y="9" width="65" height="271" />
        </g>
        <rect width="565" height="280" fill="#2e3165" mask="url(#tc-logo-mask-print)" />
      </svg>
      <span class="brand-name">TECHCORP</span>
    </div>`;
}
