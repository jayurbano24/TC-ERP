"use client";

import { useState, useEffect } from 'react';
import { Card, Button, Spinner } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { UserPlus, UploadCloud, Download, Upload, Trash2, CheckSquare, Clock } from 'lucide-react';
import EmployeeModal from './EmployeeModal';
import * as XLSX from 'xlsx';
import { useRef } from 'react';

export default function GestionPersonalTab() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [shifts, setShifts] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [employeeTypes, setEmployeeTypes] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkShiftModalOpen, setIsBulkShiftModalOpen] = useState(false);
  const [selectedBulkShift, setSelectedBulkShift] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: empData } = await supabase.from('employees').select('*, company_shifts(name), hr_departments(name), hr_positions(name)').order('created_at', { ascending: false });
      if (empData) setEmployees(empData);

      const { data: shiftData } = await supabase.from('company_shifts').select('*');
      if (shiftData) setShifts(shiftData);

      const { data: dptData } = await supabase.from('hr_departments').select('*').order('name');
      if (dptData) setDepartments(dptData);

      const { data: posData } = await supabase.from('hr_positions').select('*').order('name');
      if (posData) setPositions(posData);

      const { data: typeData } = await supabase.from('hr_employee_types').select('*').order('name');
      if (typeData) setEmployeeTypes(typeData);
    }
    setLoading(false);
  };

  const handleExport = () => {
    const exportData = employees.map(e => ({
      'Código': e.codigo_empleado,
      'Nombre Completo': e.nombre_completo,
      'Departamento': e.hr_departments?.name || '',
      'Cargo / Puesto': e.hr_positions?.name || '',
      'Categoría de Empleado': e.hr_employee_types?.name || '',
      'DPI': e.dpi || '',
      'NIT': e.nit || '',
      'IGSS': e.igss || '',
      'Sexo (Masculino/Femenino)': e.sexo || 'Masculino',
      'Fecha Ingreso (YYYY-MM-DD)': e.fecha_inicio_labores,
      'Sueldo Base': e.sueldo_mensual_base,
      'Tipo de Contrato (Fijo/Temporada)': e.tipo_contrato,
      'Banco': e.banco || '',
      'Cuenta': e.numero_cuenta || ''
    }));

    if (exportData.length === 0) {
       exportData.push({
         'Código': '', 'Nombre Completo': 'Ejemplo', 'Departamento': 'Ventas', 'Cargo / Puesto': 'Vendedor', 'Categoría de Empleado': 'Permanente', 'DPI': '123', 'NIT': '123', 'IGSS': '123', 'Sexo (Masculino/Femenino)': 'Masculino', 'Fecha Ingreso (YYYY-MM-DD)': '2026-01-01', 'Sueldo Base': 5000, 'Tipo de Contrato (Fijo/Temporada)': 'Fijo', 'Banco': 'Banco X', 'Cuenta': '123456'
       });
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Empleados");
    XLSX.writeFile(wb, "Plantilla_Empleados.xlsx");
  };

  const handleBulkAssignShift = async () => {
    if (selectedIds.length === 0 || !selectedBulkShift) return;

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.from('employees').update({ shift_id: selectedBulkShift }).in('id', selectedIds);
      if (error) {
        console.error("Error assigning shift:", error);
        alert("Hubo un error al asignar el horario.");
      } else {
        setSelectedIds([]);
        setIsBulkShiftModalOpen(false);
        setSelectedBulkShift('');
        fetchData();
      }
    }
    setLoading(false);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.length} empleado(s)? Esta acción no se puede deshacer.`)) return;

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.from('employees').delete().in('id', selectedIds);
      if (error) {
        console.error("Error deleting employees:", error);
        alert("Hubo un error al eliminar los empleados. Verifica si tienen registros asociados.");
      } else {
        setSelectedIds([]);
        fetchData();
      }
    }
    setLoading(false);
  };

  const handleDeleteIndividual = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar a ${name}?`)) return;

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) {
        console.error("Error deleting employee:", error);
        alert("Hubo un error al eliminar el empleado.");
      } else {
        setSelectedIds(prev => prev.filter(selId => selId !== id));
        fetchData();
      }
    }
    setLoading(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === employees.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(employees.map(e => e.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleImport = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;

        const { data: allEmps } = await supabase.from('employees').select('id, dpi, nombre_completo, codigo_empleado');

        let inserted = 0;
        let updated = 0;
        let failed = 0;

        for (const row of data as any[]) {
          if (!row['Nombre Completo'] || row['Nombre Completo'] === 'Ejemplo') continue;

          // Find foreign keys by name (case-insensitive)
          const dept = departments.find(d => d.name.toLowerCase() === row['Departamento']?.toString().toLowerCase());
          const pos = positions.find(p => p.name.toLowerCase() === row['Cargo / Puesto']?.toString().toLowerCase());
          const type = employeeTypes.find(t => t.name.toLowerCase() === row['Categoría de Empleado']?.toString().toLowerCase());

          const rowDpi = row['DPI']?.toString();
          const rowName = row['Nombre Completo'].toString();

          const match = allEmps?.find(e => 
            (rowDpi && e.dpi === rowDpi) || 
            (e.nombre_completo.toLowerCase() === rowName.toLowerCase())
          );

          if (match) {
            // Actualizar existente (mapeo mínimo solicitado)
            const { error } = await supabase.from('employees').update({
              nombre_completo: rowName,
              dpi: rowDpi || null,
              banco: row['Banco']?.toString() || null,
              numero_cuenta: row['Cuenta']?.toString() || null
            }).eq('id', match.id);

            if (error) {
              console.error(`Error actualizando a ${rowName}:`, JSON.stringify(error));
              failed++;
            } else {
              updated++;
            }
          } else {
            // Insertar nuevo
            const newCode = `EMP-M${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
            const { error } = await supabase.from('employees').insert({
              codigo_empleado: newCode,
              nombre_completo: rowName,
              department_id: dept ? dept.id : null,
              departamento: row['Departamento']?.toString() || 'Por Definir', // Fix constraint
              position_id: pos ? pos.id : null,
              employee_type_id: type ? type.id : null,
              dpi: rowDpi || null,
              nit: row['NIT']?.toString() || null,
              igss: row['IGSS']?.toString() || null,
              sexo: row['Sexo (Masculino/Femenino)']?.toString().toLowerCase().includes('fem') ? 'Femenino' : 'Masculino',
              fecha_inicio_labores: row['Fecha Ingreso (YYYY-MM-DD)'] || new Date().toISOString().split('T')[0],
              sueldo_mensual_base: parseFloat(row['Sueldo Base']) || 0,
              tipo_contrato: row['Tipo de Contrato (Fijo/Temporada)']?.toString().toLowerCase().includes('temp') ? 'Temporada' : 'Fijo',
              banco: row['Banco']?.toString() || null,
              numero_cuenta: row['Cuenta']?.toString() || null,
              status: 'Activo'
            });
            
            if (error) {
              console.error(`Error insertando a ${rowName}:`, JSON.stringify(error));
              alert(`Error con ${rowName}: ${error.message || JSON.stringify(error)}`);
              failed++;
            } else {
              inserted++;
            }
          }
        }
        
        if (failed > 0) {
            alert(`Importación completada con errores: Se añadieron ${inserted}, se actualizaron ${updated}, fallaron ${failed}.`);
        } else {
            alert(`Importación exitosa. Nuevos: ${inserted} | Actualizados: ${updated}.`);
        }
        
        fetchData();
      } catch (err) {
        console.error(err);
        alert("Error al importar el archivo Excel");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Gestión de Personal</h2>
          <p className="text-sm text-slate-500">Administra los contratos, información y enrolamiento biométrico de tu equipo.</p>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleImport} />
          <Button variant="outline" className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={handleExport} disabled={loading}>
            <Download className="w-4 h-4" /> Exportar Plantilla
          </Button>
          <Button variant="outline" className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            <Upload className="w-4 h-4" /> Importar Excel
          </Button>
          {selectedIds.length > 0 && (
            <>
              <Button variant="outline" className="gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 animate-in fade-in" onClick={() => setIsBulkShiftModalOpen(true)} disabled={loading}>
                <Clock className="w-4 h-4" /> Asignar Horario ({selectedIds.length})
              </Button>
              <Button variant="outline" className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50 animate-in fade-in" onClick={handleDeleteSelected} disabled={loading}>
                <Trash2 className="w-4 h-4" /> Eliminar ({selectedIds.length})
              </Button>
            </>
          )}
          <Button variant="primary" className="gap-2" onClick={() => { setSelectedEmployee(null); setIsModalOpen(true); }} disabled={loading}>
            <UserPlus className="w-4 h-4" /> Nuevo Empleado
          </Button>
        </div>
      </div>

      <EmployeeModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setSelectedEmployee(null); }} 
        onSuccess={fetchData} 
        shifts={shifts} 
        departments={departments}
        positions={positions}
        employeeTypes={employeeTypes}
        employee={selectedEmployee}
      />

      <Card padding="none" className="overflow-hidden border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase font-black text-slate-500 tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded text-[#2ec4f1] focus:ring-[#2ec4f1] cursor-pointer"
                    checked={employees.length > 0 && selectedIds.length === employees.length}
                    onChange={toggleSelectAll}
                  />
                </th>
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
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <Spinner size="md" className="mx-auto mb-2" /> Cargando...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 font-medium">No hay empleados registrados.</td>
                </tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.includes(emp.id) ? 'bg-slate-50' : ''}`}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className="rounded text-[#2ec4f1] focus:ring-[#2ec4f1] cursor-pointer"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                      />
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">{emp.codigo_empleado || 'PENDIENTE'}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{emp.nombre_completo}</div>
                      <div className="text-xs text-slate-500">{emp.hr_departments?.name || emp.departamento || 'Sin Depto'} - {emp.hr_positions?.name || 'Sin Cargo'}</div>
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
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => { setSelectedEmployee(emp); setIsModalOpen(true); }}>Editar</Button>
                      <Button variant="outline" size="sm" className="text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600 border-rose-100" onClick={() => handleDeleteIndividual(emp.id, emp.nombre_completo)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isBulkShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-600"/> Asignar Horario Masivo</h3>
              <p className="text-xs text-slate-500 mt-1">Selecciona el horario a asignar para los {selectedIds.length} empleados seleccionados.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Horario</label>
                <select 
                  value={selectedBulkShift} 
                  onChange={e => setSelectedBulkShift(e.target.value)} 
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm"
                >
                  <option value="">-- Seleccione --</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setIsBulkShiftModalOpen(false)} disabled={loading}>Cancelar</Button>
              <Button variant="primary" onClick={handleBulkAssignShift} disabled={!selectedBulkShift || loading}>
                {loading ? 'Asignando...' : 'Asignar a Todos'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
