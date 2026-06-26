'use client';

import { memo } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { X, Layers, CheckCircle2 } from 'lucide-react';

type Props = {
  modalType: string;
  editingItem: any | null;
  formData: any;
  setFormData: (v: any) => void;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
  marcas: any[];
  tecnologias: any[];
  modelos: any[];
  reparaciones: any[];
  updateSeriesCount: (count: number) => void;
  modelsInSelectedBrand: any[];
};

/**
 * C1: modal de alta/edición de catálogos extraído del monolito configuracion
 * y memoizado. El estado (formData) y la persistencia (onSave) viven en el
 * padre; aquí sólo se renderiza el formulario según `modalType`.
 */
export const ConfigModal = memo(function ConfigModal({
  modalType,
  editingItem,
  formData,
  setFormData,
  onSave,
  onClose,
  marcas,
  tecnologias,
  modelos,
  reparaciones,
  updateSeriesCount,
  modelsInSelectedBrand,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/60 backdrop-blur-md p-6 overflow-y-auto">
      <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden border-none my-8">
        <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
          <h3 className="text-lg font-bold uppercase tracking-tight">
            {editingItem ? 'Editar' : 'Agregar'} {modalType.toUpperCase()}
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={onSave} className="p-8 space-y-6 bg-white">
          {modalType === 'agencia' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">ID Agencia / Tienda</label>
                  <input
                    type="text" required
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                    value={formData.id || ''}
                    onChange={e => setFormData({...formData, id: e.target.value.toUpperCase()})}
                    placeholder="Ej. G213"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Tienda</label>
                  <input
                    type="text" required
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                    value={formData.nombre || ''}
                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                    placeholder="Ej. Atanasio Tzul"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Encargado de Tienda</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                  value={formData.encargado || ''}
                  onChange={e => setFormData({...formData, encargado: e.target.value})}
                  placeholder="Nombre Completo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Email Notificaciones</label>
                  <input
                    type="email" required
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                    value={formData.email || ''}
                    onChange={e => setFormData({...formData, email: e.target.value.toLowerCase()})}
                    placeholder="ejemplo@claro.com.gt"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Teléfono(s)</label>
                  <textarea
                    required
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1] min-h-[80px]"
                    value={formData.telefono || ''}
                    onChange={e => setFormData({...formData, telefono: e.target.value})}
                    placeholder="Ingrese uno o más números (uno por línea)"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Dirección Física de la Tienda</label>
                <textarea
                  required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1] min-h-[100px]"
                  value={formData.direccion || ''}
                  onChange={e => setFormData({...formData, direccion: e.target.value})}
                  placeholder="Ej. Diagonal 1 51-57 zona 12 locales 89 y 90 C.C. Atanasio Tzul"
                />
              </div>
            </div>
          )}

          {modalType === 'marca' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Marca</label>
              <input
                type="text" required
                className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                value={formData.nombre || ''}
                onChange={e => setFormData({...formData, nombre: e.target.value})}
                placeholder="Ej. Samsung"
              />
            </div>
          )}

          {modalType === 'transporte' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Código</label>
                <input
                  type="text"
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1] uppercase"
                  value={formData.id || ''}
                  onChange={e => setFormData({...formData, id: e.target.value})}
                  placeholder="Dejar en blanco para auto-generar"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Empresa</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                  value={formData.nombre || ''}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej. Cargo Express"
                />
              </div>
            </div>
          )}

          {modalType === 'modelo' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Marca</label>
                  <select
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                    value={formData.marcaId || ''}
                    onChange={e => setFormData({...formData, marcaId: e.target.value})}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Tecnología Base</label>
                  <select
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                    value={formData.tecnologiaId || ''}
                    onChange={e => {
                      const tech = tecnologias.find(t => t.id === e.target.value);
                      setFormData({
                        ...formData,
                        tecnologiaId: e.target.value,
                        seriesCount: tech?.seriesCount || formData.seriesCount,
                        digitsPerSeries: tech?.digitsPerSeries || formData.digitsPerSeries || [12]
                      });
                    }}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {tecnologias.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Nombre del Modelo</label>
                  <input
                    type="text" required
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                    value={formData.nombre || ''}
                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 space-y-4">
                   <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-[#2ec4f1]">Cantidad de Campos de Serie</label>
                    <input
                      type="number" required min="1" max="4"
                      className="w-full bg-blue-50/50 p-4 rounded-xl border border-[#2ec4f1]/20 font-bold text-[#181c3a]"
                      value={formData.seriesCount || ''}
                      onChange={e => updateSeriesCount(parseInt(e.target.value))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 animate-rise-in">
                    {Array.from({ length: formData.seriesCount || 0 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-amber-500">Dígitos Serie {i + 1}</label>
                        <input
                          type="number" required min="1"
                          className="w-full bg-amber-50/50 p-4 rounded-xl border border-amber-200 font-bold text-[#181c3a]"
                          value={formData.digitsPerSeries?.[i] || 12}
                          onChange={e => {
                            const newDigits = [...(formData.digitsPerSeries || [])];
                            newDigits[i] = parseInt(e.target.value);
                            setFormData({ ...formData, digitsPerSeries: newDigits });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Modelos Existentes</p>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {formData.marcaId ? (
                    modelsInSelectedBrand.length > 0 ? (
                      modelsInSelectedBrand.map(m => (
                        <div key={m.id} className="flex flex-col bg-white p-4 rounded-xl border border-slate-200 gap-2">
                          <span className="text-xs font-bold text-slate-600">{m.nombre}</span>
                          <div className="flex flex-wrap gap-1">
                            {m.digitsPerSeries?.map((d: number, idx: number) => (
                              <Badge key={idx} className="text-[7px] bg-slate-50 text-slate-400 border-none">S{idx+1}: {d}D</Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-[10px] font-bold uppercase">Sin modelos</p>
                      </div>
                    )
                  ) : (
                    <div className="text-center py-8 text-slate-300">
                      <p className="text-[10px] font-bold uppercase">Seleccione una marca</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {modalType === 'reacondicionado' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Prueba</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-emerald-400"
                  value={formData.nombre || ''}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej. Limpieza de puerto LAN"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Vincular a Tecnología(s) (Opcional)</label>
                  <select
                    multiple
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold text-slate-600 outline-none focus:border-emerald-400 min-h-[120px]"
                    value={formData.technologyIds || []}
                    onChange={e => {
                      const options = Array.from(e.target.selectedOptions, option => option.value).filter(v => v !== '');
                      setFormData({...formData, technologyIds: options, modelIds: []}); // Reset model when technology changes
                    }}
                  >
                    <option value="">TODAS LAS TECNOLOGÍAS</option>
                    {tecnologias.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Vincular a Modelo(s) (Opcional)</label>
                  <select
                    multiple
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold text-slate-600 outline-none focus:border-emerald-400 min-h-[120px]"
                    value={formData.modelIds || []}
                    onChange={e => {
                      const options = Array.from(e.target.selectedOptions, option => option.value).filter(v => v !== '');
                      setFormData({...formData, modelIds: options});
                    }}
                  >
                    <option value="">TODOS LOS MODELOS</option>
                    {modelos
                      .filter(m => !(formData.technologyIds?.length > 0) || formData.technologyIds.includes(m.tecnologiaId))
                      .map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                  <p className="text-[9px] text-slate-400 font-medium px-2">Ctrl+Click para seleccionar múltiples. Si deja en blanco, aplicará a todo el equipo.</p>
                </div>
              </div>
            </div>
          )}

          {modalType === 'tecnologia' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Nombre Tecnología</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                  value={formData.nombre || ''}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                />
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Cant. Series (Default)</label>
                  <input
                    type="number" required
                    className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                    value={formData.seriesCount || ''}
                    onChange={e => updateSeriesCount(parseInt(e.target.value))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: formData.seriesCount || 0 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-slate-400">Dígitos Serie {i + 1}</label>
                      <input
                        type="number" required
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold"
                        value={formData.digitsPerSeries?.[i] || 12}
                        onChange={e => {
                          const newDigits = [...(formData.digitsPerSeries || [])];
                          newDigits[i] = parseInt(e.target.value);
                          setFormData({ ...formData, digitsPerSeries: newDigits });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {modalType === 'diagnostico' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Nombre de la Falla / Diagnóstico</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-amber-400"
                  value={formData.nombre || ''}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej. Sin Señal WIFI"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-slate-400">Vincular Reparaciones Sugeridas</label>
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto p-2 border-2 border-slate-50 rounded-2xl custom-scrollbar">
                  {reparaciones.map(rep => {
                    const isSelected = (formData.reparacionesIds || []).includes(rep.id);
                    return (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => {
                          const currentIds = formData.reparacionesIds || [];
                          const newIds = isSelected
                            ? currentIds.filter((id: string) => id !== rep.id)
                            : [...currentIds, rep.id];
                          setFormData({ ...formData, reparacionesIds: newIds });
                        }}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${isSelected ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-300'}`}>
                          {isSelected && <CheckCircle2 size={12} />}
                        </div>
                        <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-amber-700' : 'text-slate-600'}`}>{rep.nombre}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {modalType === 'px_provider' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Nombre de Proveedor PX</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                  value={formData.nombre || ''}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej. LGB"
                />
              </div>
            </div>
          )}

          {modalType === 'razon_devolucion' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Razón de Devolución</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-rose-400"
                  value={formData.nombre || ''}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej. Garantía - No enciende"
                />
              </div>
            </div>
          )}

          {modalType === 'reparacion' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Descripción de la Reparación</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-[#2ec4f1]"
                  value={formData.nombre || ''}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  placeholder="Ej. Cambio de Fuente de Poder"
                />
              </div>
            </div>
          )}

          {modalType === 'usuario' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Nombre y Apellido</label>
                <input
                  type="text" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                  value={formData.full_name || ''}
                  onChange={e => setFormData({...formData, full_name: e.target.value})}
                  placeholder="Ej. Juan Pérez"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400">Correo</label>
                <input
                  type="email" required
                  className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                  value={formData.email || ''}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  placeholder="Ej. usuario@empresa.com"
                />
              </div>

              <div className="pt-4 mt-2 border-t border-slate-100 space-y-4">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Seguridad (Opcional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nueva Contraseña</label>
                    <input
                      type="password"
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                      value={formData.password || ''}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      placeholder="Dejar en blanco para no cambiar"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Confirmar Contraseña</label>
                    <input
                      type="password"
                      className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 font-bold outline-none focus:border-indigo-400"
                      value={formData.confirm_password || ''}
                      onChange={e => setFormData({...formData, confirm_password: e.target.value})}
                      placeholder="Repita la nueva contraseña"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-4 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" className="flex-1" type="submit">Guardar Configuración</Button>
          </div>
        </form>
      </Card>
    </div>
  );
});
