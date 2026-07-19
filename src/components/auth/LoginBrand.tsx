'use client';

import { useId } from 'react';
import { useTheme } from '@/components/theme-provider';

type LoginBrandProps = {
  /** Versión más compacta (kiosco). */
  compact?: boolean;
};

/**
 * Marca TC del login: huecos de la "C" reales (máscara), sin caja blanca detrás.
 */
export function LoginBrand({ compact = false }: LoginBrandProps) {
  const { seasonId } = useTheme();
  const maskId = useId().replace(/:/g, '');
  const isChristmas = seasonId === 'christmas';
  const onIllustrated = seasonId !== 'classic';
  /** Otoño / Navidad (noche): marca clara. Resto → azul corporativo. */
  const lightOnDark = seasonId === 'autumn' || seasonId === 'christmas';

  return (
    <div className={compact ? 'mb-2 text-center' : 'mb-8 text-center sm:mb-10'}>
      <div className="relative mb-3 inline-flex items-center justify-center sm:mb-4">
        <svg
          viewBox="0 0 565 280"
          xmlns="http://www.w3.org/2000/svg"
          className={[
            compact ? 'h-auto w-36 sm:w-40' : 'h-auto w-44 sm:w-48',
            lightOnDark ? 'text-white' : 'text-[#2e3165]',
            onIllustrated
              ? lightOnDark
                ? 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]'
                : 'drop-shadow-[0_2px_8px_rgba(15,23,42,0.2)]'
              : '',
          ].join(' ')}
          role="img"
          aria-label="Tech Corps"
        >
          <title>Tech Corps</title>
          <defs>
            {/* Blanco = opaco, negro = transparente → anillo de la C con hueco real */}
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <rect width="565" height="280" fill="black" />
              <circle cx="425" cy="140" r="140" fill="white" />
              <circle cx="425" cy="140" r="85" fill="black" />
              <rect x="500" y="100" width="80" height="60" fill="black" />
              <circle cx="425" cy="140" r="35" fill="white" />
            </mask>
          </defs>
          <g fill="currentColor">
            <rect x="8" y="9" width="232" height="60" />
            <rect x="92" y="9" width="65" height="271" />
          </g>
          <rect width="565" height="280" fill="currentColor" mask={`url(#${maskId})`} />
        </svg>
        {isChristmas ? (
          <svg
            viewBox="0 0 64 48"
            className="absolute -top-2 right-[12%] h-9 w-11 drop-shadow-md sm:-top-3 sm:h-11 sm:w-12"
            aria-hidden
          >
            <path d="M10 30 L32 6 L54 30 Z" fill="#dc2626" />
            <ellipse cx="32" cy="31" rx="24" ry="7" fill="#f8fafc" />
            <circle cx="32" cy="8" r="4.5" fill="#f8fafc" />
          </svg>
        ) : null}
      </div>
      {compact ? null : (
        <p
          className={[
            'text-sm font-medium tracking-wide',
            lightOnDark
              ? 'text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
              : onIllustrated
                ? 'text-[#1e293b]/drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]'
                : 'text-muted',
          ].join(' ')}
        >
          Enterprise Resource Planning &amp; HRMS
        </p>
      )}
    </div>
  );
}
