"use client";

import { useState } from 'react';
import { ModulePage } from '@/components/module-page';
import { Users, Clock, Calculator } from 'lucide-react';
import GestionPersonalTab from './components/GestionPersonalTab';
import AuditoriaTab from './components/AuditoriaTab';
import PlanillaTab from './components/PlanillaTab';

export default function RRHHPage() {
  const [activeTab, setActiveTab] = useState("gestion");

  return (
    <ModulePage
      title="Recursos Humanos & Nómina"
      category="Recursos Humanos"
      subtitle="Gestión integral de personal, control de asistencia biométrica y cálculo de nóminas."
      actions={
        <div className="text-sm font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-4 py-2 rounded-xl">
          Módulo HRMS Activo
        </div>
      }
    >
      <div className="w-full mt-6">
        <div className="grid w-full grid-cols-3 max-w-2xl bg-slate-100/50 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab("gestion")}
            className={`flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'gestion' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users className="w-4 h-4" />
            Gestión de Personal
          </button>
          <button 
            onClick={() => setActiveTab("auditoria")}
            className={`flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'auditoria' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock className="w-4 h-4" />
            Auditoría de Asistencia
          </button>
          <button 
            onClick={() => setActiveTab("planilla")}
            className={`flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'planilla' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Calculator className="w-4 h-4" />
            Cálculo de Planilla
          </button>
        </div>

        <div className="mt-8">
          {activeTab === 'gestion' && <GestionPersonalTab />}
          {activeTab === 'auditoria' && <AuditoriaTab />}
          {activeTab === 'planilla' && <PlanillaTab />}
        </div>
      </div>
    </ModulePage>
  );
}
