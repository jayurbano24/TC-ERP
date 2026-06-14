"use client";

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Users, Clock, Coffee, LogOut, Activity } from 'lucide-react';

export default function DashboardAsistencia() {
  const [stats, setStats] = useState({
    presentes: 0,
    desayunando: 0,
    almorzando: 0,
    salidas: 0,
    total: 0
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    
    // Set up real-time subscription
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const channel = supabase
        .channel('public:time_logs')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'time_logs' }, () => {
          fetchDashboardData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, []);

  const fetchDashboardData = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // Fetch only today's logs
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const { data: logs } = await supabase
      .from('time_logs')
      .select('employee_id, evento_detectado, timestamp')
      .gte('timestamp', today.toISOString())
      .order('timestamp', { ascending: true });

    if (logs) {
      // Calculate current state per employee
      const employeeStates = new Map<string, string>();
      
      logs.forEach(log => {
        const ev = log.evento_detectado?.trim().toUpperCase().replace(/ /g, '_');
        if (ev === 'INGRESO' || ev === 'INGRESO_ESPECIAL' || ev === 'REGRESO_REFACCION' || ev === 'REGRESO_ALMUERZO' || ev === 'REGRESO_COMISION') {
          employeeStates.set(log.employee_id, 'LABORANDO');
        } else if (ev === 'SALIDA_REFACCION') {
          employeeStates.set(log.employee_id, 'DESAYUNO');
        } else if (ev === 'SALIDA_ALMUERZO') {
          employeeStates.set(log.employee_id, 'ALMUERZO');
        } else if (ev === 'SALIDA_FINAL') {
          employeeStates.set(log.employee_id, 'SALIDA');
        }
      });

      const counts = {
        presentes: 0,
        desayunando: 0,
        almorzando: 0,
        salidas: 0,
        total: employeeStates.size
      };

      employeeStates.forEach(state => {
        if (state === 'LABORANDO') counts.presentes++;
        if (state === 'DESAYUNO') counts.desayunando++;
        if (state === 'ALMUERZO') counts.almorzando++;
        if (state === 'SALIDA') counts.salidas++;
      });

      setStats(counts);
    }
    
    setLoading(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse font-bold">Cargando dashboard...</div>;

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center">
          <Activity className="w-6 h-6 text-[#2ec4f1]" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard en Tiempo Real</h2>
          <p className="text-slate-500 font-medium mt-1">Monitoreo de asistencia del personal actual.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center gap-4">
          <div className="p-4 bg-emerald-100 rounded-xl">
            <Users className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest">Laborando</p>
            <p className="text-3xl font-black text-slate-900">{stats.presentes}</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex items-center gap-4">
          <div className="p-4 bg-amber-100 rounded-xl">
            <Coffee className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-600 uppercase tracking-widest">Desayunando</p>
            <p className="text-3xl font-black text-slate-900">{stats.desayunando}</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex items-center gap-4">
          <div className="p-4 bg-blue-100 rounded-xl">
            <Clock className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">Almorzando</p>
            <p className="text-3xl font-black text-slate-900">{stats.almorzando}</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex items-center gap-4">
          <div className="p-4 bg-slate-200 rounded-xl">
            <LogOut className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">Salieron</p>
            <p className="text-3xl font-black text-slate-900">{stats.salidas}</p>
          </div>
        </div>

      </div>
    </div>
  );
}
