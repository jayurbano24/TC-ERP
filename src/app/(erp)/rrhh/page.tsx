"use client";

import { useState } from 'react';
import { ModulePage } from '@/components/module-page';
import { Users, Clock, Calculator } from 'lucide-react';
import GestionPersonalTab from './components/GestionPersonalTab';
import AuditoriaTab from './components/AuditoriaTab';
import PlanillaTab from './components/PlanillaTab';
import ObligacionesTab from './components/ObligacionesTab';
import CatalogosTab from './components/CatalogosTab';
import ReportesTab from './components/ReportesTab';
import { BarChart2 } from 'lucide-react';

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
        <div className="flex flex-wrap gap-2 bg-slate-100/50 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab("gestion")}
            className={`flex-1 min-w-[160px] flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'gestion' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users className="w-4 h-4" />
            Gestión de Personal
          </button>
          <button 
            onClick={() => setActiveTab("auditoria")}
            className={`flex-1 min-w-[160px] flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'auditoria' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock className="w-4 h-4" />
            Auditoría de Asistencia
          </button>
          <button 
            onClick={() => setActiveTab("planilla")}
            className={`flex-1 min-w-[160px] flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'planilla' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Calculator className="w-4 h-4" />
            Cálculo de Planilla
          </button>
          <button 
            onClick={() => setActiveTab("obligaciones")}
            className={`flex-1 min-w-[160px] flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'obligaciones' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <BarChart2 className="w-4 h-4" />
            Obligaciones e Impuestos
          </button>
          <button 
            onClick={() => setActiveTab("catalogos")}
            className={`flex-1 min-w-[160px] flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'catalogos' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users className="w-4 h-4" />
            Catálogos y Estructura
          </button>
          <button 
            onClick={() => setActiveTab("reportes")}
            className={`flex-1 min-w-[160px] flex items-center justify-center py-2 rounded-xl font-bold gap-2 transition-all ${activeTab === 'reportes' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <BarChart2 className="w-4 h-4" />
            Reportes
          </button>
        </div>

        <div className="mt-8">
          {activeTab === 'gestion' && <GestionPersonalTab />}
          {activeTab === 'auditoria' && <AuditoriaTab />}
          {activeTab === 'planilla' && <PlanillaTab />}
          {activeTab === 'obligaciones' && <ObligacionesTab />}
          {activeTab === 'catalogos' && <CatalogosTab />}
          {activeTab === 'reportes' && <ReportesTab />}
        </div>
      </div>
    </ModulePage>
  );
}
