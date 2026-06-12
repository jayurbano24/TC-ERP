// Limpio para nuevo diseño
// src/app/(erp)/recepcion/px/layout.tsx
import React from 'react';
import '@/components/ui/ui.css';

export default function PxLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ '--accent-color': '#9333ea' } as React.CSSProperties}>
      {children}
    </section>
  );
}
