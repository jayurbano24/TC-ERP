// Limpio para nuevo diseño
// src/app/(erp)/despacho/layout.tsx
import React from 'react';
import '@/components/ui/ui.css';

export default function DespachoLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ '--accent-color': '#10b981' } as React.CSSProperties}>
      {children}
    </section>
  );
}
