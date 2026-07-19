"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button } from '@/components/ui';
import { 
  getDailyKPIs, 
  setKPI, 
  UserKPI, 
  getDashboardMetrics, 
  DashboardMetrics, 
  getBIData,
  getStorageData
} from '@/modules/kpi-analytics/client/kpi';
import { getEngineKPIs } from '@/modules/kpi-analytics/client/kpiEngine';
import { fetchDashboardMetricsFromApi, fetchPipelineFromApi, fetchWorkshopOsCountsFromApi, type WorkshopOsByStage } from '@/lib/api/kpiProjections';
import { RecepcionKpiView } from '@/components/dashboard/kpi/recepcion-kpi-view';
import { BackofficeKpiView } from '@/components/dashboard/kpi/backoffice-kpi-view';
import { BodegaKpiView } from '@/components/dashboard/kpi/bodega-kpi-view';
import { TallerKpiView } from '@/components/dashboard/kpi/taller-kpi-view';
import { SalidaKpiView } from '@/components/dashboard/kpi/salida-kpi-view';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  AlertCircle, 
  Target, 
  Layers, 
  Cpu, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Truck,
  Wrench,
  Warehouse,
  Download,
  ArrowUpDown
} from 'lucide-react';

const EMPTY_KPIS: UserKPI[] = [];
const EMPTY_BI: { tech: string, condition: string, price: number, quantity: number }[] = [];
const DEFAULT_METRICS: DashboardMetrics = {
  totalProduction: 0,
  activeTechnicians: 0,
  errorRate: 0,
  productionByBrand: []
};
const DEFAULT_STORAGE = { ingresados: 0, despachados: 0, sinMovimiento60: 0, sinMovimiento90: 0 };

export default function GeneralDashboardPage() {
  const queryClient = useQueryClient();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState<string>('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timeRange, setTimeRange] = useState('Hoy');
  
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'} | null>(null);

  const kpisQuery = useQuery({ queryKey: ['dashboard-kpis', timeRange], queryFn: () => getDailyKPIs(timeRange) });
  const metricsQuery = useQuery({
    queryKey: ['dashboard-metrics', timeRange],
    queryFn: async () => {
      try {
        const { metrics } = await fetchDashboardMetricsFromApi(timeRange);
        if (metrics.productionByBrand.length > 0 || metrics.totalProduction > 0) {
          return metrics;
        }
      } catch {
        // fallback legacy
      }
      return getDashboardMetrics(timeRange);
    },
  });
  const pipelineQuery = useQuery({
    queryKey: ['dashboard-pipeline'],
    queryFn: () => fetchPipelineFromApi(),
    staleTime: 60_000,
  });
  const workshopOsQuery = useQuery({
    queryKey: ['dashboard-workshop-os'],
    queryFn: () => fetchWorkshopOsCountsFromApi(),
    staleTime: 60_000,
  });
  const engineQuery = useQuery({ queryKey: ['dashboard-engine', timeRange], queryFn: () => getEngineKPIs(timeRange) });
  const biQuery = useQuery({ queryKey: ['dashboard-bi'], queryFn: () => getBIData() });
  const storageQuery = useQuery({ queryKey: ['dashboard-storage'], queryFn: () => getStorageData() });

  const kpis = kpisQuery.data ?? EMPTY_KPIS;
  const metrics = metricsQuery.data ?? DEFAULT_METRICS;
  const bespokeData = engineQuery.data ?? null;
  const pipelineProjection = pipelineQuery.data?.pipeline ?? null;
  const workshopOs: WorkshopOsByStage | null = React.useMemo(() => {
    const msi = pipelineProjection?.workshopOs;
    const live = workshopOsQuery.data;
    const msiTotal = msi ? Object.values(msi).reduce((a, b) => a + b, 0) : 0;
    if (msiTotal > 0 && msi) return msi;
    return live ?? msi ?? null;
  }, [pipelineProjection, workshopOsQuery.data]);
  const biData = biQuery.data ?? EMPTY_BI;
  const storageData = storageQuery.data ?? DEFAULT_STORAGE;

  const sortedBiData = React.useMemo(() => {
    let sortableItems = [...biData];
    if (sortConfig !== null) {
      sortableItems.sort((a: any, b: any) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (sortConfig.key === 'total') {
          valA = a.quantity * a.price;
          valB = b.quantity * b.price;
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [biData, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  const handleSaveKPI = async (userId: string) => {
    const val = parseInt(editTargetValue);
    if (!isNaN(val) && val > 0) {
      await setKPI(userId, val);
      await queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] });
    }
    setEditingUserId(null);
  };

  return (
    <ModulePage
      title="Dashboard Gerencial & BI"
      subtitle="Análisis de producción en tiempo real, cumplimiento de metas y proyecciones de capacidad operativa."
      category="Gestión"
    >
      <div className="flex justify-end gap-2 -mt-16 mb-8 relative z-10 mr-4">
        <select 
          className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm font-bold text-[var(--foreground)] outline-none"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
        >
          <option>Hoy</option>
          <option>Ayer</option>
          <option>Esta Semana</option>
          <option>Este Mes</option>
        </select>
        <Button variant="outline" className="bg-[var(--surface)] gap-2">
          <Download className="w-4 h-4" />
          PDF
        </Button>
      </div>

      <div className="flex border-b border-[var(--border)] mb-8 overflow-x-auto hide-scrollbar">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'kpi', label: 'KPI' },
          { id: 'bi', label: 'BI' },
          { id: 'almacenamientos', label: 'Almacenamientos' },
          { id: 'detalle-despacho', label: 'Detalle Despacho' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-4 text-sm font-black tracking-wide uppercase whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--border)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-8 animate-rise-in">
        {activeTab === 'bi' && (
          <div className="max-w-6xl mx-auto mt-8">
            
            {/* Tech Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              {Object.entries(
                biData.reduce((acc, row) => {
                  if (!acc[row.tech]) acc[row.tech] = { qty: 0, revenue: 0 };
                  acc[row.tech].qty += row.quantity;
                  acc[row.tech].revenue += (row.quantity * row.price);
                  return acc;
                }, {} as Record<string, { qty: number, revenue: number }>)
              ).map(([tech, data]) => (
                <Card key={tech} className="p-3 text-center border-t-[3px] border-[var(--accent)] rounded-xl shadow-sm hover:shadow-md transition-shadow">
                  <p className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-widest truncate">{tech}</p>
                  <p className="text-xl font-black text-[var(--heading)] my-1">{data.qty}</p>
                  <p className="text-[10px] font-bold text-emerald-600">$ {data.revenue.toFixed(2)}</p>
                </Card>
              ))}
            </div>

            <Card className="p-8">
              <h2 className="text-xl font-bold text-[var(--heading)] mb-6 border-b border-[var(--border)] pb-4">Desglose de Costos por Tecnología</h2>
              
              {/* Table Controls (Show / Search) */}
              <div className="flex flex-col sm:flex-row justify-between items-center mb-4 text-sm text-[var(--muted)]">
                <div className="flex items-center gap-2 mb-2 sm:mb-0">
                  <span>Show</span>
                  <select className="border border-[var(--border)] rounded px-2 py-1 outline-none text-[var(--foreground)] bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all">
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                    <option>100</option>
                  </select>
                  <span>entries</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Search:</span>
                  <input type="text" className="border border-[var(--border)] rounded px-3 py-1 outline-none bg-[var(--surface)] text-[var(--foreground)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all" />
                </div>
              </div>

              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--surface-hover)] text-[var(--heading)] uppercase text-xs font-bold">
                  <tr>
                    <th className="py-3 px-4 rounded-l-md cursor-pointer hover:bg-[var(--border)] transition-colors" onClick={() => requestSort('tech')}>
                      <div className="flex items-center gap-2">Tecnología <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" /></div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-[var(--border)] transition-colors" onClick={() => requestSort('condition')}>
                      <div className="flex items-center gap-2">Condición <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" /></div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-[var(--border)] transition-colors text-center" onClick={() => requestSort('price')}>
                      <div className="flex items-center justify-center gap-2">Costo Unitario <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" /></div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-[var(--border)] transition-colors text-center" onClick={() => requestSort('quantity')}>
                      <div className="flex items-center justify-center gap-2">Cantidad <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" /></div>
                    </th>
                    <th className="py-3 px-4 rounded-r-md cursor-pointer hover:bg-[var(--border)] transition-colors text-right" onClick={() => requestSort('total')}>
                      <div className="flex items-center justify-end gap-2">Total (USD) <ArrowUpDown className="w-3 h-3 text-[var(--muted)]" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {sortedBiData.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-4 px-4 font-bold text-[var(--foreground)]">{row.tech}</td>
                      <td className="py-4 px-4 text-[var(--muted)] font-semibold uppercase">{row.condition}</td>
                      <td className="py-4 px-4 text-center font-semibold text-[var(--muted)]">$ {row.price.toFixed(2)}</td>
                      <td className="py-4 px-4 text-center font-black text-[var(--heading)]">{row.quantity}</td>
                      <td className="py-4 px-4 text-right font-bold text-emerald-600">$ {(row.quantity * row.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-[var(--primary)] mt-4">
                  <tr>
                    <td colSpan={3} className="py-4 px-4 font-bold text-[var(--heading)] uppercase text-right">Total General</td>
                    <td className="py-4 px-4 text-center font-black text-[var(--heading)]">
                      {biData.reduce((acc, row) => acc + row.quantity, 0)}
                    </td>
                    <td className="py-4 px-4 text-right font-black text-emerald-600 text-lg">
                      $ {biData.reduce((acc, row) => acc + (row.quantity * row.price), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <>
        {/* Key KPI Overlays */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'PRODUCCIÓN TOTAL', valor: metrics.totalProduction.toLocaleString(), sub: '+12% vs ayer', icon: <Layers />, color: 'text-[var(--accent)]', bg: 'bg-[var(--accent)]/10', trend: 'up' },
            { label: 'EFICIENCIA MEDIA', valor: '94.2%', sub: 'Meta: 90%', icon: <Target />, color: 'text-emerald-500', bg: 'bg-emerald-50', trend: 'up' },
            { label: 'TÉCNICOS ACTIVOS', valor: metrics.activeTechnicians.toString(), sub: '85% ocupación', icon: <Users />, color: 'text-[var(--muted)]', bg: 'bg-[var(--surface-hover)]', trend: 'none' },
            { label: 'ERRORES OPERATIVOS', valor: `${metrics.errorRate}%`, sub: '-2% vs semana pas.', icon: <AlertCircle />, color: 'text-rose-500', bg: 'bg-rose-50', trend: 'down' },
          ].map((stat, i) => (
            <Card key={i} className="hover:scale-[1.02] transition-all border-2 border-[var(--border)] shadow-sm p-6">
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                  {React.cloneElement(stat.icon as React.ReactElement, { size: 20 } as any)}
                </div>
                {stat.trend === 'up' && <ArrowUpRight className="text-emerald-500 w-4 h-4" />}
                {stat.trend === 'down' && <ArrowDownRight className="text-rose-500 w-4 h-4" />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">{stat.label}</p>
                <h3 className="text-3xl font-black text-[var(--heading)] tracking-tighter">{stat.valor}</h3>
                <p className="text-[10px] font-bold text-[var(--muted)] mt-1">{stat.sub}</p>
              </div>
            </Card>
          ))}
        </div>

        {workshopOs && (
          <Card className="p-6 border-2 border-[var(--border)] shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
              <div>
                <h3 className="text-lg font-black text-[var(--heading)]">OS en Taller por Etapa</h3>
                <p className="text-xs text-[var(--muted)] font-medium">
                  Equipos trasladados desde Bodega Central — conteo por orden de servicio (OS)
                </p>
              </div>
              {pipelineProjection?.workshopOs && (
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit">MSI</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { key: 'diagnostico' as const, label: 'Diagnóstico', color: 'text-amber-600', bg: 'bg-amber-50' },
                { key: 'reparacion' as const, label: 'Reparación', color: 'text-blue-600', bg: 'bg-blue-50' },
                { key: 'reacondicionado' as const, label: 'Reacondicionado', color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { key: 'qc' as const, label: 'Ctrl. Calidad', color: 'text-purple-600', bg: 'bg-purple-50' },
                { key: 'l3' as const, label: 'L3', color: 'text-orange-600', bg: 'bg-orange-50' },
                { key: 'scraps' as const, label: 'Scrap', color: 'text-rose-600', bg: 'bg-rose-50' },
              ].map((stage) => (
                <div
                  key={stage.key}
                  className={`rounded-xl border border-[var(--border)] p-4 text-center ${stage.bg}`}
                >
                  <p className="text-[9px] font-black uppercase tracking-wide text-[var(--muted)] mb-1">{stage.label}</p>
                  <p className={`text-2xl font-black ${stage.color}`}>{workshopOs[stage.key].toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-[var(--muted)] mt-1">OS</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Column Container */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            
            {/* Producción por Tecnología */}
            <Card className="p-8 border-2 border-[var(--border)] shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-[var(--heading)]">Producción por Tecnología</h3>
                  <p className="text-xs text-[var(--muted)] font-medium">Distribución de equipos procesados por tecnología</p>
                </div>
                <BarChart3 className="w-5 h-5 text-[var(--muted)]" />
              </div>

              <div className="space-y-8">
                {metrics.productionByBrand.map((brand, idx) => {
                  const max = Math.max(...metrics.productionByBrand.map(b => b.count), 1);
                  const percent = (brand.count / max) * 100;
                  const colors = ['bg-[var(--accent)]', 'bg-[var(--success)]', 'bg-[var(--muted)]', 'bg-[var(--warning)]', 'bg-[var(--danger)]'];
                  
                  return (
                    <div key={brand.name}>
                      <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-3">
                        <span className="text-[var(--heading)]">{brand.name}</span>
                        <span className="text-[var(--muted)]">{brand.count} Unidades</span>
                      </div>
                      <div className="w-full bg-[var(--surface-hover)] rounded-full h-3">
                        <div className={`${colors[idx % colors.length]} h-3 rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
                {metrics.productionByBrand.length === 0 && (
                  <div className="text-center text-[var(--muted)] py-10 text-sm">
                    No hay datos de producción registrados hoy.
                  </div>
                )}
              </div>

              {/* Bottom Inner Metrics */}
              <div className="mt-12 pt-8 border-t border-[var(--border)] grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[10px] font-black tracking-widest text-[var(--muted)] uppercase mb-2">CAPACIDAD USADA</p>
                  <p className="text-2xl font-black text-[var(--heading)]">78%</p>
                </div>
                <div className="border-l border-[var(--border)]">
                  <p className="text-[10px] font-black tracking-widest text-[var(--muted)] uppercase mb-2">DOP RATE</p>
                  <p className="text-2xl font-black text-rose-500">1.2%</p>
                </div>
                <div className="border-l border-[var(--border)]">
                  <p className="text-[10px] font-black tracking-widest text-[var(--muted)] uppercase mb-2">TAT PROMEDIO</p>
                  <p className="text-2xl font-black text-emerald-500">18.4h</p>
                </div>
              </div>
            </Card>

            {/* Producción por Personas */}
            <Card className="p-8 border-2 border-[var(--border)] shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-[var(--heading)]">Producción por Personas</h3>
                  <p className="text-xs text-[var(--muted)] font-medium">Distribución de equipos procesados por operador</p>
                </div>
                <Users className="w-5 h-5 text-[var(--muted)]" />
              </div>

              <div className="space-y-8">
                {kpis.map((kpi, idx) => {
                  const max = Math.max(...kpis.map(k => k.progress), 1);
                  const percent = (kpi.progress / max) * 100;
                  const colors = ['bg-[var(--accent)]', 'bg-[var(--success)]', 'bg-[var(--warning)]', 'bg-[var(--muted)]', 'bg-[var(--danger)]'];
                  
                  return (
                    <div key={kpi.name}>
                      <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-3">
                        <span className="text-[var(--heading)]">{kpi.name} <span className="text-[var(--muted)] ml-1">({kpi.role.replace('_', ' ')})</span></span>
                        <span className="text-[var(--muted)]">{kpi.progress} {kpi.progressLabel}</span>
                      </div>
                      <div className="w-full bg-[var(--surface-hover)] rounded-full h-3">
                        <div className={`${colors[idx % colors.length]} h-3 rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
                {kpis.length === 0 && (
                  <div className="text-center text-[var(--muted)] py-10 text-sm">
                    No hay datos de producción registrados hoy.
                  </div>
                )}
              </div>
            </Card>

          </div>


        <Card className="flex max-h-[min(720px,calc(100vh-10rem))] min-h-0 flex-col overflow-hidden border-2 border-[var(--border)] lg:col-span-4">
          <div className="shrink-0 rounded-t-xl border-b border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="flex items-center gap-2 text-xl font-bold text-[var(--heading)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/15">
                <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
              </div>
              Rendimiento
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Productividad individual por rol (Meta Diaria)
            </p>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
            {kpis.map((kpi) => {
              const statusLabel = kpi.percentage >= 90 ? 'TOP' : kpi.percentage >= 50 ? 'AVG' : 'LOW';
              const statusColor =
                kpi.percentage >= 90
                  ? 'border-[var(--success)]/30 bg-[var(--success)]/15 text-[var(--success)]'
                  : kpi.percentage >= 50
                    ? 'border-[var(--warning)]/30 bg-[var(--warning)]/15 text-[var(--warning)]'
                    : 'border-[var(--danger)]/30 bg-[var(--danger)]/15 text-[var(--danger)]';
              const barColor =
                kpi.percentage >= 90
                  ? 'bg-[var(--success)]'
                  : kpi.percentage >= 50
                    ? 'bg-[var(--accent)]'
                    : 'bg-[var(--danger)]';

              return (
                <div
                  key={kpi.user_id}
                  className="border-b border-[var(--border)] pb-6 last:border-0 last:pb-0"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-hover)] text-xs font-bold text-[var(--muted)] uppercase">
                        {kpi.name.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--heading)]">{kpi.name}</p>
                        <p className="text-[10px] font-bold text-[var(--muted)] uppercase">
                          {kpi.role.replace('_', ' ')}
                        </p>
                        <p className="mt-1 text-[10px] font-black text-[var(--accent)] tabular-nums">
                          {kpi.progress} {kpi.progressLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {editingUserId === kpi.user_id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="w-20 rounded border border-[var(--border)] bg-[var(--surface-hover)] p-1 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                            value={editTargetValue}
                            onChange={(e) => setEditTargetValue(e.target.value)}
                            autoFocus
                          />
                          <Button variant="primary" size="sm" onClick={() => handleSaveKPI(kpi.user_id)}>
                            OK
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="cursor-pointer text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                          onClick={() => {
                            setEditingUserId(kpi.user_id);
                            setEditTargetValue(kpi.target.toString());
                          }}
                        >
                          Meta: {kpi.target}
                        </div>
                      )}
                      <Badge className={`border px-3 py-1 font-black ${statusColor}`}>
                        {statusLabel}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex justify-between text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">
                      <span>
                        Progreso Meta ({kpi.progress}/{kpi.target})
                      </span>
                      <span
                        className={
                          kpi.percentage >= 90 ? 'text-[var(--success)]' : 'text-[var(--foreground)]'
                        }
                      >
                        {kpi.percentage}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
                        style={{ width: `${Math.min(kpi.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {kpis.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--muted)]">
                No hay datos de rendimiento registrados hoy.
              </p>
            )}
            </div>
          </div>

          <div className="shrink-0 border-t border-[var(--border)] px-6 pt-2 pb-6">
            <Button
              variant="outline"
              className="w-full border-none bg-[var(--surface-hover)] py-6 text-[10px] font-black tracking-widest uppercase hover:bg-[var(--border)]"
            >
              Ver Reporte Completo
            </Button>
          </div>
        </Card>
        </div>
        </>
        )}

        {activeTab === 'kpi' && bespokeData && (
          <div className="flex flex-col gap-8 animate-rise-in max-w-7xl mx-auto">
            {/* Estado Operativo Banner */}
            {(pipelineProjection || bespokeData?.estadoOperativo) && (
              <div className="mx-4 mb-4 mt-2 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] shadow-sm rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--muted)] uppercase">Estado Operativo</span>
                  {pipelineProjection && (
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">MSI</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm font-bold text-[var(--heading)]">
                  <div className="flex flex-col items-center"><span className="text-xl text-blue-600">{(pipelineProjection ?? bespokeData.estadoOperativo).recepcion}</span><span className="text-[10px] text-[var(--muted)]">Recepción</span></div>
                  <span className="text-[var(--border)]">→</span>
                  <div className="flex flex-col items-center"><span className="text-xl text-indigo-600">{(pipelineProjection ?? bespokeData.estadoOperativo).backoffice}</span><span className="text-[10px] text-[var(--muted)]">Backoffice</span></div>
                  <span className="text-[var(--border)]">→</span>
                  <div className="flex flex-col items-center"><span className="text-xl text-purple-600">{(pipelineProjection ?? bespokeData.estadoOperativo).taller}</span><span className="text-[10px] text-[var(--muted)]">Taller</span></div>
                  <span className="text-[var(--border)]">→</span>
                  <div className="flex flex-col items-center"><span className="text-xl text-emerald-600">{(pipelineProjection ?? bespokeData.estadoOperativo).bodega}</span><span className="text-[10px] text-[var(--muted)]">Bodega</span></div>
                  <span className="text-[var(--border)]">→</span>
                  <div className="flex flex-col items-center"><span className="text-xl text-orange-600">{(pipelineProjection ?? bespokeData.estadoOperativo).despacho}</span><span className="text-[10px] text-[var(--muted)]">Despacho</span></div>
                </div>
              </div>
            )}

            <RecepcionKpiView data={bespokeData?.recepcion} timeRange={timeRange} />
            <BackofficeKpiView data={bespokeData?.backoffice} timeRange={timeRange} />
            <BodegaKpiView data={bespokeData?.bodega} timeRange={timeRange} />
            <TallerKpiView data={bespokeData.taller} timeRange={timeRange} />
            <SalidaKpiView data={bespokeData.salida} timeRange={timeRange} />
          </div>
        )}

        {activeTab === 'almacenamientos' && (
          <div className="max-w-6xl mx-auto mt-8">
            <h2 className="text-2xl font-bold text-[var(--heading)] mb-6">Estado de Almacén y Antigüedad</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="p-6 text-center border-t-4 border-blue-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                  <Warehouse className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Equipos Ingresados</p>
                <p className="text-4xl font-black text-[var(--heading)] my-2">{storageData.ingresados.toLocaleString()}</p>
                <p className="text-xs text-[var(--muted)]">Histórico total en almacén</p>
              </Card>

              <Card className="p-6 text-center border-t-4 border-emerald-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                  <Truck className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Equipos Despachados</p>
                <p className="text-4xl font-black text-[var(--heading)] my-2">{storageData.despachados.toLocaleString()}</p>
                <p className="text-xs text-[var(--muted)]">Histórico de salidas</p>
              </Card>

              <Card className="p-6 text-center border-t-4 border-amber-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Sin Movimiento &gt; 60 Días</p>
                <p className="text-4xl font-black text-[var(--heading)] my-2">{storageData.sinMovimiento60.toLocaleString()}</p>
                <p className="text-xs text-amber-600 font-semibold">Alerta de antigüedad</p>
              </Card>

              <Card className="p-6 text-center border-t-4 border-red-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Sin Movimiento &gt; 90 Días</p>
                <p className="text-4xl font-black text-[var(--heading)] my-2">{storageData.sinMovimiento90.toLocaleString()}</p>
                <p className="text-xs text-red-600 font-bold">Crítico - obsolescencia</p>
              </Card>
            </div>
          </div>
        )}

        {activeTab !== 'dashboard' && activeTab !== 'kpi' && activeTab !== 'bi' && activeTab !== 'almacenamientos' && (
          <div className="p-12 text-center bg-[var(--surface)] border-2 border-[var(--border)] rounded-3xl">
            <h3 className="text-xl font-bold text-[var(--muted)]">Pestaña en construcción</h3>
            <p className="text-[var(--muted)] mt-2">Los datos para <strong>{activeTab.toUpperCase()}</strong> estarán disponibles pronto.</p>
          </div>
        )}
      </div>
    </ModulePage>
  );
}
