// Limpio para nuevo diseño
// src/app/(erp)/series/layout.tsx
import React from 'react';
import '@/components/ui/ui.css';

export default function SeriesLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ '--accent-color': '#6366f1' } as React.CSSProperties}>
      {children}
    </section>
  );
}
