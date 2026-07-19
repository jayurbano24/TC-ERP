"use client";

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { EMPLOYEE_CURRENT_STATUS_SELECT } from '@/shared/constants/dbProjections';
import { Card } from '@/components/ui';
import { erpSoftStat } from '@/lib/design/tokens';
import {
  Users,
  Clock,
  Coffee,
  LogOut,
  Activity,
  AlertTriangle,
  UserX,
  ClipboardList,
} from 'lucide-react';

type DashStats = {
  personalActivo: number;
  laborando: number;
  desayunando: number;
  almorzando: number;
  salieron: number;
  tarde: number;
  sinSalida: number;
  fuera: number;
  pendientesJustificar: number;
};

const empty: DashStats = {
  personalActivo: 0,
  laborando: 0,
  desayunando: 0,
  almorzando: 0,
  salieron: 0,
  tarde: 0,
  sinSalida: 0,
  fuera: 0,
  pendientesJustificar: 0,
};

export default function DashboardAsistencia() {
  const [stats, setStats] = useState<DashStats>(empty);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    const [
      { count: activos },
      { data: statuses },
      { count: pendientes },
    ] = await Promise.all([
      supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('estado_rrhh', 'Activo'),
      supabase
        .from('employee_current_status')
        .select(EMPLOYEE_CURRENT_STATUS_SELECT)
        .eq('fecha_estado', todayStr),
      supabase
        .from('time_justifications')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'PENDIENTE')
        .gte('created_at', today.toISOString()),
    ]);

    const next = { ...empty, personalActivo: activos || 0, pendientesJustificar: pendientes || 0 };

    if (statuses && statuses.length > 0) {
      for (const row of statuses) {
        const st = String(row.estado_actual || '').toUpperCase();
        if (st === 'LABORANDO') next.laborando++;
        else if (st === 'DESAYUNO') next.desayunando++;
        else if (st === 'ALMUERZO') next.almorzando++;
        else if (st === 'SALIDA_FINAL') next.salieron++;
        else if (st === 'SIN_SALIDA') next.sinSalida++;
        else if (st === 'FUERA') next.fuera++;

        if (row.llego_tarde_hoy) next.tarde++;
      }
    } else {
      // Fallback: proyección aún no migrada / sin filas → calcular desde time_logs
      const { data: logs } = await supabase
        .from('time_logs')
        .select('employee_id, evento_detectado, estado_marcacion, timestamp')
        .gte('timestamp', today.toISOString())
        .order('timestamp', { ascending: true });

      const employeeStates = new Map<string, string>();
      const tardeSet = new Set<string>();

      (logs || []).forEach((log) => {
        const ev = log.evento_detectado?.trim().toUpperCase().replace(/ /g, '_');
        if (ev === 'INGRESO' || ev === 'INGRESO_ESPECIAL') {
          employeeStates.set(log.employee_id, 'LABORANDO');
          if (String(log.estado_marcacion || '').toUpperCase() === 'TARDE') {
            tardeSet.add(log.employee_id);
          }
        } else if (ev === 'DESAYUNO_INICIO' || ev === 'SALIDA_REFACCION') {
          employeeStates.set(log.employee_id, 'DESAYUNO');
        } else if (ev === 'DESAYUNO_FIN' || ev === 'REGRESO_REFACCION') {
          employeeStates.set(log.employee_id, 'LABORANDO');
        } else if (ev === 'ALMUERZO_INICIO' || ev === 'SALIDA_ALMUERZO') {
          employeeStates.set(log.employee_id, 'ALMUERZO');
        } else if (ev === 'ALMUERZO_FIN' || ev === 'REGRESO_ALMUERZO') {
          employeeStates.set(log.employee_id, 'LABORANDO');
        } else if (ev === 'SALIDA_FINAL') {
          employeeStates.set(log.employee_id, 'SALIDA_FINAL');
        } else if (ev === 'SALIDA_OMITIDA') {
          employeeStates.set(log.employee_id, 'SIN_SALIDA');
        }
      });

      employeeStates.forEach((state) => {
        if (state === 'LABORANDO') next.laborando++;
        if (state === 'DESAYUNO') next.desayunando++;
        if (state === 'ALMUERZO') next.almorzando++;
        if (state === 'SALIDA_FINAL') next.salieron++;
        if (state === 'SIN_SALIDA') next.sinSalida++;
      });
      next.tarde = tardeSet.size;
    }

    setStats(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('rrhh-attendance-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_logs' }, () => {
        fetchDashboardData();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_current_status' },
        () => {
          fetchDashboardData();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_justifications' },
        () => {
          fetchDashboardData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="p-8 text-center text-[var(--muted)] animate-pulse font-bold">
        Cargando dashboard...
      </div>
    );
  }

  const cards = [
    { label: 'Personal activo', value: stats.personalActivo, icon: Users, tone: erpSoftStat.muted },
    { label: 'Laborando', value: stats.laborando, icon: Activity, tone: erpSoftStat.success },
    { label: 'Tarde hoy', value: stats.tarde, icon: AlertTriangle, tone: erpSoftStat.warning },
    { label: 'Desayunando', value: stats.desayunando, icon: Coffee, tone: erpSoftStat.warning },
    { label: 'Almorzando', value: stats.almorzando, icon: Clock, tone: erpSoftStat.accent },
    { label: 'Salieron', value: stats.salieron, icon: LogOut, tone: erpSoftStat.muted },
    { label: 'Sin salida', value: stats.sinSalida, icon: UserX, tone: erpSoftStat.danger },
    { label: 'Pendientes justificar', value: stats.pendientesJustificar, icon: ClipboardList, tone: erpSoftStat.accent },
  ];

  return (
    <Card padding="lg" className="border border-[var(--border)] shadow-sm">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[var(--primary)] rounded-2xl flex items-center justify-center">
          <Activity className="w-6 h-6 text-[var(--accent)]" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[var(--heading)] tracking-tight">
            Dashboard en Tiempo Real
          </h2>
          <p className="text-[var(--muted)] font-medium mt-1">
            Estado actual, tardanzas, salidas omitidas y justificaciones pendientes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`${card.tone} p-6 rounded-2xl flex items-center gap-4`}
            >
              <div className="p-4 rounded-xl bg-[var(--surface)]/60 border border-[var(--border)]/50">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest opacity-90">
                  {card.label}
                </p>
                <p className="text-3xl font-black text-[var(--heading)]">{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
