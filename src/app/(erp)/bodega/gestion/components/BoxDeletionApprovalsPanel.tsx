'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge } from '@/components/ui';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { listBoxDeletionRequests } from '@/modules/inventario/client/warehouseBoxes';

type Props = {
  enabled: boolean;
};

/** Resumen compacto en Bodega → enlaza al módulo Autorizaciones del Gerente. */
export function BoxDeletionApprovalsPanel({ enabled }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['box-deletion-requests', 'pending', 'bodega-banner'],
    queryFn: async () => {
      const res = await listBoxDeletionRequests('pending', 50);
      if (res.error) throw new Error(res.error);
      return res.data || [];
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });

  if (!enabled) return null;

  const rows = data || [];
  if (!isLoading && rows.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-rose-500 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="bg-rose-50 p-2.5 rounded-2xl shrink-0">
          <ShieldCheck className="w-5 h-5 text-rose-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-black tracking-widest text-[var(--heading)] uppercase">
              Autorizaciones pendientes
            </h3>
            <Badge variant="yellow">{isLoading ? '…' : rows.length}</Badge>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            Revise y resuelva en el módulo Autorizaciones (Gerente General).
          </p>
        </div>
      </div>
      <Link href="/autorizaciones" className="shrink-0">
        <Button variant="primary" className="w-full sm:w-auto" leftIcon={<ArrowRight className="w-4 h-4" />}>
          Ir a Autorizaciones
        </Button>
      </Link>
    </Card>
  );
}
