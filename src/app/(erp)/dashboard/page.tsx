"use client";

import React, { useEffect, useState } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { 
  getDailyKPIs, 
  setKPI, 
  UserKPI, 
  getDashboardMetrics, 
  DashboardMetrics, 
  getAreaKPIs, 
  AreaKPI,
  getBIData,
  getStorageData
} from '@/lib/database/kpi';
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

export default function GeneralDashboardPage() {
  const [kpis, setKpis] = useState<UserKPI[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalProduction: 0,
    activeTechnicians: 0,
    errorRate: 0,
    productionByBrand: []
  });
  const [areaKpis, setAreaKpis] = useState<AreaKPI[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState<string>('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [biData, setBiData] = useState<{ tech: string, condition: string, price: number, quantity: number }[]>([]);
  const [storageData, setStorageData] = useState({ ingresados: 0, despachados: 0, sinMovimiento60: 0, sinMovimiento90: 0 });
  
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'} | null>(null);

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

  useEffect(() => {
    async function fetchData() {
      const kpiData = await getDailyKPIs();
      setKpis(kpiData);
      const metricsData = await getDashboardMetrics();
      setMetrics(metricsData);
      const areaData = await getAreaKPIs();
      setAreaKpis(areaData);
      const biInfo = await getBIData();
      setBiData(biInfo);
      const storageInfo = await getStorageData();
      setStorageData(storageInfo);
    }
    fetchData();
  }, []);

  const handleSaveKPI = async (userId: string) => {
    const val = parseInt(editTargetValue);
    if (!isNaN(val) && val > 0) {
      await setKPI(userId, val);
      setKpis(await getDailyKPIs());
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
        <select className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 outline-none">
          <option>Hoy</option>
          <option>Esta Semana</option>
          <option>Este Mes</option>
        </select>
        <Button variant="outline" className="bg-white gap-2">
          <Download className="w-4 h-4" />
          PDF
        </Button>
      </div>

      <div className="flex border-b border-slate-200 mb-8 overflow-x-auto hide-scrollbar">
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
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
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
                <Card key={tech} className="p-3 text-center border-t-[3px] border-blue-500 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{tech}</p>
                  <p className="text-xl font-black text-[#181c3a] my-1">{data.qty}</p>
                  <p className="text-[10px] font-bold text-emerald-600">$ {data.revenue.toFixed(2)}</p>
                </Card>
              ))}
            </div>

            <Card className="p-8">
              <h2 className="text-xl font-bold text-[#181c3a] mb-6 border-b border-slate-100 pb-4">Desglose de Costos por Tecnología</h2>
              
              {/* Table Controls (Show / Search) */}
              <div className="flex flex-col sm:flex-row justify-between items-center mb-4 text-sm text-slate-500">
                <div className="flex items-center gap-2 mb-2 sm:mb-0">
                  <span>Show</span>
                  <select className="border border-slate-200 rounded px-2 py-1 outline-none text-slate-700 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all">
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                    <option>100</option>
                  </select>
                  <span>entries</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Search:</span>
                  <input type="text" className="border border-slate-200 rounded px-3 py-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                </div>
              </div>

              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-[#181c3a] uppercase text-xs font-bold">
                  <tr>
                    <th className="py-3 px-4 rounded-l-md cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => requestSort('tech')}>
                      <div className="flex items-center gap-2">Tecnología <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-200 transition-colors" onClick={() => requestSort('condition')}>
                      <div className="flex items-center gap-2">Condición <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-200 transition-colors text-center" onClick={() => requestSort('price')}>
                      <div className="flex items-center justify-center gap-2">Costo Unitario <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-200 transition-colors text-center" onClick={() => requestSort('quantity')}>
                      <div className="flex items-center justify-center gap-2">Cantidad <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                    <th className="py-3 px-4 rounded-r-md cursor-pointer hover:bg-slate-200 transition-colors text-right" onClick={() => requestSort('total')}>
                      <div className="flex items-center justify-end gap-2">Total (USD) <ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedBiData.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-4 px-4 font-bold text-slate-700">{row.tech}</td>
                      <td className="py-4 px-4 text-slate-600 font-semibold uppercase">{row.condition}</td>
                      <td className="py-4 px-4 text-center font-semibold text-slate-600">$ {row.price.toFixed(2)}</td>
                      <td className="py-4 px-4 text-center font-black text-[#181c3a]">{row.quantity}</td>
                      <td className="py-4 px-4 text-right font-bold text-emerald-600">$ {(row.quantity * row.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-[#181c3a] mt-4">
                  <tr>
                    <td colSpan={3} className="py-4 px-4 font-bold text-[#181c3a] uppercase text-right">Total General</td>
                    <td className="py-4 px-4 text-center font-black text-[#181c3a]">
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
            { label: 'PRODUCCIÓN TOTAL', valor: metrics.totalProduction.toLocaleString(), sub: '+12% vs ayer', icon: <Layers />, color: 'text-[#2ec4f1]', bg: 'bg-[#2ec4f1]/10', trend: 'up' },
            { label: 'EFICIENCIA MEDIA', valor: '94.2%', sub: 'Meta: 90%', icon: <Target />, color: 'text-emerald-500', bg: 'bg-emerald-50', trend: 'up' },
            { label: 'TÉCNICOS ACTIVOS', valor: metrics.activeTechnicians.toString(), sub: '85% ocupación', icon: <Users />, color: 'text-slate-500', bg: 'bg-slate-100', trend: 'none' },
            { label: 'ERRORES OPERATIVOS', valor: `${metrics.errorRate}%`, sub: '-2% vs semana pas.', icon: <AlertCircle />, color: 'text-rose-500', bg: 'bg-rose-50', trend: 'down' },
          ].map((stat, i) => (
            <Card key={i} className="hover:scale-[1.02] transition-all border-2 border-slate-100 shadow-sm p-6">
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                  {React.cloneElement(stat.icon as React.ReactElement, { size: 20 } as any)}
                </div>
                {stat.trend === 'up' && <ArrowUpRight className="text-emerald-500 w-4 h-4" />}
                {stat.trend === 'down' && <ArrowDownRight className="text-rose-500 w-4 h-4" />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">{stat.label}</p>
                <h3 className="text-3xl font-black text-[var(--foreground)] tracking-tighter">{stat.valor}</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1">{stat.sub}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Left Column Container */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            
            {/* Producción por Tecnología */}
            <Card className="p-8 border-2 border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-[#181c3a]">Producción por Tecnología</h3>
                  <p className="text-xs text-slate-400 font-medium">Distribución de equipos procesados por marca</p>
                </div>
                <BarChart3 className="w-5 h-5 text-slate-300" />
              </div>

              <div className="space-y-8">
                {metrics.productionByBrand.map((brand, idx) => {
                  const max = Math.max(...metrics.productionByBrand.map(b => b.count), 1);
                  const percent = (brand.count / max) * 100;
                  const colors = ['bg-[#2ec4f1]', 'bg-[#181c3a]', 'bg-slate-400', 'bg-emerald-400', 'bg-amber-400'];
                  
                  return (
                    <div key={brand.name}>
                      <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-3">
                        <span className="text-[#181c3a]">{brand.name}</span>
                        <span className="text-slate-500">{brand.count} Unidades</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div className={`${colors[idx % colors.length]} h-3 rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
                {metrics.productionByBrand.length === 0 && (
                  <div className="text-center text-slate-400 py-10 text-sm">
                    No hay datos de producción registrados hoy.
                  </div>
                )}
              </div>

              {/* Bottom Inner Metrics */}
              <div className="mt-12 pt-8 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">CAPACIDAD USADA</p>
                  <p className="text-2xl font-black text-[#181c3a]">78%</p>
                </div>
                <div className="border-l border-slate-100">
                  <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">DOP RATE</p>
                  <p className="text-2xl font-black text-rose-500">1.2%</p>
                </div>
                <div className="border-l border-slate-100">
                  <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-2">TAT PROMEDIO</p>
                  <p className="text-2xl font-black text-emerald-500">18.4h</p>
                </div>
              </div>
            </Card>

            {/* Producción por Personas */}
            <Card className="p-8 border-2 border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-[#181c3a]">Producción por Personas</h3>
                  <p className="text-xs text-slate-400 font-medium">Distribución de equipos procesados por operador</p>
                </div>
                <Users className="w-5 h-5 text-slate-300" />
              </div>

              <div className="space-y-8">
                {kpis.map((kpi, idx) => {
                  const max = Math.max(...kpis.map(k => k.progress), 1);
                  const percent = (kpi.progress / max) * 100;
                  const colors = ['bg-indigo-500', 'bg-[#2ec4f1]', 'bg-[#181c3a]', 'bg-emerald-400', 'bg-amber-400'];
                  
                  return (
                    <div key={kpi.name}>
                      <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-3">
                        <span className="text-[#181c3a]">{kpi.name} <span className="text-slate-400 ml-1">({kpi.role.replace('_', ' ')})</span></span>
                        <span className="text-slate-500">{kpi.progress} Unidades</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div className={`${colors[idx % colors.length]} h-3 rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
                {kpis.length === 0 && (
                  <div className="text-center text-slate-400 py-10 text-sm">
                    No hay datos de producción registrados hoy.
                  </div>
                )}
              </div>
            </Card>

          </div>


        <Card className="lg:col-span-4 p-8 border-2 border-slate-100 flex flex-col h-full">
          <div className="bg-[#181c3a] -mx-8 -mt-8 p-6 rounded-t-xl mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="text-[#2ec4f1] w-6 h-6" />
              Rendimiento
            </h3>
            <p className="text-white/60 text-xs mt-1">Productividad individual por rol (Meta Diaria)</p>
          </div>

          <div className="space-y-6">
            {kpis.map((kpi) => {
              const statusLabel = kpi.percentage >= 90 ? 'TOP' : kpi.percentage >= 50 ? 'AVG' : 'LOW';
              const statusColor = kpi.percentage >= 90 ? 'text-emerald-500 bg-emerald-50 border-emerald-200' 
                : kpi.percentage >= 50 ? 'text-amber-500 bg-amber-50 border-amber-200' 
                : 'text-rose-500 bg-rose-50 border-rose-200';
              const barColor = kpi.percentage >= 90 ? 'bg-emerald-500' : kpi.percentage >= 50 ? 'bg-[#2ec4f1]' : 'bg-rose-500';

              return (
                <div key={kpi.user_id} className="border-b border-slate-50 pb-6 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 font-bold flex items-center justify-center uppercase text-xs">
                        {kpi.name.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#181c3a]">{kpi.name}</p>
                        <p className="text-[10px] uppercase font-bold text-slate-400">{kpi.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {editingUserId === kpi.user_id ? (
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            className="w-20 text-xs p-1 border rounded"
                            value={editTargetValue}
                            onChange={(e) => setEditTargetValue(e.target.value)}
                            autoFocus
                          />
                          <Button variant="primary" size="sm" onClick={() => handleSaveKPI(kpi.user_id)}>OK</Button>
                        </div>
                      ) : (
                        <div 
                          className="text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-600"
                          onClick={() => {
                            setEditingUserId(kpi.user_id);
                            setEditTargetValue(kpi.target.toString());
                          }}
                        >
                          Meta: {kpi.target}
                        </div>
                      )}
                      <Badge className={`px-3 py-1 font-black ${statusColor} border`}>{statusLabel}</Badge>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-[10px] font-black tracking-widest text-slate-400 mb-2 uppercase">
                      <span>Progreso Meta ({kpi.progress}/{kpi.target})</span>
                      <span className={kpi.percentage >= 90 ? 'text-emerald-500' : 'text-slate-500'}>{kpi.percentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${barColor} rounded-full transition-all duration-1000`}
                        style={{ width: `${Math.min(kpi.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            
            {kpis.length === 0 && (
              <p className="text-sm text-center text-slate-400 py-4">No hay datos de rendimiento registrados hoy.</p>
            )}

            <Button variant="outline" className="w-full mt-4 border-none bg-slate-50 hover:bg-slate-100 text-[10px] font-black uppercase tracking-widest py-6">
              Ver Reporte Completo
            </Button>
          </div>
        </Card>
        </div>
        </>
        )}

        {activeTab === 'kpi' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-rise-in">
            {areaKpis.map(area => (
              <Card key={area.id} className="p-8 border-2 border-slate-100 hover:border-blue-200 transition-colors shadow-sm bg-white">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide">{area.name}</h3>
                  <Badge className={`px-3 py-1 font-bold ${
                    area.status === 'warning' ? 'bg-rose-50 text-rose-600 border-rose-200' : 
                    area.status === 'critical' ? 'bg-red-50 text-red-600 border-red-200' :
                    'bg-emerald-50 text-emerald-600 border-emerald-200'
                  } border`}>
                    {area.status === 'warning' ? 'ATENCIÓN' : area.status === 'critical' ? 'CRÍTICO' : 'ÓPTIMO'}
                  </Badge>
                </div>

                <div className="mb-8">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{area.mainMetric}</p>
                  <p className="text-4xl font-black text-[#181c3a]">{area.mainValue.toLocaleString()}</p>
                </div>
                {area.users && area.users.length > 0 && (
                  <div className="mt-6 mb-8">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-100 text-[#181c3a] font-bold text-xs">
                        <tr>
                          <th className="py-2 px-3 rounded-l-md capitalize">Operador</th>
                          <th className="py-2 px-3 text-center capitalize">Real</th>
                          <th className="py-2 px-3 text-center rounded-r-md capitalize">métrica</th>
                        </tr>
                      </thead>
                      <tbody>
                        {area.users.map((user, idx) => (
                          <tr key={idx} className="border-b border-slate-50 last:border-none">
                            <td className="py-2 px-3 font-semibold text-slate-600 truncate max-w-[140px] uppercase">{user.name}</td>
                            <td className="py-2 px-3 text-center font-bold text-[#181c3a]">{user.count}</td>
                            <td className="py-2 px-3 text-center font-bold text-[#181c3a]">{user.target || 100}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-auto border-t-[3px] border-[#181c3a] pt-2">
                  <table className="w-full text-sm text-center">
                    <thead className="text-[#181c3a] font-bold text-xs">
                      <tr>
                        <th className="py-2 text-left capitalize">Dispositivo</th>
                        <th className="py-2 capitalize">{area.subMetric1.toLowerCase()}</th>
                        <th className="py-2 capitalize">{area.subMetric2.toLowerCase()}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-2 text-left font-bold text-slate-500 uppercase">General</td>
                        <td className="py-2 font-black text-slate-700">{area.subValue1}</td>
                        <td className="py-2 font-black text-slate-700">{area.subValue2}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'almacenamientos' && (
          <div className="max-w-6xl mx-auto mt-8">
            <h2 className="text-2xl font-bold text-[#181c3a] mb-6">Estado de Almacén y Antigüedad</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="p-6 text-center border-t-4 border-blue-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                  <Warehouse className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Equipos Ingresados</p>
                <p className="text-4xl font-black text-[#181c3a] my-2">{storageData.ingresados.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Histórico total en almacén</p>
              </Card>

              <Card className="p-6 text-center border-t-4 border-emerald-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                  <Truck className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Equipos Despachados</p>
                <p className="text-4xl font-black text-[#181c3a] my-2">{storageData.despachados.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Histórico de salidas</p>
              </Card>

              <Card className="p-6 text-center border-t-4 border-amber-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sin Movimiento &gt; 60 Días</p>
                <p className="text-4xl font-black text-[#181c3a] my-2">{storageData.sinMovimiento60.toLocaleString()}</p>
                <p className="text-xs text-amber-600 font-semibold">Alerta de antigüedad</p>
              </Card>

              <Card className="p-6 text-center border-t-4 border-red-500 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sin Movimiento &gt; 90 Días</p>
                <p className="text-4xl font-black text-[#181c3a] my-2">{storageData.sinMovimiento90.toLocaleString()}</p>
                <p className="text-xs text-red-600 font-bold">Crítico - obsolescencia</p>
              </Card>
            </div>
          </div>
        )}

        {activeTab !== 'dashboard' && activeTab !== 'kpi' && activeTab !== 'bi' && activeTab !== 'almacenamientos' && (
          <div className="p-12 text-center bg-white border-2 border-slate-100 rounded-3xl">
            <h3 className="text-xl font-bold text-slate-400">Pestaña en construcción</h3>
            <p className="text-slate-500 mt-2">Los datos para <strong>{activeTab.toUpperCase()}</strong> estarán disponibles pronto.</p>
          </div>
        )}
      </div>
    </ModulePage>
  );
}
