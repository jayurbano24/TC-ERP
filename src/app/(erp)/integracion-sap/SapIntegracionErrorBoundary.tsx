'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { erpSoftStat } from '@/lib/design/tokens';

type Props = { children: React.ReactNode };

type State = { error: Error | null };

export class SapIntegracionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[integracion-sap]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className={`${erpSoftStat.danger} p-8 rounded-3xl max-w-xl mx-auto mt-16`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <div>
              <p className="text-sm font-black uppercase tracking-widest mb-2">
                Error en Integración SAP
              </p>
              <p className="text-xs font-bold mb-4 leading-relaxed">
                {this.state.error.message ||
                  'Excepción en el navegador. Si estaba cargando un G985 grande, exporte a CSV o divida el archivo e intente de nuevo.'}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => this.setState({ error: null })}
              >
                Reintentar pantalla
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
