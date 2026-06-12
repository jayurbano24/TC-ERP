// Limpio para nuevo diseño
// src/app/(erp)/logistica/layout.tsx
import React from 'react';
import '@/components/ui/ui.css';

export default function LogisticaLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ '--accent-color': '#06b6d4' } as React.CSSProperties}>
      {children}
    </section>
  );
}
