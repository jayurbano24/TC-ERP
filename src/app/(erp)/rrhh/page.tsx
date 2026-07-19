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
import GestionJustificacionesTab from './components/GestionJustificacionesTab';
import ConfiguracionPoliticasTab from './components/ConfiguracionPoliticasTab';
import DashboardAsistencia from './components/DashboardAsistencia';
import { BarChart2, CheckSquare, Settings, Activity } from 'lucide-react';
import { erpTab } from '@/lib/design/tokens';

const RRHH_TABS = [
  { id: 'dashboard', label: 'Live Dashboard', icon: Activity },
  { id: 'gestion', label: 'Gestión de Personal', icon: Users },
  { id: 'auditoria', label: 'Auditoría de Asistencia', icon: Clock },
  { id: 'planilla', label: 'Cálculo de Planilla', icon: Calculator },
  { id: 'obligaciones', label: 'Obligaciones e Impuestos', icon: BarChart2 },
  { id: 'catalogos', label: 'Catálogos y Estructura', icon: Users },
  { id: 'reportes', label: 'Reportes', icon: BarChart2 },
  { id: 'justificaciones', label: 'Justificaciones', icon: CheckSquare },
  { id: 'politicas', label: 'Políticas', icon: Settings },
] as const;

export default function RRHHPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <ModulePage
      title="Recursos Humanos & Nómina"
      category="Recursos Humanos"
      subtitle="Gestión integral de personal, control de asistencia biométrica y cálculo de nóminas."
      actions={
        <div className="text-sm font-bold border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] px-4 py-2 rounded-xl">
          Módulo HRMS Activo
        </div>
      }
    >
      <div className="w-full mt-6">
        <div className={`${erpTab.list} w-full flex-wrap`} role="tablist">
          {RRHH_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  erpTab.trigger,
                  'flex-1 min-w-[160px] flex items-center justify-center gap-2 normal-case tracking-normal text-sm font-bold py-2',
                  active ? erpTab.triggerActive : erpTab.triggerInactive,
                ].join(' ')}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-8">
          {activeTab === 'dashboard' && <DashboardAsistencia />}
          {activeTab === 'gestion' && <GestionPersonalTab />}
          {activeTab === 'auditoria' && <AuditoriaTab />}
          {activeTab === 'planilla' && <PlanillaTab />}
          {activeTab === 'obligaciones' && <ObligacionesTab />}
          {activeTab === 'catalogos' && <CatalogosTab />}
          {activeTab === 'reportes' && <ReportesTab />}
          {activeTab === 'justificaciones' && <GestionJustificacionesTab />}
          {activeTab === 'politicas' && <ConfiguracionPoliticasTab />}
        </div>
      </div>
    </ModulePage>
  );
}
