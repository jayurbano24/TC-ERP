"use client";

import { useState, useEffect } from 'react';
import { Card, Button, Spinner } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { UserPlus, UploadCloud } from 'lucide-react';
import EmployeeModal from './EmployeeModal';

export default function GestionPersonalTab() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [shifts, setShifts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: empData } = await supabase.from('employees').select('*, company_shifts(name)').order('created_at', { ascending: false });
      if (empData) setEmployees(empData);

      const { data: shiftData } = await supabase.from('company_shifts').select('*');
      if (shiftData) setShifts(shiftData);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Gestión de Personal</h2>
          <p className="text-sm text-slate-500">Administra los contratos, información y enrolamiento biométrico de tu equipo.</p>
        </div>
        <Button variant="primary" className="gap-2" onClick={() => setIsModalOpen(true)}>
          <UserPlus className="w-4 h-4" /> Nuevo Empleado
        </Button>
      </div>

      <EmployeeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchData} 
        shifts={shifts} 
      />

      <Card padding="none" className="overflow-hidden border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase font-black text-slate-500 tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Nombre / Depto</th>
                <th className="px-6 py-4">Contrato</th>
                <th className="px-6 py-4">Horario</th>
                <th className="px-6 py-4">Biometría</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    <Spinner size="md" className="mx-auto mb-2" /> Cargando...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-medium">No hay empleados registrados.</td>
                </tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{emp.codigo_empleado || 'PENDIENTE'}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{emp.nombre_completo}</div>
                      <div className="text-xs text-slate-500">{emp.departamento}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                        {emp.tipo_contrato}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{emp.company_shifts?.name || 'No asignado'}</td>
                    <td className="px-6 py-4">
                      {emp.face_embedding ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                          Enrolado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="outline" size="sm" className="text-xs">Editar</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
