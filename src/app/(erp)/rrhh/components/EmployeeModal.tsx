import { useState, useRef } from 'react';
import { Button, Spinner } from '@/components/ui';
import { X, Camera, UploadCloud } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function EmployeeModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  shifts 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess: () => void;
  shifts: any[];
}) {
  const [formData, setFormData] = useState({
    nombre_completo: '',
    departamento: '',
    tipo_contrato: 'Fijo',
    fecha_inicio_labores: new Date().toISOString().split('T')[0],
    sueldo_mensual_base: '',
    shift_id: '',
    inicio_temporada: '',
    fin_temporada: ''
  });

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  
  // Biometrics
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceEmbedding, setFaceEmbedding] = useState<number[] | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const startCamera = async () => {
    setIsCameraActive(true);
    setBiometricStatus('scanning');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait a bit to ensure video plays
        setTimeout(async () => {
          if (!videoRef.current) return;
          
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
          const detections = await faceapi.detectSingleFace(videoRef.current)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (detections) {
            setFaceEmbedding(Array.from(detections.descriptor));
            setBiometricStatus('success');
            stopCamera(stream);
          } else {
            setBiometricStatus('error');
            setTimeout(() => { setBiometricStatus('idle'); stopCamera(stream); setIsCameraActive(false); }, 3000);
          }
        }, 2000);
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
        if (error) {
           console.error("Storage error:", error);
           // Might not exist yet, we can ignore or alert
           // For now, let's just proceed without it if it fails
        } else {
           const { data: publicUrlData } = supabase.storage.from('contracts').getPublicUrl(`public/${fileName}`);
           contrato_url = publicUrlData.publicUrl;
        }
      }

      // 2. Insert employee (Trigger will generate codigo_empleado)
      const { error } = await supabase.from('employees').insert({
        nombre_completo: formData.nombre_completo,
        departamento: formData.departamento,
        tipo_contrato: formData.tipo_contrato,
        fecha_inicio_labores: formData.fecha_inicio_labores,
        sueldo_mensual_base: parseFloat(formData.sueldo_mensual_base),
        shift_id: formData.shift_id || null,
        inicio_temporada: formData.tipo_contrato === 'Temporada' ? formData.inicio_temporada : null,
        fin_temporada: formData.tipo_contrato === 'Temporada' ? formData.fin_temporada : null,
        contrato_url,
        face_embedding: faceEmbedding
      });

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
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Nuevo Empleado</h2>
            <p className="text-xs font-bold text-slate-500 mt-1">
              Paso {step} de 2: {step === 1 ? 'Datos Generales' : 'Enrolamiento Biométrico'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors bg-white shadow-sm">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="empForm" onSubmit={handleSubmit} className="space-y-6">
            
            {step === 1 && (
              <div className="space-y-6 animate-in slide-in-from-left-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Nombre Completo</label>
                    <input 
                      required 
                      type="text" 
                      value={formData.nombre_completo}
                      onChange={e => setFormData({...formData, nombre_completo: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#2ec4f1] outline-none font-medium" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Departamento</label>
                    <input 
                      required 
                      type="text" 
                      value={formData.departamento}
                      onChange={e => setFormData({...formData, departamento: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#2ec4f1] outline-none font-medium" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Tipo de Contrato</label>
                    <select 
                      value={formData.tipo_contrato}
                      onChange={e => setFormData({...formData, tipo_contrato: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#2ec4f1] outline-none font-medium"
                    >
                      <option value="Fijo">Fijo</option>
                      <option value="Temporada">Temporada</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Horario Asignado</label>
                    <select 
                      required
                      value={formData.shift_id}
                      onChange={e => setFormData({...formData, shift_id: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#2ec4f1] outline-none font-medium"
                    >
                      <option value="">Seleccione un horario...</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {formData.tipo_contrato === 'Temporada' && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-amber-700">Inicio Temporada</label>
                      <input 
                        required 
                        type="date" 
                        value={formData.inicio_temporada}
                        onChange={e => setFormData({...formData, inicio_temporada: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl border border-amber-200 bg-white focus:border-amber-400 outline-none font-medium text-amber-900" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-amber-700">Fin Temporada</label>
                      <input 
                        required 
                        type="date" 
                        value={formData.fin_temporada}
                        onChange={e => setFormData({...formData, fin_temporada: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl border border-amber-200 bg-white focus:border-amber-400 outline-none font-medium text-amber-900" 
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Fecha de Ingreso</label>
                    <input 
                      required 
                      type="date" 
                      value={formData.fecha_inicio_labores}
                      onChange={e => setFormData({...formData, fecha_inicio_labores: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#2ec4f1] outline-none font-medium" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Sueldo Base (Mensual)</label>
                    <input 
                      required 
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.sueldo_mensual_base}
                      onChange={e => setFormData({...formData, sueldo_mensual_base: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#2ec4f1] outline-none font-medium" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Contrato PDF (Opcional)</label>
                  <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group">
                    <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-[#2ec4f1] mb-2 transition-colors" />
                    <span className="text-sm font-medium text-slate-600">
                      {contractFile ? contractFile.name : 'Haz clic para adjuntar archivo'}
                    </span>
                    <input 
                      type="file" 
                      accept=".pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => setContractFile(e.target.files ? e.target.files[0] : null)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-in slide-in-from-right-4">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-black text-slate-800">Captura Facial</h3>
                  <p className="text-sm text-slate-500 mt-1">Colócate frente a la cámara con buena iluminación para extraer tus vectores biométricos.</p>
                </div>
                
                {/* Enrolamiento Biométrico - Ampliado */}
                <div className="p-6 border border-slate-200 rounded-3xl bg-slate-50 space-y-6 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800">Estado del Escáner</h4>
                    </div>
                    {faceEmbedding ? (
                      <span className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Completado
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
                      
                      {/* Marco de enfoque animado */}
                      <div className="absolute inset-0 border-4 border-[#2ec4f1]/50 m-8 rounded-2xl pointer-events-none" />
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                      
                      {biometricStatus === 'scanning' && (
                        <div className="absolute bottom-6 flex flex-col items-center animate-pulse">
                          <span className="text-white text-sm font-black tracking-widest drop-shadow-md">ANALIZANDO ROSTRO...</span>
                          <span className="text-[#2ec4f1] text-xs font-bold">Por favor, mantén la mirada fija</span>
                        </div>
                      )}
                      
                      {biometricStatus === 'error' && (
                        <div className="absolute bottom-6 bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg animate-shake">
                          No se detectó un rostro claro. Intenta de nuevo.
                        </div>
                      )}
                    </div>
                  )}

                  {faceEmbedding && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                      <p className="text-emerald-800 font-bold text-sm">¡Vectores extraídos correctamente!</p>
                      <p className="text-emerald-600 text-xs mt-1">El empleado está listo para usar el Kiosko de Marcaje Cero Botones.</p>
                      <Button type="button" variant="outline" className="mt-4 text-xs h-8" onClick={() => setFaceEmbedding(null)}>
                        Volver a escanear
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

          </form>
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-between gap-3 bg-slate-50">
          {step === 1 ? (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
              <Button 
                type="button" 
                variant="primary" 
                onClick={() => {
                  // Validación básica antes de avanzar
                  if (!formData.nombre_completo || !formData.departamento || !formData.sueldo_mensual_base || !formData.shift_id) {
                    alert("Por favor complete todos los campos obligatorios antes de continuar.");
                    return;
                  }
                  setStep(2);
                }}
              >
                Siguiente Paso →
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={loading || isCameraActive}>← Atrás</Button>
              <Button form="empForm" type="submit" variant="primary" disabled={loading || !faceEmbedding}>
                {loading ? <Spinner size="sm" /> : 'Finalizar y Guardar'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
