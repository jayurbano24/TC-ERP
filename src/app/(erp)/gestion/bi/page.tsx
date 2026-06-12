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
  { tech: 'Huawei', count: 1240, color: 'bg-[#2ec4f1]' },
  { tech: 'Nokia', count: 850, color: 'bg-[#181c3a]' },
  { tech: 'ZTE', count: 420, color: 'bg-slate-400' },
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
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none"
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
            { label: 'Técnicos Activos', valor: '24', sub: '85% ocupación', icon: <Users />, color: 'text-[#181c3a]', trend: 'neutral' },
            { label: 'Errores Operativos', valor: '0.4%', sub: '-2% vs semana pas.', icon: <AlertCircle />, color: 'text-rose-500', trend: 'down' },
          ].map((stat, i) => (
            <Card key={i} className="hover:shadow-2xl transition-all border-none shadow-lg shadow-slate-200/50">
              <div className="flex justify-between items-start">
                <div className={`p-3 rounded-2xl bg-slate-50 ${stat.color}`}>
                  {React.cloneElement(stat.icon as React.ReactElement, { size: 20 } as any)}
                </div>
                {stat.trend === 'up' ? <ArrowUpRight className="text-emerald-500 w-4 h-4" /> : stat.trend === 'down' ? <ArrowDownRight className="text-rose-500 w-4 h-4" /> : null}
              </div>
              <div className="mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                <h3 className="text-3xl font-black text-[#181c3a]">{stat.valor}</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1">{stat.sub}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* Main Chart: Production by Technology */}
          <Card className="lg:col-span-8 p-8">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-lg font-black text-[#181c3a]">Producción por Tecnología</h3>
                <p className="text-xs text-slate-400 font-medium">Distribución de equipos procesados por marca</p>
              </div>
              <BarChart3 className="w-5 h-5 text-slate-300" />
            </div>

            <div className="space-y-8">
              {techData.map((t) => (
                <div key={t.tech} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-black uppercase tracking-widest text-[#181c3a]">{t.tech}</span>
                    <span className="text-xs font-bold text-slate-500">{t.count} Unidades</span>
                  </div>
                  <div className="h-4 bg-slate-50 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${t.color} transition-all duration-1000 ease-out`} 
                      style={{ width: `${(t.count / 1500) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-slate-100 grid grid-cols-3 gap-8">
              <div className="text-center">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Capacidad Usada</span>
                <span className="text-xl font-black text-[#181c3a]">78%</span>
              </div>
              <div className="text-center border-x border-slate-100">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">DOP Rate</span>
                <span className="text-xl font-black text-rose-500">1.2%</span>
              </div>
              <div className="text-center">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">TAT Promedio</span>
                <span className="text-xl font-black text-emerald-500">18.4h</span>
              </div>
            </div>
          </Card>

          {/* Performance Table: Technicians */}
          <Card className="lg:col-span-4 p-0 overflow-hidden">
            <div className="p-8 border-b border-slate-100 bg-[#181c3a] text-white">
              <div className="flex items-center gap-3 mb-1">
                <TrendingUp className="w-5 h-5 text-[#2ec4f1]" />
                <h3 className="text-lg font-bold">Rendimiento</h3>
              </div>
              <p className="text-xs text-white/40">Productividad individual por rol</p>
            </div>
            
            <div className="divide-y divide-slate-50">
              {userPerformance.map((user, i) => (
                <div key={i} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#181c3a]">{user.name}</p>
                        <p className="text-[10px] font-medium text-slate-400">{user.role}</p>
                      </div>
                    </div>
                    {user.trend === 'up' ? <Badge variant="green">Top</Badge> : <Badge variant="yellow">Avg</Badge>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span>Progreso Meta</span>
                      <span>{Math.round((user.prod / user.goal) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${user.prod >= user.goal ? 'bg-emerald-500' : 'bg-[#2ec4f1]'} transition-all`} 
                        style={{ width: `${Math.min((user.prod / user.goal) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 bg-slate-50 text-center">
              <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest text-[#181c3a]">Ver Reporte Completo</Button>
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
                <Button variant="outline" size="sm" className="bg-white border-rose-200 text-rose-500 text-[10px]">Asignar Recursos</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}
