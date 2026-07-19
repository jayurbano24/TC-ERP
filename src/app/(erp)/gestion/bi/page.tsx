"use client";

import React, { useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  AlertCircle, 
  Target, 
  Layers, 
  Cpu, 
  Calendar,
  Filter,
  Download,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

const techData = [
  { tech: 'Huawei', count: 1240, color: 'bg-[var(--accent)]' },
  { tech: 'Nokia', count: 850, color: 'bg-[var(--success)]' },
  { tech: 'ZTE', count: 420, color: 'bg-[var(--muted)]' },
];

const userPerformance = [
  { name: 'Geiry Urbano', role: 'Receptor', prod: 145, goal: 150, trend: 'up' },
  { name: 'Herbert Patzan', role: 'Técnico L3', prod: 12, goal: 10, trend: 'up' },
  { name: 'Juan Perez', role: 'Bodega', prod: 850, goal: 1000, trend: 'down' },
];

export default function BiDashboardPage() {
  const [timeRange, setTimeRange] = useState('Hoy');

  return (
    <ModulePage
      title="Dashboard Gerencial & BI"
      subtitle="Análisis de producción en tiempo real, cumplimiento de metas y proyecciones de capacidad operativa."
      category="Gestión"
      actions={
        <div className="flex gap-2">
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2 text-xs font-bold text-[var(--foreground)] outline-none"
          >
            <option>Hoy</option>
            <option>Semana</option>
            <option>Mes</option>
          </select>
          <Button variant="outline" size="sm" leftIcon={<Download className="w-4 h-4" />}>PDF</Button>
        </div>
      }
    >
      <div className="space-y-8">
        
        {/* Top Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Producción Total', valor: '2,510', sub: '+12% vs ayer', icon: <Layers />, color: 'text-blue-500', trend: 'up' },
            { label: 'Eficiencia Media', valor: '94.2%', sub: 'Meta: 90%', icon: <Target />, color: 'text-emerald-500', trend: 'up' },
            { label: 'Técnicos Activos', valor: '24', sub: '85% ocupación', icon: <Users />, color: 'text-[var(--heading)]', trend: 'neutral' },
            { label: 'Errores Operativos', valor: '0.4%', sub: '-2% vs semana pas.', icon: <AlertCircle />, color: 'text-rose-500', trend: 'down' },
          ].map((stat, i) => (
            <Card key={i} className="hover:shadow-2xl transition-all border-none shadow-lg shadow-[var(--border)]/50">
              <div className="flex justify-between items-start">
                <div className={`p-3 rounded-2xl bg-[var(--surface-hover)] ${stat.color}`}>
                  {React.cloneElement(stat.icon as React.ReactElement, { size: 20 } as any)}
                </div>
                {stat.trend === 'up' ? <ArrowUpRight className="text-emerald-500 w-4 h-4" /> : stat.trend === 'down' ? <ArrowDownRight className="text-rose-500 w-4 h-4" /> : null}
              </div>
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">{stat.label}</p>
                <h3 className="text-3xl font-black text-[var(--heading)]">{stat.valor}</h3>
                <p className="text-[10px] font-bold text-[var(--muted)] mt-1">{stat.sub}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Main Chart: Production by Technology */}
          <Card className="lg:col-span-8 p-8">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-lg font-black text-[var(--heading)]">Producción por Tecnología</h3>
                <p className="text-xs text-[var(--muted)] font-medium">Distribución de equipos procesados por marca</p>
              </div>
              <BarChart3 className="w-5 h-5 text-[var(--muted)]" />
            </div>

            <div className="space-y-8">
              {techData.map((t) => (
                <div key={t.tech} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-black uppercase tracking-widest text-[var(--heading)]">{t.tech}</span>
                    <span className="text-xs font-bold text-[var(--muted)]">{t.count} Unidades</span>
                  </div>
                  <div className="h-4 bg-[var(--surface-hover)] rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${t.color} transition-all duration-1000 ease-out`} 
                      style={{ width: `${(t.count / 1500) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-[var(--border)] grid grid-cols-3 gap-8">
              <div className="text-center">
                <span className="block text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">Capacidad Usada</span>
                <span className="text-xl font-black text-[var(--heading)]">78%</span>
              </div>
              <div className="text-center border-x border-[var(--border)]">
                <span className="block text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">DOP Rate</span>
                <span className="text-xl font-black text-rose-500">1.2%</span>
              </div>
              <div className="text-center">
                <span className="block text-[10px] font-black text-[var(--muted)] uppercase tracking-widest mb-1">TAT Promedio</span>
                <span className="text-xl font-black text-emerald-500">18.4h</span>
              </div>
            </div>
          </Card>

          {/* Performance Table: Technicians */}
          <Card className="overflow-hidden p-0 lg:col-span-4">
            <div className="border-b border-[var(--border)] bg-[var(--surface)] p-8">
              <div className="mb-1 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/15">
                  <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--heading)]">Rendimiento</h3>
              </div>
              <p className="text-xs text-[var(--muted)]">Productividad individual por rol</p>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {userPerformance.map((user, i) => (
                <div key={i} className="p-6 transition-colors hover:bg-[var(--surface-hover)]">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-hover)] text-[10px] font-black text-[var(--muted)] uppercase">
                        {user.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--heading)]">{user.name}</p>
                        <p className="text-[10px] font-medium text-[var(--muted)]">{user.role}</p>
                      </div>
                    </div>
                    {user.trend === 'up' ? <Badge variant="green">Top</Badge> : <Badge variant="yellow">Avg</Badge>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">
                      <span>Progreso Meta</span>
                      <span className="text-[var(--foreground)]">
                        {Math.round((user.prod / user.goal) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                      <div
                        className={`h-full transition-all ${user.prod >= user.goal ? 'bg-[var(--success)]' : 'bg-[var(--accent)]'}`}
                        style={{ width: `${Math.min((user.prod / user.goal) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[var(--surface-hover)] p-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] font-black tracking-widest text-[var(--heading)] uppercase"
              >
                Ver Reporte Completo
              </Button>
            </div>
          </Card>
        </div>

        {/* Bottom Alerts & Trends */}
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="bg-emerald-50 border-emerald-100">
            <div className="flex items-start gap-4">
              <div className="bg-emerald-500 text-white p-3 rounded-2xl">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-emerald-900 mb-1 uppercase tracking-widest">Meta de Producción Diaria</h4>
                <p className="text-xs text-emerald-700 font-medium mb-4">Estamos al 92% de la meta diaria de 2,800 unidades.</p>
                <div className="h-2 w-full bg-emerald-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: '92%' }} />
                </div>
              </div>
            </div>
          </Card>
          
          <Card className="bg-rose-50 border-rose-100">
            <div className="flex items-start gap-4">
              <div className="bg-rose-500 text-white p-3 rounded-2xl">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-rose-900 mb-1 uppercase tracking-widest">Alerta de Cuello de Botella</h4>
                <p className="text-xs text-rose-700 font-medium mb-4">La etapa de **Control de Calidad** presenta un retraso de 4.5h vs promedio.</p>
                <Button variant="outline" size="sm" className="bg-[var(--surface)] border-rose-200 text-rose-500 text-[10px]">Asignar Recursos</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}
