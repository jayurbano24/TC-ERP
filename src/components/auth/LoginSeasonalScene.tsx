'use client';

import type { SeasonPresetId } from '@/lib/design/seasonal-presets';

type Props = {
  seasonId: SeasonPresetId;
};

/** Escena de fondo: ilustración suave en bordes, centro libre para el logo TC. */
export function LoginSeasonalScene({ seasonId }: Props) {
  if (seasonId === 'classic') return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {seasonId === 'spring' ? <SpringScene /> : null}
      {seasonId === 'summer' ? <SummerScene /> : null}
      {seasonId === 'autumn' ? <AutumnScene /> : null}
      {seasonId === 'winter' ? <WinterScene /> : null}
      {seasonId === 'christmas' ? <ChristmasScene /> : null}
    </div>
  );
}

function Blossom({
  x,
  y,
  r = 14,
  hue = '#f9a8d4',
}: {
  x: number;
  y: number;
  r?: number;
  hue?: string;
}) {
  const petal = r * 0.72;
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx={0}
          cy={-petal * 0.85}
          rx={petal * 0.55}
          ry={petal}
          fill={hue}
          transform={`rotate(${deg})`}
          opacity={0.95}
        />
      ))}
      <circle r={r * 0.28} fill="#fef3c7" />
    </g>
  );
}

function SpringScene() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfdbfe" />
          <stop offset="50%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#bbf7d0" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#sp-sky)" />
      {/* Colinas inferiores */}
      <path
        d="M0 560 C180 500 320 540 480 520 C640 500 780 560 1200 500 L1200 800 L0 800 Z"
        fill="#86efac"
        opacity="0.55"
      />
      <path
        d="M0 620 C220 580 420 640 640 600 C860 560 1000 640 1200 600 L1200 800 L0 800 Z"
        fill="#4ade80"
        opacity="0.4"
      />

      {/* Rama izquierda (atrás → flores encima) */}
      <g>
        <path
          d="M-20 640 C80 520 120 420 160 300 C190 220 210 160 240 90"
          fill="none"
          stroke="#3f6212"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M160 300 C100 280 60 300 20 340"
          fill="none"
          stroke="#3f6212"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M200 200 C150 170 120 150 80 140"
          fill="none"
          stroke="#3f6212"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <Blossom x={240} y={95} r={16} hue="#f9a8d4" />
        <Blossom x={200} y={150} r={14} hue="#fbcfe8" />
        <Blossom x={165} y={230} r={15} hue="#fda4af" />
        <Blossom x={130} y={300} r={13} hue="#f9a8d4" />
        <Blossom x={55} y={330} r={12} hue="#fb7185" />
        <Blossom x={95} y={145} r={11} hue="#fbcfe8" />
      </g>

      {/* Rama derecha */}
      <g>
        <path
          d="M1220 640 C1120 520 1080 420 1040 300 C1010 220 990 160 960 90"
          fill="none"
          stroke="#3f6212"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M1040 300 C1100 280 1140 300 1180 340"
          fill="none"
          stroke="#3f6212"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M1000 200 C1050 170 1080 150 1120 140"
          fill="none"
          stroke="#3f6212"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <Blossom x={960} y={95} r={16} hue="#f9a8d4" />
        <Blossom x={1000} y={150} r={14} hue="#fbcfe8" />
        <Blossom x={1035} y={230} r={15} hue="#fda4af" />
        <Blossom x={1070} y={300} r={13} hue="#f9a8d4" />
        <Blossom x={1145} y={330} r={12} hue="#fb7185" />
        <Blossom x={1105} y={145} r={11} hue="#fbcfe8" />
      </g>
    </svg>
  );
}

function SummerScene() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="su-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="40%" stopColor="#fde68a" />
          <stop offset="65%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
        <radialGradient id="su-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#su-sky)" />
      <circle cx="980" cy={120} r={110} fill="url(#su-sun)" />
      <circle cx="980" cy={120} r={48} fill="#fde047" />
      {/* Mar / arena — banda inferior, no tapa el centro */}
      <path
        d="M0 580 C300 540 500 600 700 560 C900 520 1050 580 1200 550 L1200 800 L0 800 Z"
        fill="#22d3ee"
        opacity="0.55"
      />
      <path
        d="M0 640 C280 610 520 670 780 630 C980 600 1100 660 1200 640 L1200 800 L0 800 Z"
        fill="#fcd34d"
        opacity="0.85"
      />
      {/* Palmera a la derecha */}
      <g transform="translate(1020,380)">
        <path d="M36 260 C40 180 42 120 40 40" fill="none" stroke="#78350f" strokeWidth="12" strokeLinecap="round" />
        <path d="M40 55 C-10 30 -40 70 40 20" fill="#15803d" />
        <path d="M40 55 C90 30 120 70 40 20" fill="#16a34a" />
        <path d="M40 70 C-20 90 -50 130 35 55" fill="#22c55e" />
        <path d="M40 70 C100 90 130 130 45 55" fill="#15803d" />
        <path d="M40 85 C0 120 -20 160 38 80" fill="#16a34a" />
        <path d="M40 85 C80 120 100 160 42 80" fill="#22c55e" />
      </g>
      {/* Estrella de mar en la arena */}
      <g transform="translate(160,700)" opacity="0.85">
        <path
          d="M0 -18 L5 -5 L20 -5 L8 4 L12 18 L0 10 L-12 18 L-8 4 L-20 -5 L-5 -5 Z"
          fill="#fb7185"
        />
      </g>
    </svg>
  );
}

function AutumnScene() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="au-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="45%" stopColor="#c2410c" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#au-sky)" />
      <path
        d="M0 600 C250 540 450 620 700 560 C950 500 1100 600 1200 560 L1200 800 L0 800 Z"
        fill="#431407"
        opacity="0.5"
      />
      {/* Hojas solo en laterales / arriba, centro libre */}
      {(
        [
          [80, 120, '#fdba74', -20],
          [140, 200, '#f97316', 15],
          [60, 280, '#ea580c', 40],
          [180, 340, '#fb923c', -35],
          [100, 420, '#c2410c', 10],
          [1120, 110, '#f59e0b', 25],
          [1060, 190, '#ea580c', -15],
          [1140, 270, '#fdba74', 30],
          [1020, 330, '#f97316', -40],
          [1100, 410, '#c2410c', 5],
          [200, 80, '#fb923c', 50],
          [1000, 70, '#f97316', -25],
        ] as const
      ).map(([x, y, fill, rot], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
          <path
            d="M0 -20 C10 -6 14 6 0 24 C-14 6 -10 -6 0 -20 Z"
            fill={fill}
            opacity="0.92"
          />
          <path d="M0 -8 L0 18" stroke="#78350f" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

function WinterScene() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="wi-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="55%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#wi-sky)" />
      <ellipse cx="600" cy="740" rx="720" ry="120" fill="#f1f5f9" />
      {/* Pinos laterales */}
      {(
        [
          [140, 520, 1],
          [240, 560, 0.85],
          [960, 530, 1],
          [1060, 560, 0.9],
        ] as const
      ).map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <polygon points="0,-140 55,20 -55,20" fill="#14532d" />
          <polygon points="0,-100 45,10 -45,10" fill="#166534" />
          <polygon points="0,-60 35,15 -35,15" fill="#15803d" />
          <rect x={-6} y={20} width={12} height={36} fill="#78350f" rx={2} />
          <ellipse cx={0} cy={-20} rx={28} ry={8} fill="#f8fafc" opacity="0.55" />
        </g>
      ))}
      {/* Copos suaves */}
      {(
        [
          [90, 90],
          [180, 160],
          [300, 70],
          [900, 100],
          [1020, 160],
          [1100, 80],
          [120, 300],
          [1080, 300],
        ] as const
      ).map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`} opacity="0.65">
          <line x1={-7} y1={0} x2={7} y2={0} stroke="#94a3b8" strokeWidth="1.8" />
          <line x1={0} y1={-7} x2={0} y2={7} stroke="#94a3b8" strokeWidth="1.8" />
          <line x1={-5} y1={-5} x2={5} y2={5} stroke="#cbd5e1" strokeWidth="1.4" />
          <line x1={5} y1={-5} x2={-5} y2={5} stroke="#cbd5e1" strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  );
}

function ChristmasScene() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="xm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="45%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>
        <radialGradient id="xm-glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#xm-sky)" />
      <ellipse cx="600" cy="320" rx="280" ry="160" fill="url(#xm-glow)" />
      {/* Nieve inferior */}
      <ellipse cx="600" cy="760" rx="780" ry="140" fill="#f1f5f9" opacity="0.92" />
      {/* Árbol izquierdo */}
      <g transform="translate(160,480)">
        <polygon points="0,-160 70,40 -70,40" fill="#14532d" />
        <polygon points="0,-110 55,30 -55,30" fill="#166534" />
        <polygon points="0,-60 40,25 -40,25" fill="#15803d" />
        <rect x={-8} y={40} width={16} height={40} fill="#78350f" rx={2} />
        <polygon points="0,-168 10,-148 -10,-148" fill="#facc15" />
        <circle cx={-28} cy={-40} r={5} fill="#dc2626" />
        <circle cx={22} cy={-20} r={5} fill="#facc15" />
        <circle cx={-10} cy={10} r={5} fill="#f87171" />
        <circle cx={30} cy={-70} r={4.5} fill="#fbbf24" />
      </g>
      {/* Árbol derecho */}
      <g transform="translate(1040,500)">
        <polygon points="0,-150 65,35 -65,35" fill="#14532d" />
        <polygon points="0,-100 50,28 -50,28" fill="#166534" />
        <polygon points="0,-55 38,22 -38,22" fill="#15803d" />
        <rect x={-7} y={35} width={14} height={36} fill="#78350f" rx={2} />
        <polygon points="0,-158 9,-140 -9,-140" fill="#facc15" />
        <circle cx={25} cy={-35} r={5} fill="#dc2626" />
        <circle cx={-24} cy={-10} r={5} fill="#facc15" />
        <circle cx={8} cy={15} r={4.5} fill="#f87171" />
      </g>
      {/* Regalos laterales */}
      <g transform="translate(80,680)">
        <rect x={0} y={0} width={48} height={36} rx={3} fill="#dc2626" />
        <rect x={20} y={0} width={8} height={36} fill="#facc15" />
        <rect x={0} y={14} width={48} height={8} fill="#facc15" />
      </g>
      <g transform="translate(1070,690)">
        <rect x={0} y={0} width={42} height={32} rx={3} fill="#166534" />
        <rect x={17} y={0} width={8} height={32} fill="#fef08a" />
        <rect x={0} y={12} width={42} height={8} fill="#fef08a" />
      </g>
      {/* Copos / luces */}
      {(
        [
          [100, 80, '#fef9c3'],
          [220, 140, '#fde68a'],
          [340, 60, '#fef9c3'],
          [860, 90, '#fde68a'],
          [980, 150, '#fef9c3'],
          [1100, 70, '#fde68a'],
          [140, 260, '#fecaca'],
          [1060, 280, '#fecaca'],
        ] as const
      ).map(([x, y, fill], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 3 : 2.2} fill={fill} opacity="0.85" />
      ))}
    </svg>
  );
}

/** Icono pequeño de temporada (login / selector). */
export function LoginSeasonBadge({ seasonId }: Props) {
  if (seasonId === 'classic') return null;

  const wrap =
    'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent';

  if (seasonId === 'spring') {
    return (
      <span className={wrap} title="Primavera" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <circle cx="12" cy="9" r="2.2" fill="#fef3c7" />
          <ellipse cx="12" cy="5.2" rx="2" ry="3" fill="currentColor" opacity="0.9" />
          <ellipse cx="16.2" cy="8.2" rx="2" ry="3" fill="currentColor" opacity="0.85" transform="rotate(72 16.2 8.2)" />
          <ellipse cx="14.6" cy="13" rx="2" ry="3" fill="currentColor" opacity="0.85" transform="rotate(144 14.6 13)" />
          <ellipse cx="9.4" cy="13" rx="2" ry="3" fill="currentColor" opacity="0.85" transform="rotate(216 9.4 13)" />
          <ellipse cx="7.8" cy="8.2" rx="2" ry="3" fill="currentColor" opacity="0.85" transform="rotate(288 7.8 8.2)" />
          <path d="M12 12v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 16c-2 .2-3.5 1.5-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      </span>
    );
  }
  if (seasonId === 'summer') {
    return (
      <span className={wrap} title="Verano" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <circle cx="12" cy="12" r="3.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="12"
              y1="3"
              x2="12"
              y2="5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${deg} 12 12)`}
            />
          ))}
        </svg>
      </span>
    );
  }
  if (seasonId === 'autumn') {
    return (
      <span className={wrap} title="Otoño" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path
            d="M12 3c2.5 3.5 5.5 5 5.5 9 0 3.2-2.4 6.2-5.5 8-3.1-1.8-5.5-4.8-5.5-8 0-4 3-5.5 5.5-9z"
            fill="currentColor"
          />
          <path d="M12 9v11" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (seasonId === 'winter') {
    return (
      <span className={wrap} title="Invierno" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <line x1="12" y1="3" x2="12" y2="21" strokeLinecap="round" />
          <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  }
  return (
    <span className={wrap} title="Navidad" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5">
        <polygon points="12,2 15,8 12,7 9,8" fill="#facc15" />
        <polygon points="12,6 18,14 6,14" fill="currentColor" />
        <polygon points="12,10 17,18 7,18" fill="currentColor" opacity="0.85" />
        <rect x="10.5" y="18" width="3" height="3.5" rx="0.5" fill="#78350f" />
        <circle cx="9" cy="12" r="1.2" fill="#fef08a" />
        <circle cx="14.5" cy="15" r="1.2" fill="#fecaca" />
      </svg>
    </span>
  );
}
