// Limpio para nuevo diseño
// src/app/(erp)/recepcion/cac/layout.tsx
import React from 'react';
import '@/components/ui/ui.css';

// This layout sets the accent color for the CAC module (teal)
export default function CacLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ '--accent-color': '#06b6d4' } as React.CSSProperties}>
      {children}
    </section>
  );
}
