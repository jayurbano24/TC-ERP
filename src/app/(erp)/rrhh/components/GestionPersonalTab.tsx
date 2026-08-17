"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, Button, Spinner, notify, confirmDialog } from '@/components/ui';
import {
  COMPANY_SHIFT_SELECT,
  EMPLOYEE_LIST_SELECT,
  HR_DEPARTMENT_SELECT,
  HR_EMPLOYEE_TYPE_SELECT,
  HR_POSITION_SELECT,
} from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { UserPlus, UploadCloud, Download, Upload, Trash2, CheckSquare, Clock, GitMerge } from 'lucide-react';
import EmployeeModal from './EmployeeModal';
import * as XLSX from 'xlsx';
import { useRef } from 'react';
import { normalizeEmployeeName } from '@/modules/rrhh/shared/employeeName';

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

  const duplicateNameKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const emp of employees) {
      const key = normalizeEmployeeName(String(emp.nombre_completo || ''));
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const dups = new Set<string>();
    for (const [key, n] of counts) {
      if (n > 1) dups.add(key);
    }
    return dups;
  }, [employees]);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: empData } = await supabase.from('employees').select(EMPLOYEE_LIST_SELECT).order('created_at', { ascending: false });
      if (empData) {
        const { data: bioRows } = await supabase
          .from('employee_face_embeddings')
          .select('employee_id')
          .eq('active', true);
        const bioSet = new Set((bioRows || []).map((r) => r.employee_id as string));
        setEmployees(empData.map((emp) => ({ ...emp, face_embedding: bioSet.has(emp.id) ? true : null })));
      }

      const { data: shiftData, error: shiftErr } = await supabase
        .from('company_shifts')
        .select(COMPANY_SHIFT_SELECT)
        .order('name');
      if (shiftErr) {
        console.error('[rrhh] company_shifts:', shiftErr.message);
        notify.error('No se pudieron cargar los horarios');
      } else if (shiftData) {
        setShifts(shiftData);
      }

      const { data: dptData } = await supabase.from('hr_departments').select(HR_DEPARTMENT_SELECT).order('name');
      if (dptData) setDepartments(dptData);

      const { data: posData } = await supabase.from('hr_positions').select(HR_POSITION_SELECT).order('name');
      if (posData) setPositions(posData);

      const { data: typeData } = await supabase.from('hr_employee_types').select(HR_EMPLOYEE_TYPE_SELECT).order('name');
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
        notify.error('No se pudo asignar el horario');
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
    const ok = await confirmDialog({
      title: 'Eliminar empleados',
      message: `¿Estás seguro de que deseas eliminar ${selectedIds.length} empleado(s)? Esta acción no se puede deshacer.`,
      tone: 'error',
      confirmText: 'Eliminar',
    });
    if (!ok) return;

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.from('employees').delete().in('id', selectedIds);
      if (error) {
        console.error("Error deleting employees:", error);
        notify.error('No se pudieron eliminar los empleados', { description: 'Verifica si tienen registros asociados.' });
      } else {
        setSelectedIds([]);
        fetchData();
      }
    }
    setLoading(false);
  };

  const handleDeleteIndividual = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: 'Eliminar empleado',
      message: `¿Estás seguro de que deseas eliminar a ${name}?`,
      tone: 'error',
      confirmText: 'Eliminar',
    });
    if (!ok) return;

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) {
        console.error("Error deleting employee:", error);
        notify.error('No se pudo eliminar el empleado');
      } else {
        setSelectedIds(prev => prev.filter(selId => selId !== id));
        fetchData();
      }
    }
    setLoading(false);
  };

  /** Deja un solo registro por nombre; conserva biometría / Activo / más antiguo. */
  const handleMergeDuplicateNames = async () => {
    if (duplicateNameKeys.size === 0) {
      notify.info('No hay nombres duplicados en la lista.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Fusionar duplicados por nombre',
      message: `Hay ${duplicateNameKeys.size} nombre(s) repetido(s). Se conservará un registro por nombre (p.ej. JOSHUA MISAEL…) y se eliminarán los demás. ¿Continuar?`,
      tone: 'error',
      confirmText: 'Fusionar',
    });
    if (!ok) return;

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const byName = new Map<string, typeof employees>();
      for (const emp of employees) {
        const key = normalizeEmployeeName(String(emp.nombre_completo || ''));
        if (!key) continue;
        const list = byName.get(key) || [];
        list.push(emp);
        byName.set(key, list);
      }

      let deleted = 0;
      let failed = 0;

      for (const [, group] of byName) {
        if (group.length < 2) continue;
        const ranked = [...group].sort((a, b) => {
          const aBio = a.face_embedding ? 0 : 1;
          const bBio = b.face_embedding ? 0 : 1;
          if (aBio !== bBio) return aBio - bBio;
          const aAct = String(a.status || '').toLowerCase() === 'activo' ? 0 : 1;
          const bAct = String(b.status || '').toLowerCase() === 'activo' ? 0 : 1;
          if (aAct !== bAct) return aAct - bAct;
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          if (ta !== tb) return ta - tb;
          return String(a.codigo_empleado || '').localeCompare(String(b.codigo_empleado || ''));
        });
        const keep = ranked[0];
        const losers = ranked.slice(1);

        for (const lose of losers) {
          await supabase.from('time_logs').update({ employee_id: keep.id }).eq('employee_id', lose.id);
          await supabase.from('employee_face_embeddings').delete().eq('employee_id', lose.id);
          await supabase.from('employee_current_status').delete().eq('employee_id', lose.id);

          const { error } = await supabase.from('employees').delete().eq('id', lose.id);
          if (error) {
            console.error('[rrhh] merge delete', lose.id, error);
            failed++;
          } else {
            deleted++;
          }
        }
      }

      if (failed > 0) {
        notify.warning('Fusión parcial', {
          description: `Eliminados ${deleted}. Fallaron ${failed} (pueden tener registros asociados).`,
        });
      } else {
        notify.success('Duplicados fusionados', {
          description:
            deleted > 0
              ? `Se eliminaron ${deleted} registro(s) duplicado(s).`
              : 'Nada que eliminar.',
        });
      }
      setSelectedIds([]);
      await fetchData();
    } catch (err: any) {
      notify.error('No se pudieron fusionar duplicados', { description: err?.message });
    } finally {
      setLoading(false);
    }
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
        let skippedDup = 0;

        let maxId = 0;
        if (allEmps) {
          allEmps.forEach(e => {
            const match = e.codigo_empleado?.match(/\d+/);
            if (match) {
              const num = parseInt(match[0], 10);
              if (num > maxId && num < 100000) maxId = num;
            }
          });
        }

        const { findEmployeeDuplicateByName, normalizeEmployeeName } = await import(
          '@/modules/rrhh/shared/employeeName'
        );
        const seenNamesInFile = new Set<string>();
        const workingEmps = [...(allEmps || [])];

        for (const row of data as any[]) {
          if (!row['Nombre Completo'] || row['Nombre Completo'] === 'Ejemplo') continue;

          // Find foreign keys by name (case-insensitive)
          const dept = departments.find(d => d.name.toLowerCase() === row['Departamento']?.toString().toLowerCase());
          const pos = positions.find(p => p.name.toLowerCase() === row['Cargo / Puesto']?.toString().toLowerCase());
          const type = employeeTypes.find(t => t.name.toLowerCase() === row['Categoría de Empleado']?.toString().toLowerCase());

          const rowDpi = row['DPI']?.toString();
          const rowName = String(row['Nombre Completo']).trim();
          const nameKey = normalizeEmployeeName(rowName);

          if (seenNamesInFile.has(nameKey)) {
            skippedDup++;
            continue;
          }
          seenNamesInFile.add(nameKey);

          const matchByDpi = rowDpi
            ? workingEmps.find((e) => e.dpi && e.dpi === rowDpi)
            : undefined;
          const matchByName = findEmployeeDuplicateByName(workingEmps, rowName);
          const match = matchByDpi || matchByName || null;

          if (match) {
            // Actualizar existente (mismo DPI o mismo nombre — no crear duplicado)
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
              const idx = workingEmps.findIndex((e) => e.id === match.id);
              if (idx >= 0) {
                workingEmps[idx] = {
                  ...workingEmps[idx],
                  nombre_completo: rowName,
                  dpi: rowDpi || workingEmps[idx].dpi,
                };
              }
            }
          } else {
            // Insertar nuevo con código consecutivo
            maxId++;
            const newCode = `EMP-${maxId.toString().padStart(4, '0')}`;
            const { data: insertedRow, error } = await supabase.from('employees').insert({
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
            }).select('id, dpi, nombre_completo, codigo_empleado').single();
            
            if (error) {
              console.error(`Error insertando a ${rowName}:`, JSON.stringify(error));
              const isDup =
                /DUPLICATE_EMPLOYEE_NAME|duplicate|unique/i.test(error.message || '') ||
                error.code === '23505';
              if (isDup) {
                skippedDup++;
              } else {
                notify.error(`Error con ${rowName}`, { description: error.message || JSON.stringify(error) });
                failed++;
              }
            } else {
              inserted++;
              if (insertedRow) workingEmps.push(insertedRow);
            }
          }
        }
        
        if (failed > 0 || skippedDup > 0) {
            notify.warning('Importación completada con advertencias', {
              description: `Nuevos: ${inserted} | Actualizados: ${updated} | Duplicados omitidos: ${skippedDup} | Fallidos: ${failed}.`,
            });
        } else {
            notify.success('Importación exitosa', { description: `Nuevos: ${inserted} | Actualizados: ${updated}.` });
        }
        
        fetchData();
      } catch (err) {
        console.error(err);
        notify.error('Error al importar el archivo Excel');
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--heading)]">Gestión de Personal</h2>
          <p className="text-sm text-[var(--muted)]">
            Administra los contratos, información y enrolamiento biométrico de tu equipo.
          </p>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleImport} />
          <Button
            variant="outline"
            className="gap-2 border-[var(--success)]/40 text-[var(--success)] hover:bg-[var(--success)]/10"
            onClick={handleExport}
            disabled={loading}
          >
            <Download className="h-4 w-4" /> Exportar Plantilla
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-[var(--success)]/40 text-[var(--success)] hover:bg-[var(--success)]/10"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            <Upload className="h-4 w-4" /> Importar Excel
          </Button>
          {duplicateNameKeys.size > 0 && (
            <Button
              variant="outline"
              className="gap-2 border-rose-300 text-rose-700 hover:bg-rose-50"
              onClick={() => void handleMergeDuplicateNames()}
              disabled={loading}
            >
              <GitMerge className="h-4 w-4" /> Fusionar duplicados ({duplicateNameKeys.size})
            </Button>
          )}
          {selectedIds.length > 0 && (
            <>
              <Button
                variant="outline"
                className="animate-in fade-in gap-2 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10"
                onClick={() => setIsBulkShiftModalOpen(true)}
                disabled={loading}
              >
                <Clock className="h-4 w-4" /> Asignar Horario ({selectedIds.length})
              </Button>
              <Button
                variant="outline"
                className="animate-in fade-in gap-2 border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                onClick={handleDeleteSelected}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4" /> Eliminar ({selectedIds.length})
              </Button>
            </>
          )}
          <Button
            variant="primary"
            className="gap-2"
            onClick={() => {
              setSelectedEmployee(null);
              setIsModalOpen(true);
            }}
            disabled={loading}
          >
            <UserPlus className="h-4 w-4" /> Nuevo Empleado
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

      <Card padding="none" className="overflow-hidden border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs font-black tracking-wider text-[var(--muted)] uppercase">
              <tr>
                <th className="w-10 px-6 py-4">
                  <input
                    type="checkbox"
                    className="cursor-pointer rounded text-[var(--accent)] focus:ring-[var(--accent)]"
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
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[var(--muted)]">
                    <Spinner size="md" className="mx-auto mb-2" /> Cargando...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center font-medium text-[var(--muted)]">
                    No hay empleados registrados.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className={`transition-colors hover:bg-[var(--surface-hover)] ${
                      selectedIds.includes(emp.id) ? 'bg-[var(--surface-hover)]' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="cursor-pointer rounded text-[var(--accent)] focus:ring-[var(--accent)]"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                      />
                    </td>
                    <td className="px-6 py-4 font-bold text-[var(--foreground)]">
                      {emp.codigo_empleado || 'PENDIENTE'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-bold text-[var(--heading)]">{emp.nombre_completo}</div>
                        {duplicateNameKeys.has(normalizeEmployeeName(String(emp.nombre_completo || ''))) && (
                          <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700">
                            Duplicado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {emp.hr_departments?.name || emp.departamento || 'Sin Depto'} -{' '}
                        {emp.hr_positions?.name || 'Sin Cargo'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-2 py-1 text-[10px] font-bold text-[var(--muted)]">
                        {emp.tipo_contrato}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-[var(--foreground)]">
                      {emp.company_shifts?.name || 'No asignado'}
                    </td>
                    <td className="px-6 py-4">
                      {emp.face_embedding ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--success)]/30 bg-[var(--success)]/15 px-2 py-1 text-[10px] font-bold text-[var(--success)]">
                          Enrolado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/15 px-2 py-1 text-[10px] font-bold text-[var(--warning)]">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="flex items-center justify-end gap-2 px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setIsModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-[var(--danger)]/30 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/10"
                        onClick={() => handleDeleteIndividual(emp.id, emp.nombre_completo)}
                      >
                        <Trash2 className="h-3 w-3" />
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
        <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 fade-in backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="rounded-t-2xl border-b border-[var(--border)] bg-[var(--surface)] p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--heading)]">
                <Clock className="h-5 w-5 text-[var(--accent)]" /> Asignar Horario Masivo
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Selecciona el horario a asignar para los {selectedIds.length} empleados seleccionados.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-widest text-[var(--muted)] uppercase">Horario</label>
                <select
                  value={selectedBulkShift}
                  onChange={(e) => setSelectedBulkShift(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-3 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">-- Seleccione --</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl border-t border-[var(--border)] bg-[var(--surface-hover)] p-4">
              <Button variant="outline" onClick={() => setIsBulkShiftModalOpen(false)} disabled={loading}>
                Cancelar
              </Button>
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
