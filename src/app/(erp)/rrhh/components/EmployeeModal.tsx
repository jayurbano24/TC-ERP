import { useState, useRef, useEffect } from 'react';
import { Button, Spinner } from '@/components/ui';
import { X, Camera, UploadCloud, User, Briefcase, Fingerprint, Banknote, Trash2 } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function EmployeeModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  shifts,
  departments,
  positions,
  employeeTypes,
  employee
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  shifts: any[];
  departments: any[];
  positions: any[];
  employeeTypes: any[];
  employee?: any;
}) {
  const [activeTab, setActiveTab] = useState<'personal' | 'org' | 'bio'>('personal');
  const [loading, setLoading] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  
  // Expediente Data
  const [formData, setFormData] = useState({
    nombre_completo: '',
    dpi: '',
    nit: '',
    igss: '',
    fecha_nacimiento: '',
    sexo: 'Masculino',
    estado_civil: 'Soltero(a)',
    direccion: '',
    telefono: '',
    email: '',
    banco: '',
    numero_cuenta: '',
    tipo_pago: 'Transferencia',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    contacto_emergencia_relacion: '',
    
    department_id: '',
    position_id: '',
    employee_type_id: '',
    tipo_contrato: 'Fijo',
    fecha_inicio_labores: new Date().toISOString().split('T')[0],
    sueldo_mensual_base: '',
    shift_id: '',
    inicio_temporada: '',
    fin_temporada: ''
  });

  useEffect(() => {
    if (employee) {
      setFormData({
        nombre_completo: employee.nombre_completo || '',
        dpi: employee.dpi || '',
        nit: employee.nit || '',
        igss: employee.igss || '',
        fecha_nacimiento: employee.fecha_nacimiento || '',
        sexo: employee.sexo || 'Masculino',
        estado_civil: employee.estado_civil || 'Soltero(a)',
        direccion: employee.direccion || '',
        telefono: employee.telefono || '',
        email: employee.email || '',
        banco: employee.banco || '',
        numero_cuenta: employee.numero_cuenta || '',
        tipo_pago: employee.tipo_pago || 'Transferencia',
        contacto_emergencia_nombre: employee.contacto_emergencia?.name || '',
        contacto_emergencia_telefono: employee.contacto_emergencia?.phone || '',
        contacto_emergencia_relacion: employee.contacto_emergencia?.relation || '',
        
        department_id: employee.department_id || '',
        position_id: employee.position_id || '',
        employee_type_id: employee.employee_type_id || '',
        tipo_contrato: employee.tipo_contrato || 'Fijo',
        fecha_inicio_labores: employee.fecha_inicio_labores || new Date().toISOString().split('T')[0],
        sueldo_mensual_base: employee.sueldo_mensual_base?.toString() || '',
        shift_id: employee.shift_id || '',
        inicio_temporada: employee.inicio_temporada || '',
        fin_temporada: employee.fin_temporada || ''
      });
      // Biometrics logic can be handled separately, maybe pre-fill if face_embedding exists
      if (employee.face_embedding) {
         setFaceEmbedding(employee.face_embedding);
      } else {
         setFaceEmbedding(null);
      }
    } else {
      // Reset form
      setFormData({
        nombre_completo: '', dpi: '', nit: '', igss: '', fecha_nacimiento: '', sexo: 'Masculino', estado_civil: 'Soltero(a)', direccion: '', telefono: '', email: '', banco: '', numero_cuenta: '', tipo_pago: 'Transferencia', contacto_emergencia_nombre: '', contacto_emergencia_telefono: '', contacto_emergencia_relacion: '', department_id: '', position_id: '', employee_type_id: '', tipo_contrato: 'Fijo', fecha_inicio_labores: new Date().toISOString().split('T')[0], sueldo_mensual_base: '', shift_id: '', inicio_temporada: '', fin_temporada: ''
      });
      setFaceEmbedding(null);
    }
  }, [employee]);

  // Biometrics
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceEmbedding, setFaceEmbedding] = useState<number[] | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const handleDeleteFace = async () => {
    if (!employee?.id) {
       setFaceEmbedding(null);
       return;
    }
    const confirmDelete = window.confirm('¿Está seguro de que desea eliminar el rostro registrado de este empleado?');
    if (!confirmDelete) return;
    
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
         const { error } = await supabase.from('employees').update({ face_embedding: null }).eq('id', employee.id);
         if (!error) {
           setFaceEmbedding(null);
           alert('Rostro eliminado correctamente. Ya puede registrar este rostro en otro usuario.');
         } else {
           alert('Error eliminando rostro: ' + error.message);
         }
      }
    } catch (err: any) {
      alert('Error eliminando rostro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    setBiometricStatus('scanning');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait a bit for the video to start playing
        await new Promise(r => setTimeout(r, 1000));
        
        try {
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('/models')
          ]);
        } catch (modelErr) {
          console.error("Error loading models:", modelErr);
          setBiometricStatus('error');
          stopCamera(stream);
          return;
        }

        let attempts = 0;
        const maxAttempts = 20; // 20 attempts = ~10 seconds
        
        const scanInterval = setInterval(async () => {
          if (!videoRef.current || attempts >= maxAttempts) {
            clearInterval(scanInterval);
            if (attempts >= maxAttempts) {
              setBiometricStatus('error');
              setTimeout(() => { setBiometricStatus('idle'); stopCamera(stream); setIsCameraActive(false); }, 3000);
            }
            return;
          }
          
          attempts++;
          const detections = await faceapi.detectSingleFace(videoRef.current)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detections) {
            clearInterval(scanInterval);
            const supabase = getSupabaseBrowserClient();
            if (supabase) {
              const { data: existingFaces } = await supabase.from('employees').select('id, nombre_completo, face_embedding').not('face_embedding', 'is', null);
              if (existingFaces) {
                let isDuplicate = false;
                let duplicateName = '';
                for (const emp of existingFaces) {
                  if (employee && emp.id === employee.id) continue;
                  const empDescriptor = new Float32Array(emp.face_embedding);
                  const distance = faceapi.euclideanDistance(detections.descriptor, empDescriptor);
                  if (distance < 0.45) {
                    isDuplicate = true;
                    duplicateName = emp.nombre_completo;
                    break;
                  }
                }
                if (isDuplicate) {
                  alert(`Este rostro ya está registrado en el sistema bajo el empleado: ${duplicateName}. No se permiten duplicados.`);
                  setBiometricStatus('idle');
                  stopCamera(stream);
                  setIsCameraActive(false);
                  return;
                }
              }
            }

            setFaceEmbedding(Array.from(detections.descriptor));
            setBiometricStatus('success');
            stopCamera(stream);
          }
        }, 500); // Poll every 500ms
      }
    } catch (err) {
      console.error(err);
      setBiometricStatus('error');
      setIsCameraActive(false);
    }
  };

  const stopCamera = (stream: MediaStream) => {
    stream.getTracks().forEach(track => track.stop());
    setIsCameraActive(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('No supabase client');

      let contrato_url = null;

      // 1. Upload file if exists
      if (contractFile) {
        const fileExt = contractFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { data, error } = await supabase.storage.from('contracts').upload(`public/${fileName}`, contractFile);
        if (!error) {
           const { data: publicUrlData } = supabase.storage.from('contracts').getPublicUrl(`public/${fileName}`);
           contrato_url = publicUrlData.publicUrl;
        }
      }

      // Format Emergencia
      const contacto_emergencia = {
        name: formData.contacto_emergencia_nombre,
        phone: formData.contacto_emergencia_telefono,
        relation: formData.contacto_emergencia_relacion
      };

      // Buscar los nombres para satisfacer los constraints NOT NULL antiguos
      const selectedDept = departments?.find(d => d.id === formData.department_id);

      // 2. Insert or Update employee
      const payload: any = {
        nombre_completo: formData.nombre_completo,
        dpi: formData.dpi || null,
        nit: formData.nit || null,
        igss: formData.igss || null,
        fecha_nacimiento: formData.fecha_nacimiento || null,
        sexo: formData.sexo,
        estado_civil: formData.estado_civil,
        direccion: formData.direccion || null,
        telefono: formData.telefono || null,
        email: formData.email || null,
        banco: formData.banco || null,
        numero_cuenta: formData.numero_cuenta || null,
        tipo_pago: formData.tipo_pago,
        contacto_emergencia: contacto_emergencia,
        
        department_id: formData.department_id || null,
        departamento: selectedDept ? selectedDept.name : 'Por Definir',
        position_id: formData.position_id || null,
        employee_type_id: formData.employee_type_id || null,
        
        tipo_contrato: formData.tipo_contrato,
        fecha_inicio_labores: formData.fecha_inicio_labores || null,
        sueldo_mensual_base: parseFloat(formData.sueldo_mensual_base) || 0,
        shift_id: formData.shift_id || null,
        inicio_temporada: (formData.tipo_contrato === 'Temporada' && formData.inicio_temporada) ? formData.inicio_temporada : null,
        fin_temporada: (formData.tipo_contrato === 'Temporada' && formData.fin_temporada) ? formData.fin_temporada : null,
        face_embedding: faceEmbedding,
        status: 'Activo'
      };

      if (contrato_url) {
        payload.contrato_url = contrato_url;
      }

      let error;
      if (employee?.id) {
        const { error: updateError } = await supabase.from('employees').update(payload).eq('id', employee.id);
        error = updateError;
      } else {
        // Generar código consecutivo (ej. EMP-0022)
        const { data: allCodes } = await supabase.from('employees').select('codigo_empleado');
        let maxId = 0;
        if (allCodes) {
          allCodes.forEach(c => {
            const match = c.codigo_empleado?.match(/\d+/);
            if (match) {
              const num = parseInt(match[0], 10);
              if (num > maxId && num < 100000) maxId = num; 
            }
          });
        }
        payload.codigo_empleado = `EMP-${(maxId + 1).toString().padStart(4, '0')}`;
        
        const { error: insertError } = await supabase.from('employees').insert(payload);
        error = insertError;
      }

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (err: any) {
      alert("Error guardando empleado: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Expediente de Empleado</h2>
            <p className="text-xs font-bold text-slate-500 mt-1">
              Registro completo de Recursos Humanos
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors bg-white shadow-sm">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex border-b border-slate-100 bg-slate-50 px-6">
          <button 
            className={`py-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'personal' ? 'border-[#2ec4f1] text-[#2ec4f1]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            onClick={() => setActiveTab('personal')}
          >
            <User size={14} /> Datos Personales
          </button>
          <button 
            className={`py-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'org' ? 'border-[#2ec4f1] text-[#2ec4f1]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            onClick={() => setActiveTab('org')}
          >
            <Briefcase size={14} /> Organización & Finanzas
          </button>
          <button 
            className={`py-3 px-4 font-bold text-xs uppercase tracking-widest border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'bio' ? 'border-[#2ec4f1] text-[#2ec4f1]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            onClick={() => setActiveTab('bio')}
          >
            <Fingerprint size={14} /> Biometría & Archivos
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          <form id="empForm" onSubmit={handleSubmit} className="space-y-6">
            
            {/* TAB: PERSONAL */}
            {activeTab === 'personal' && (
              <div className="space-y-6 animate-in slide-in-from-left-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Nombre Completo *</label>
                    <input required type="text" value={formData.nombre_completo} onChange={e => setFormData({...formData, nombre_completo: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Correo Electrónico</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">DPI / Pasaporte</label>
                    <input type="text" value={formData.dpi} onChange={e => setFormData({...formData, dpi: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">NIT</label>
                    <input type="text" value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Num. IGSS</label>
                    <input type="text" value={formData.igss} onChange={e => setFormData({...formData, igss: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Fecha de Nacimiento</label>
                    <input type="date" value={formData.fecha_nacimiento} onChange={e => setFormData({...formData, fecha_nacimiento: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Sexo</label>
                    <select value={formData.sexo} onChange={e => setFormData({...formData, sexo: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm">
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Estado Civil</label>
                    <select value={formData.estado_civil} onChange={e => setFormData({...formData, estado_civil: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm">
                      <option value="Soltero(a)">Soltero(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viudo(a)">Viudo(a)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Dirección</label>
                    <input type="text" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Teléfono Personal</label>
                    <input type="text" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                   <h3 className="font-bold text-slate-700 text-sm">Contacto de Emergencia</h3>
                   <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nombre</label>
                        <input type="text" value={formData.contacto_emergencia_nombre} onChange={e => setFormData({...formData, contacto_emergencia_nombre: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Teléfono</label>
                        <input type="text" value={formData.contacto_emergencia_telefono} onChange={e => setFormData({...formData, contacto_emergencia_telefono: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Parentesco</label>
                        <input type="text" value={formData.contacto_emergencia_relacion} onChange={e => setFormData({...formData, contacto_emergencia_relacion: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                      </div>
                   </div>
                </div>
              </div>
            )}

            {/* TAB: ORGANIZACION */}
            {activeTab === 'org' && (
              <div className="space-y-6 animate-in slide-in-from-right-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Departamento *</label>
                    <select required value={formData.department_id} onChange={e => setFormData({...formData, department_id: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm">
                      <option value="">-- Seleccione --</option>
                      {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Cargo *</label>
                    <select required value={formData.position_id} onChange={e => setFormData({...formData, position_id: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm">
                      <option value="">-- Seleccione --</option>
                      {positions?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Categoría Empleado *</label>
                    <select required value={formData.employee_type_id} onChange={e => setFormData({...formData, employee_type_id: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm">
                      <option value="">-- Seleccione --</option>
                      {employeeTypes?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Horario Asignado *</label>
                    <select required value={formData.shift_id} onChange={e => setFormData({...formData, shift_id: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm">
                      <option value="">-- Seleccione --</option>
                      {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Fecha Ingreso *</label>
                    <input required type="date" value={formData.fecha_inicio_labores} onChange={e => setFormData({...formData, fecha_inicio_labores: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Tipo de Contrato *</label>
                    <select value={formData.tipo_contrato} onChange={e => setFormData({...formData, tipo_contrato: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm">
                      <option value="Fijo">Fijo</option>
                      <option value="Temporada">Temporada</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Sueldo Base (Mensual) *</label>
                    <input required type="number" step="0.01" value={formData.sueldo_mensual_base} onChange={e => setFormData({...formData, sueldo_mensual_base: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm font-mono text-emerald-700" />
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 space-y-4">
                   <h3 className="font-bold text-emerald-800 text-sm flex items-center gap-2"><Banknote size={16}/> Datos Bancarios y Nómina</h3>
                   <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Banco</label>
                        <input type="text" value={formData.banco} onChange={e => setFormData({...formData, banco: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-emerald-200 bg-white outline-none focus:border-emerald-500 font-medium text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">No. de Cuenta</label>
                        <input type="text" value={formData.numero_cuenta} onChange={e => setFormData({...formData, numero_cuenta: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-emerald-200 bg-white outline-none focus:border-emerald-500 font-medium text-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Tipo de Pago</label>
                        <select value={formData.tipo_pago} onChange={e => setFormData({...formData, tipo_pago: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-emerald-200 bg-white outline-none focus:border-emerald-500 font-medium text-sm">
                          <option value="Transferencia">Transferencia</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Efectivo">Efectivo</option>
                        </select>
                      </div>
                   </div>
                </div>
              </div>
            )}

            {/* TAB: BIO */}
            {activeTab === 'bio' && (
              <div className="space-y-6 animate-in slide-in-from-right-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Contrato PDF (Opcional)</label>
                  <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
                    <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-[#2ec4f1] mb-2 transition-colors" />
                    <span className="text-sm font-medium text-slate-600">
                      {contractFile ? contractFile.name : 'Haz clic para adjuntar archivo PDF'}
                    </span>
                    <input 
                      type="file" 
                      accept=".pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => setContractFile(e.target.files ? e.target.files[0] : null)}
                    />
                  </div>
                </div>

                <div className="p-6 border border-slate-200 rounded-3xl bg-slate-50 space-y-6 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800">Enrolamiento Biométrico Facial</h4>
                    </div>
                    {faceEmbedding ? (
                      <span className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Completado
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest">
                        Pendiente
                      </span>
                    )}
                  </div>

                  {!faceEmbedding && !isCameraActive && (
                    <Button type="button" variant="primary" className="w-full h-14 text-base font-bold shadow-lg shadow-[var(--accent)]/20" onClick={startCamera}>
                      <Camera className="w-5 h-5 mr-2" />
                      Encender Cámara y Escanear
                    </Button>
                  )}

                  {isCameraActive && (
                    <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center shadow-xl">
                      <video ref={videoRef} autoPlay muted className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 border-4 border-[#2ec4f1]/50 m-8 rounded-2xl pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                      
                      {biometricStatus === 'scanning' && (
                        <div className="absolute bottom-6 flex flex-col items-center animate-pulse">
                          <span className="text-white text-sm font-black tracking-widest drop-shadow-md">ANALIZANDO ROSTRO...</span>
                        </div>
                      )}
                      
                      {biometricStatus === 'error' && (
                        <div className="absolute bottom-6 bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg">
                          No se detectó un rostro claro.
                        </div>
                      )}
                    </div>
                  )}

                  {faceEmbedding && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                      <p className="text-emerald-800 font-bold text-sm">¡Rostro ya está registrado!</p>
                      <div className="mt-4 flex gap-2 justify-center">
                        <Button type="button" variant="outline" className="text-xs h-8 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors" onClick={handleDeleteFace}>
                          <Trash2 className="w-4 h-4 mr-1" /> Eliminar Rostro
                        </Button>
                        <Button type="button" variant="outline" className="text-xs h-8" onClick={() => { setFaceEmbedding(null); startCamera(); }}>
                          <Camera className="w-4 h-4 mr-1" /> Re-escanear
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </form>
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-between gap-3 bg-slate-50">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          
          <div className="flex gap-2">
            {activeTab !== 'personal' && (
              <Button type="button" variant="outline" onClick={() => setActiveTab(activeTab === 'bio' ? 'org' : 'personal')} disabled={loading}>
                ← Atrás
              </Button>
            )}
            
            {activeTab !== 'bio' ? (
              <Button type="button" variant="primary" onClick={() => setActiveTab(activeTab === 'personal' ? 'org' : 'bio')}>
                Siguiente →
              </Button>
            ) : (
              <Button form="empForm" type="submit" variant="primary" disabled={loading}>
                {loading ? <Spinner size="sm" /> : 'Finalizar y Guardar Expediente'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
