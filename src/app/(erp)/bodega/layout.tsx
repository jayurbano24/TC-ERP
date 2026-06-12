// Limpio para nuevo diseño
// src/app/(erp)/bodega/layout.tsx
import React from 'react';
import '@/components/ui/ui.css';

export default function BodegaLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ '--accent-color': '#f59e0b' } as React.CSSProperties}>
      {children}
    </section>
  );
}
