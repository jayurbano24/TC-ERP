// Limpio para nuevo diseño
// src/app/(erp)/taller/layout.tsx
import React from 'react';
import '@/components/ui/ui.css';

export default function TallerLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ '--accent-color': '#ef4444' } as React.CSSProperties}>
      {children}
    </section>
  );
}
