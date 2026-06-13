"use client";

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, CheckCircle2, AlertCircle, Loader2, LogIn, Coffee, Utensils, LogOut, ShieldAlert } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function BiometricKiosk() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Cargando modelos neuronales...');
  const [faceData, setFaceData] = useState<any[]>([]);
  const [matchStatus, setMatchStatus] = useState<'idle' | 'success' | 'error' | 'verifying'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const cooldownRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Estados UI
  const [pendingActionSelect, setPendingActionSelect] = useState<any>(null);
  const [pendingJustification, setPendingJustification] = useState<any>(null); // { type, data, options }
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [specialMode, setSpecialMode] = useState(false);
  const [specialDirection, setSpecialDirection] = useState('INGRESO_ESPECIAL');

  // Estados de Registro
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerStep, setRegisterStep] = useState<'pin' | 'select' | 'capture'>('pin');
  const [pinCode, setPinCode] = useState('');
  const [registerEmployees, setRegisterEmployees] = useState<any[]>([]);
  const [selectedRegisterEmp, setSelectedRegisterEmp] = useState<any>(null);
  const [registerStatusMsg, setRegisterStatusMsg] = useState('');

  // Refs for current state to use inside setInterval closure
  const stateRefs = useRef({
    isRegistering,
    registerStep,
    selectedRegisterEmp,
    faceData,
    pendingActionSelect,
    pendingJustification
  });

  useEffect(() => {
    stateRefs.current = {
      isRegistering,
      registerStep,
      selectedRegisterEmp,
      faceData,
      pendingActionSelect,
      pendingJustification
    };
  }, [isRegistering, registerStep, selectedRegisterEmp, faceData, pendingActionSelect, pendingJustification]);

  useEffect(() => {
    loadModels();
    
    // Auto-recarga diaria a la medianoche (00:05 AM) para liberar memoria y actualizar código.
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0);
    const msToMidnight = nextMidnight.getTime() - now.getTime();
    
    const reloadTimer = setTimeout(() => {
      window.location.reload();
    }, msToMidnight);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(reloadTimer);
    };
  }, []);

  const loadModels = async () => {
    try {
      setLoadingMsg('Cargando motor biométrico...');
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      setLoadingMsg('Conectando a base de datos...');
      await fetchEmployeeEmbeddings();
      setIsModelLoaded(true);
    } catch (err) {
      console.error(err);
      setLoadingMsg('Error cargando modelos. Revisa consola.');
    }
  };

  const fetchEmployeeEmbeddings = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from('employees').select('id, nombre_completo, face_embedding, status, shift_id, tipo_contrato, inicio_temporada, fin_temporada').not('face_embedding', 'is', null);
    if (data) setFaceData(data);
  };

  const startVideo = () => {
    setIsCameraActive(true);
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => console.error('Error accessing webcam', err));
  };

  const stopVideo = () => {
    if (intervalRef.current) {
       clearInterval(intervalRef.current);
       intervalRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isCameraActive || !isModelLoaded) return;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      const refs = stateRefs.current;
      if (cooldownRef.current || refs.pendingActionSelect || refs.pendingJustification) return;

      if (videoRef.current && videoRef.current.readyState === 4) {
        try {
          const detections = await faceapi.detectSingleFace(videoRef.current)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (refs.isRegistering && refs.registerStep === 'capture') {
             if (!detections) {
                setRegisterStatusMsg(`BUSCANDO ROSTRO... POR FAVOR MIRE A LA CÁMARA`);
             }
          }

          if (detections) {
            // Si estamos en modo de registrar un rostro nuevo
            if (refs.isRegistering && refs.registerStep === 'capture' && refs.selectedRegisterEmp) {
               cooldownRef.current = true;
               setRegisterStatusMsg('Rostro detectado, verificando duplicados...');
               
               let isDuplicate = false;
               let duplicateName = '';
               for (const emp of refs.faceData) {
                 if (emp.id === refs.selectedRegisterEmp.id) continue;
                 const empDescriptor = new Float32Array(emp.face_embedding);
                 const distance = faceapi.euclideanDistance(detections.descriptor, empDescriptor);
                 if (distance < 0.45) { // Threshold estricto
                   isDuplicate = true;
                   duplicateName = emp.nombre_completo;
                   break;
                 }
               }
               
               if (isDuplicate) {
                 setRegisterStatusMsg(`Error: Este rostro ya pertenece a ${duplicateName}.`);
                 setTimeout(() => { cooldownRef.current = false; setRegisterStatusMsg(''); }, 5000);
                 return;
               }

               setRegisterStatusMsg('Rostro verificado, guardando datos faciales...');
               
               try {
                  const supabase = getSupabaseBrowserClient();
                  if (supabase) {
                     const embeddingArray = Array.from(detections.descriptor);
                     
                     // Hacemos el update explícito con manejo de errores
                     const { error: updateError } = await supabase
                        .from('employees')
                        .update({ face_embedding: embeddingArray })
                        .eq('id', refs.selectedRegisterEmp.id);
                     
                     if (updateError) {
                        console.error("Supabase Error:", updateError);
                        setRegisterStatusMsg('Error en BD: ' + updateError.message);
                        setTimeout(() => { cooldownRef.current = false; setRegisterStatusMsg(''); }, 5000);
                        return;
                     }
                     
                     setRegisterStatusMsg('¡Datos faciales registrados correctamente!');
                     await fetchEmployeeEmbeddings(); // Recargar las caras
                     
                     setTimeout(() => {
                        setIsRegistering(false);
                        setRegisterStep('pin');
                        setPinCode('');
                        setSelectedRegisterEmp(null);
                        setRegisterStatusMsg('');
                        stopVideo();
                        cooldownRef.current = false;
                     }, 3000);
                  }
               } catch (err: any) {
                  console.error(err);
                  setRegisterStatusMsg('Error de conexión: ' + err.message);
                  setTimeout(() => { cooldownRef.current = false; setRegisterStatusMsg(''); }, 5000);
               }
               return; // Detenemos aquí
            }

            if (refs.isRegistering) return; // No hacer login si estamos registrando
            
            let bestMatch = null;
            let bestDistance = 0.6; 
            for (const emp of refs.faceData) {
              const empDescriptor = new Float32Array(emp.face_embedding);
              const distance = faceapi.euclideanDistance(detections.descriptor, empDescriptor);
              if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = emp;
              }
            }

            if (bestMatch) {
              prepareActionSelect(bestMatch);
            }
          }
        } catch (err) {
          console.error('Error during face detection interval', err);
        }
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isCameraActive, isModelLoaded]);

  const handleVideoPlay = () => {
    // Ya no lo usamos en onPlay, el useEffect se encarga.
  };

  const prepareActionSelect = async (employee: any) => {
    cooldownRef.current = true;
    setMatchStatus('verifying');
    setStatusMessage('Autenticando...');

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      if (employee.tipo_contrato === 'Temporada') {
        const today = new Date();
        const start = new Date(employee.inicio_temporada);
        const end = new Date(employee.fin_temporada);
        if (today < start || today > end) {
          showError(`Contrato inactivo para ${employee.nombre_completo}`);
          return;
        }
      }

      const { data: shift } = await supabase.from('company_shifts').select('*').eq('id', employee.shift_id).single();
      if (!shift) {
        showError(`Horario no asignado para ${employee.nombre_completo}`);
        return;
      }

      const now = new Date();
      const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const { data: logs } = await supabase.from('time_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('timestamp', localMidnight.toISOString())
        .order('timestamp', { ascending: false });

      setMatchStatus('idle');
      setStatusMessage('');
      
      // Si está en special mode, directamente le mostramos las justificaciones de "MARCAJE ESPECIAL"
      if (specialMode) {
        setPendingJustification({
          type: 'MARCAJE_ESPECIAL',
          data: { employee, shift, logs, eventToLog: 'MARCAJE_ESPECIAL' },
          options: [
            "Reingreso a Laborar", "Horas Extras", "Trabajo Extraordinario", 
            "Capacitación", "Reunión Fuera de Horario", "Inventario", 
            "Soporte de Emergencia", "Visita Técnica", "Comisión Externa", 
            "Corrección de Marcación", "Permiso Especial", "Otros"
          ]
        });
        setSpecialMode(false); // reset toggle
        return;
      }

      setPendingActionSelect({ employee, shift, logs });

    } catch (err) {
      console.error(err);
      showError('Error de conexión.');
    }
  };

  const handleActionSelect = (selectedAction: string) => {
    const { employee, shift, logs } = pendingActionSelect;
    const now = new Date();
    const currentDay = (now.getDay() || 7).toString();
    const daySchedule = shift.weekly_schedule ? shift.weekly_schedule[currentDay] : null;
    const esDiaExtra = !daySchedule;
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let minRetraso = 0, minExcesoAlm = 0, minSalidaAnt = 0, minExtra = 0;
    let shiftEntradaMins = 0, shiftSalidaMins = 0;

    if (daySchedule) {
      shiftEntradaMins = parseInt(daySchedule.entrada.split(':')[0]) * 60 + parseInt(daySchedule.entrada.split(':')[1]);
      shiftSalidaMins = parseInt(daySchedule.salida.split(':')[0]) * 60 + parseInt(daySchedule.salida.split(':')[1]);
    }

    const lastLog = logs && logs.length > 0 ? logs[0] : null;

    // 1. Control de Remarcajes
    if (lastLog && lastLog.evento_detectado === selectedAction) {
       showError('Ya existe una marcación registrada para este período.');
       setPendingActionSelect(null);
       return;
    }

    // 2. Cálculos de Tiempos
    const MAX_TOLERANCIA_INGRESO = 10;
    const MAX_EXCESO_BREAK = 10;

    if (selectedAction === 'INGRESO') {
      if (daySchedule && currentMins > shiftEntradaMins + MAX_TOLERANCIA_INGRESO) {
        minRetraso = currentMins - shiftEntradaMins;
      }
    } 
    else if (selectedAction === 'REGRESO_REFACCION') {
      const salidaRef = logs?.find((l: any) => l.evento_detectado === 'SALIDA_REFACCION');
      if (salidaRef) {
        const diffMins = Math.floor((now.getTime() - new Date(salidaRef.timestamp).getTime()) / 60000);
        if (diffMins > MAX_EXCESO_BREAK) minExcesoAlm = diffMins - MAX_EXCESO_BREAK; 
      }
    }
    else if (selectedAction === 'REGRESO_ALMUERZO') {
      const salidaAlm = logs?.find((l: any) => l.evento_detectado === 'SALIDA_ALMUERZO');
      if (salidaAlm) {
        const diffMins = Math.floor((now.getTime() - new Date(salidaAlm.timestamp).getTime()) / 60000);
        if (diffMins > MAX_EXCESO_BREAK) minExcesoAlm = diffMins - MAX_EXCESO_BREAK;
      }
    }
    else if (selectedAction === 'SALIDA_FINAL') {
      if (esDiaExtra) {
        // En día extra (ej. Sábado), se asume un horario base de 8 a 5 (17:00).
        // Las "horas extra" adicionales corren solo después de las 17:00.
        const baseSalidaMins = 17 * 60; // 17:00
        if (currentMins > baseSalidaMins) {
          minExtra = currentMins - baseSalidaMins;
        } else {
          minExtra = 0;
        }
      } else {
         const shiftSalidaParts = daySchedule.salida.split(':');
         const shiftSalidaMins = parseInt(shiftSalidaParts[0]) * 60 + parseInt(shiftSalidaParts[1]);
         if (currentMins < shiftSalidaMins) {
           minSalidaAnt = shiftSalidaMins - currentMins;
         } else {
           minExtra = currentMins - shiftSalidaMins;
         }
      }
    }

    const punchData = {
      employee,
      eventToLog: selectedAction,
      minRetraso,
      minExcesoAlm,
      minSalidaAnt,
      minExtra,
      esDiaExtra
    };

    // 3. Flujos de Justificación Obligatoria
    setPendingActionSelect(null);

    if (selectedAction === 'INGRESO' && minRetraso > 0) {
      setPendingJustification({
        type: 'LLEGADA_TARDE',
        data: punchData,
        options: ["Percance en el trayecto al trabajo", "Tráfico", "Permiso autorizado", "Consulta médica", "Problema de transporte", "Otros"]
      });
      return;
    }

    if ((selectedAction === 'REGRESO_REFACCION' || selectedAction === 'REGRESO_ALMUERZO') && minExcesoAlm > 0) {
      setPendingJustification({
        type: 'EXCESO_RECESO',
        data: punchData,
        options: ["Atención de cliente", "Reunión laboral", "Permiso autorizado", "Problema operativo", "Otros"]
      });
      return;
    }

    if (selectedAction === 'SALIDA_FINAL' && minSalidaAnt > 0) {
      setPendingJustification({
        type: 'SALIDA_ANTICIPADA',
        data: punchData,
        options: ["Indispuesto por salud", "Motivos familiares", "Emergencia en casa", "Permiso autorizado", "Cita médica", "Comisión laboral", "Otros"]
      });
      return;
    }

    // Horas Extras (Silencioso para el empleado según nueva instrucción)
    // El sistema guarda minExtra matemáticamente sin preguntar.
    
    submitPunchFinal({ ...punchData, razon: null });
  };

  const handleSpecialPunchClick = () => {
    const { employee, shift, logs } = pendingActionSelect;
    setPendingActionSelect(null);
    setPendingJustification({
      type: 'MARCAJE_ESPECIAL',
      data: { employee, shift, logs, minRetraso: 0, minExcesoAlm: 0, minSalidaAnt: 0, minExtra: 0, esDiaExtra: false },
      options: [
        "Reingreso a Laborar", "Horas Extras", "Trabajo Extraordinario", 
        "Capacitación", "Reunión Fuera de Horario", "Inventario", 
        "Soporte de Emergencia", "Visita Técnica", "Comisión Externa", 
        "Corrección de Marcación", "Permiso Especial", "Otros"
      ]
    });
  };

  const submitJustification = () => {
    if (!pendingJustification) return;
    if (!selectedReason || (selectedReason === 'Otros' && !otherReason)) {
      alert("Por favor indique el motivo para poder registrar su marcación.");
      return;
    }
    const finalReason = selectedReason === 'Otros' ? otherReason : selectedReason;
    const finalEvent = pendingJustification.type === 'MARCAJE_ESPECIAL' ? specialDirection : pendingJustification.data.eventToLog;
    submitPunchFinal({
      ...pendingJustification.data,
      eventToLog: finalEvent,
      razon: finalReason
    });
  };

  const submitPunchFinal = async (punchData: any) => {
    try {
      setPendingActionSelect(null);
      setPendingJustification(null);
      setMatchStatus('verifying');
      
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      await supabase.from('time_logs').insert({
        employee_id: punchData.employee.id,
        evento_detectado: punchData.eventToLog,
        minutos_retraso_entrada: punchData.minRetraso,
        minutos_exceso_almuerzo: punchData.minExcesoAlm,
        minutos_salida_anticipada: punchData.minSalidaAnt,
        minutos_extra: punchData.minExtra,
        es_dia_extra: punchData.esDiaExtra,
        justificacion: punchData.razon
      });
      
      setMatchStatus('success');
      
      const day = new Date().getDay();
      const hour = new Date().getHours();
      let greeting = '';

      if (punchData.eventToLog === 'INGRESO' || punchData.eventToLog === 'INGRESO_ESPECIAL') {
        if (hour < 12) {
          greeting = day === 1 ? 'Buenos días y feliz inicio de semana' : 'Buenos días';
        } else {
          greeting = 'Buenas tardes';
        }
      }
      else if (punchData.eventToLog === 'SALIDA_REFACCION') {
        greeting = 'Buen provecho y que tenga buen día';
      }
      else if (punchData.eventToLog === 'SALIDA_ALMUERZO') {
        greeting = 'Buen provecho';
      }
      else if (punchData.eventToLog === 'SALIDA_FINAL') {
        if (hour < 12) {
          greeting = 'Que tenga un buen día';
        } else if (hour < 18) {
          if (day === 5 || day === 6) greeting = 'Que tenga un excelente fin de semana';
          else greeting = 'Feliz tarde';
        } else {
          if (day === 5 || day === 6) greeting = 'Feliz noche y excelente fin de semana';
          else greeting = 'Feliz noche';
        }
      }
      else {
        greeting = 'Marcaje registrado';
      }

      // Extraer Primer Nombre y Primer Apellido
      let shortName = punchData.employee.nombre_completo;
      let firstName = '';
      if (shortName.includes(',')) {
        const apellidos = shortName.split(',')[0].trim().split(' ');
        const nombres = shortName.split(',')[1].trim().split(' ');
        firstName = nombres[0];
        shortName = `${nombres[0]} ${apellidos[0]}`;
      } else {
        const parts = shortName.trim().split(' ');
        if (parts.length >= 3) {
           shortName = `${parts[0]} ${parts[2]}`; // Asumiendo Nombre1 Nombre2 Apellido1
        } else {
           shortName = `${parts[0]} ${parts.length > 1 ? parts[1] : ''}`.trim();
        }
      }

      const spokenMessage = `${greeting}, ${shortName}`;
      const eventName = punchData.eventToLog.replace(/_/g, ' ');
      setStatusMessage(`${spokenMessage}! ${eventName} registrado.`);
      
      // Text-to-Speech
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(spokenMessage);
        utterance.lang = 'es-MX'; // Español latino
        utterance.rate = 0.95; // Ligeramente más lento para sonar más humano
        utterance.pitch = 1.05; // Tono más amigable
        
        // Buscar voces naturales
        const voices = window.speechSynthesis.getVoices();
        const esVoices = voices.filter(v => v.lang.startsWith('es'));
        const bestVoice = esVoices.find(v => 
          v.name.toLowerCase().includes('natural') || 
          v.name.toLowerCase().includes('google') || 
          v.name.toLowerCase().includes('sabina') ||
          v.name.toLowerCase().includes('premium')
        ) || esVoices[0];
        
        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        window.speechSynthesis.speak(utterance);
      }

      resetCooldown(4000);
    } catch (err) {
      console.error(err);
      showError('Error guardando marcaje.');
    }
  };

  const showError = (msg: string) => {
    setMatchStatus('error');
    setStatusMessage(msg);
    resetCooldown(4000);
  };

  const resetCooldown = (ms: number = 3000) => {
    setTimeout(() => {
      setMatchStatus('idle');
      setStatusMessage('');
      setPendingActionSelect(null);
      setPendingJustification(null);
      setSelectedReason('');
      setOtherReason('');
      setSpecialMode(false);
      setSpecialDirection('INGRESO');
      cooldownRef.current = false;
      stopVideo();
    }, ms);
  };

  const cancelFlow = () => resetCooldown(100);

  if (!isModelLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-[var(--muted)] animate-pulse">
        <Loader2 className="w-12 h-12 mb-4 animate-spin text-[var(--accent)]" />
        <p className="font-bold uppercase tracking-widest text-xs">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] bg-black shadow-2xl flex flex-col items-center">
      
      {/* Botón Marcaje Especial */}
      <button 
        onClick={() => {
          if (!isCameraActive) startVideo();
          setSpecialMode(true);
        }}
        className={`absolute top-4 right-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${specialMode ? 'bg-[#2ec4f1] text-white shadow-[0_0_15px_rgba(46,196,241,0.5)]' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
      >
        <ShieldAlert className="w-3 h-3" />
        {specialMode ? 'ESCANEA TU ROSTRO' : 'Marcaje Especial'}
      </button>

      {/* Botón Registrar Rostro */}
      {!isCameraActive && !isRegistering && (
        <button 
          onClick={() => {
            setIsRegistering(true);
            setRegisterStep('pin');
            setPinCode('');
          }}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all bg-white/10 text-white/50 hover:bg-white/20"
        >
          <Camera className="w-3 h-3" />
          Registrar Rostro
        </button>
      )}

      {isCameraActive && !isRegistering && (
        <button 
          onClick={() => {
            stopVideo();
            cancelFlow();
          }}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all bg-rose-500/20 text-rose-400 hover:bg-rose-500/40"
        >
          <AlertCircle className="w-3 h-3" />
          Cerrar Cámara
        </button>
      )}

      <div className="w-full h-[600px] bg-slate-900 relative flex items-center justify-center">
        
        {/* FLUJO DE REGISTRO FACIAL */}
        {isRegistering ? (
           <div className="absolute inset-0 z-40 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
             
             {registerStep === 'pin' && (
               <div className="w-full max-w-sm flex flex-col items-center text-center">
                 <ShieldAlert className="w-12 h-12 text-[#2ec4f1] mb-4" />
                 <h2 className="text-xl font-black text-white mb-2 uppercase tracking-widest">Código de Autorización</h2>
                 <p className="text-sm text-slate-400 mb-6">Ingrese el PIN para acceder al registro facial</p>
                 <input 
                   type="password" 
                   value={pinCode}
                   onChange={e => setPinCode(e.target.value)}
                   className="w-full h-14 bg-slate-800 text-center text-white text-2xl tracking-[1em] font-black rounded-2xl border-2 border-slate-700 outline-none focus:border-[#2ec4f1] transition-colors mb-4"
                   placeholder="****"
                   maxLength={4}
                 />
                 <button 
                   onClick={async () => {
                     if (pinCode === '1234') {
                       const supabase = getSupabaseBrowserClient();
                       if (supabase) {
                         const { data } = await supabase.from('employees').select('id, nombre_completo, face_embedding').order('nombre_completo');
                         if (data) setRegisterEmployees(data);
                       }
                       setRegisterStep('select');
                     } else {
                       alert('PIN Incorrecto');
                       setPinCode('');
                     }
                   }}
                   className="w-full py-4 bg-[#2ec4f1] text-[#181c3a] font-black rounded-xl uppercase tracking-widest hover:bg-[#2ec4f1]/80 transition-colors"
                 >
                   Verificar PIN
                 </button>
                 <button 
                   onClick={() => setIsRegistering(false)} 
                   className="mt-6 text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest underline"
                 >
                   Cancelar
                 </button>
               </div>
             )}

             {registerStep === 'select' && (
               <div className="w-full max-w-xl flex flex-col items-center">
                 <h2 className="text-xl font-black text-white mb-2 uppercase tracking-widest">Seleccionar Empleado</h2>
                 <p className="text-sm text-slate-400 mb-6">Seleccione el empleado a quien se le registrará el rostro</p>
                 
                 <div className="w-full max-h-96 overflow-y-auto space-y-2 custom-scrollbar bg-slate-800 p-4 rounded-3xl border border-slate-700">
                   {registerEmployees.map(emp => (
                     <button
                       key={emp.id}
                       onClick={() => {
                         setSelectedRegisterEmp(emp);
                         setRegisterStep('capture');
                         startVideo();
                       }}
                       className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/10 group text-left"
                     >
                       <span className="text-white font-bold group-hover:text-[#2ec4f1] transition-colors">{emp.nombre_completo}</span>
                       {emp.face_embedding ? (
                         <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full">Ya Registrado</span>
                       ) : (
                         <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/20 px-2 py-1 rounded-full">Sin Rostro</span>
                       )}
                     </button>
                   ))}
                 </div>
                 <button 
                   onClick={() => setIsRegistering(false)} 
                   className="mt-6 text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest underline"
                 >
                   Cancelar
                 </button>
               </div>
             )}

             {registerStep === 'capture' && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-50">
                 <h2 className="absolute top-8 text-2xl font-black text-white uppercase tracking-widest z-50 drop-shadow-lg">
                   {registerStatusMsg || `Registrando rostro para: ${selectedRegisterEmp?.nombre_completo}`}
                 </h2>
                 <video 
                   ref={videoRef}
                   autoPlay 
                   muted 
                   onPlay={handleVideoPlay}
                   className="w-full h-full object-cover opacity-80"
                 />
                 {/* Marco guía */}
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-64 border-4 border-[#2ec4f1] rounded-full border-dashed animate-[spin_10s_linear_infinite]" />
                 </div>
                 
                 <button 
                   onClick={() => {
                     stopVideo();
                     setIsRegistering(false);
                     setRegisterStep('pin');
                   }}
                   className="absolute bottom-10 px-8 py-3 bg-rose-500/20 text-rose-400 font-bold rounded-full border border-rose-500/30 hover:bg-rose-500/40 transition-colors z-50"
                 >
                   Cancelar Escaneo
                 </button>
               </div>
             )}

           </div>
        ) : !isCameraActive ? (
           <div className="flex flex-col items-center justify-center space-y-6 p-8 pb-28 text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="w-full max-w-md bg-slate-800/80 p-8 rounded-3xl border border-slate-700/50 backdrop-blur-md shadow-2xl flex flex-col items-center">
                 {/* Logo SVG */}
                 <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" className="w-56 h-auto mb-8 drop-shadow-2xl">
                  <defs>
                    <mask id="c-cutout">
                      {/* Fondo blanco: lo que sea blanco en la máscara será visible */}
                      <rect width="565" height="280" fill="white" />
                      {/* Formas negras: lo que sea negro será recortado y transparente */}
                      <circle cx="425" cy="140" r="85" fill="black" />
                      <rect x="500" y="100" width="80" height="60" fill="black" />
                    </mask>
                  </defs>

                  {/* Letras con máscara y color integrado al diseño (blanco y celeste) */}
                  <g>
                    {/* Letra T (Blanca) */}
                    <g fill="#ffffff">
                      <rect x="8" y="9" width="232" height="60"/>
                      <rect x="92" y="9" width="65" height="271"/>
                    </g>
                   
                    {/* Letra C (Blanca) */}
                    <g fill="#ffffff">
                      {/* El gran círculo principal recortado por la máscara */}
                      <circle cx="425" cy="140" r="140" mask="url(#c-cutout)"/>
                      {/* El detalle circular central */}
                      <circle cx="425" cy="140" r="35" fill="#ffffff"/>
                    </g>
                  </g>
                 </svg>
                 
                 <div className="text-center mb-4">
                   <p className="text-white font-black text-2xl tracking-wide uppercase drop-shadow-md">Bienvenido a</p>
                   <p className="text-white font-black text-xl tracking-wide uppercase drop-shadow-md">Tech Corps Guatemala</p>
                 </div>
                 
                 <p className="text-slate-300 text-base font-medium leading-relaxed text-center">
                   Presione <span className="font-bold text-white">MARCAR</span> para habilitar el reconocimiento facial y registrar su asistencia.
                 </p>
              </div>
              <button 
                onClick={startVideo}
                className="px-16 py-5 bg-[#2ec4f1] hover:bg-[#2ec4f1]/80 text-slate-950 font-black text-3xl tracking-widest rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(46,196,241,0.5)]"
              >
                MARCAR
              </button>
           </div>
        ) : (
          <>
            <video 
              ref={videoRef}
              autoPlay 
              muted 
              onPlay={handleVideoPlay}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#2ec4f1]/10 to-transparent w-full h-1/4 animate-scan-line pointer-events-none" />
          </>
        )}

        {/* Modal de Selección de Acción Principal */}
        {pendingActionSelect && (() => {
           const logs = pendingActionSelect.logs || [];
           const lastLog = logs.length > 0 ? logs[0] : null;
           const lastEvent = lastLog?.evento_detectado;
           const currentMins = new Date().getHours() * 60 + new Date().getMinutes();
           const normalizedEvent = lastEvent?.trim().toUpperCase().replace(/ /g, '_');

           const yaDesayuno = logs.some((l: any) => l.evento_detectado?.trim().toUpperCase().replace(/ /g, '_') === 'SALIDA_REFACCION');
           const yaAlmorzo = logs.some((l: any) => l.evento_detectado?.trim().toUpperCase().replace(/ /g, '_') === 'SALIDA_ALMUERZO');
           
           const showIngreso = !normalizedEvent || normalizedEvent === 'SALIDA_FINAL';
           const showRegresoDesayuno = normalizedEvent === 'SALIDA_REFACCION';
           const showRegresoAlmuerzo = normalizedEvent === 'SALIDA_ALMUERZO';
           const isInside = normalizedEvent === 'INGRESO' || normalizedEvent === 'REGRESO_REFACCION' || normalizedEvent === 'REGRESO_ALMUERZO' || normalizedEvent === 'INGRESO_ESPECIAL';
           const isFinished = normalizedEvent === 'SALIDA_FINAL';

           const showSalidaDesayuno = isInside && !yaDesayuno && currentMins >= (8 * 60) && currentMins <= (11 * 60 + 30);
           const showSalidaAlmuerzo = isInside && !yaAlmorzo && currentMins >= (11 * 60 + 30) && currentMins <= (17 * 60 + 30); // Extended to 17:30 to be safe

           return (
            <div className="absolute inset-0 z-40 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95">
              <h2 className="text-xl font-black text-white mb-1">{pendingActionSelect.employee.nombre_completo}</h2>
              <p className="text-xs text-[#2ec4f1] font-bold mb-6 uppercase tracking-widest">Seleccione Acción Válida</p>
              
              
              <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
                {showIngreso && (
                  <button onClick={() => handleActionSelect('INGRESO')} className="flex flex-col items-center justify-center gap-2 p-4 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/30 rounded-2xl text-white transition-colors col-span-2">
                    <LogIn className="w-6 h-6 text-emerald-400" />
                    <span className="text-sm font-bold">Ingresar a Laborar</span>
                  </button>
                )}
                
                {showSalidaDesayuno && (
                  <button onClick={() => handleActionSelect('SALIDA_REFACCION')} className="flex flex-col items-center justify-center gap-2 p-3 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 rounded-2xl text-white transition-colors">
                    <Coffee className="w-6 h-6 text-amber-400" />
                    <span className="text-xs font-bold">Ir a Desayuno</span>
                  </button>
                )}
                
                {showRegresoDesayuno && (
                  <button onClick={() => handleActionSelect('REGRESO_REFACCION')} className="flex flex-col items-center justify-center gap-2 p-4 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 rounded-2xl text-white transition-colors col-span-2">
                    <Coffee className="w-6 h-6 text-amber-400" />
                    <span className="text-sm font-bold">Volver de Desayuno</span>
                  </button>
                )}

                {showSalidaAlmuerzo && (
                  <button onClick={() => handleActionSelect('SALIDA_ALMUERZO')} className="flex flex-col items-center justify-center gap-2 p-3 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 rounded-2xl text-white transition-colors">
                    <Utensils className="w-6 h-6 text-blue-400" />
                    <span className="text-xs font-bold">Ir a Almuerzo</span>
                  </button>
                )}
                
                {showRegresoAlmuerzo && (
                  <button onClick={() => handleActionSelect('REGRESO_ALMUERZO')} className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 rounded-2xl text-white transition-colors col-span-2">
                    <Utensils className="w-6 h-6 text-blue-400" />
                    <span className="text-sm font-bold">Volver de Almuerzo</span>
                  </button>
                )}

                {(isInside || showRegresoDesayuno || showRegresoAlmuerzo) && (
                  <button onClick={() => handleActionSelect('SALIDA_FINAL')} className={`flex flex-col items-center justify-center gap-2 p-3 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/30 rounded-2xl text-white transition-colors ${!showSalidaDesayuno && !showSalidaAlmuerzo ? 'col-span-2 p-4' : 'col-span-2 mt-2'}`}>
                    <LogOut className="w-6 h-6 text-rose-400" />
                    <span className="text-sm font-bold">Finalizar Turno Laboral</span>
                  </button>
                )}

                <button onClick={handleSpecialPunchClick} className="flex items-center justify-center gap-2 p-3 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 rounded-xl text-white transition-colors col-span-2 mt-2">
                  <ShieldAlert className="w-5 h-5 text-purple-400" />
                  <span className="text-xs font-bold">Registrar Marcaje Especial</span>
                </button>
              </div>

              <button onClick={cancelFlow} className="mt-6 text-slate-400 hover:text-white text-xs font-bold underline transition-colors">
                Cancelar Operación
              </button>
            </div>
          );
        })()}

        {/* Modal Dinámico de Justificaciones (Tardanzas, Anticipadas, Especiales) */}
        {pendingJustification && (
          <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95">
            <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
            <h2 className="text-xl font-black text-white mb-1">
              {pendingJustification.type === 'MARCAJE_ESPECIAL' ? 'Marcaje Especial' : 'Justificación Requerida'}
            </h2>
            <p className="text-[11px] font-medium text-slate-300 mb-4 max-w-xs">
              {pendingJustification.type === 'MARCAJE_ESPECIAL' 
                ? 'Seleccione el tipo de marcaje extraordinario a registrar.'
                : 'Se ha detectado una excepción en sus tiempos laborales. Por favor, indique el motivo.'}
            </p>

            <div className="w-full max-w-sm space-y-3 mb-6">
              {pendingJustification.type === 'MARCAJE_ESPECIAL' && (
                <select 
                  value={specialDirection} 
                  onChange={e => setSpecialDirection(e.target.value)}
                  className="w-full h-12 bg-slate-800 border border-purple-500/50 rounded-xl px-4 text-white font-bold text-sm outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="INGRESO">Registrar como: Entrada (Ingreso)</option>
                  <option value="SALIDA_FINAL">Registrar como: Retiro (Salida)</option>
                </select>
              )}

              <select 
                value={selectedReason} 
                onChange={e => setSelectedReason(e.target.value)}
                className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-white font-bold text-sm outline-none focus:border-amber-500 transition-colors"
              >
                <option value="" disabled>Seleccione una opción...</option>
                {pendingJustification.options.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              {selectedReason === 'Otros' && (
                <input 
                  type="text" 
                  value={otherReason}
                  onChange={e => setOtherReason(e.target.value)}
                  placeholder="Especifique el motivo..."
                  className="w-full h-12 bg-slate-800 border border-slate-700 rounded-xl px-4 text-white font-medium text-sm outline-none focus:border-amber-500 transition-colors"
                  maxLength={50}
                />
              )}
            </div>

            <div className="flex gap-3 w-full max-w-sm">
              <button 
                onClick={cancelFlow}
                className="flex-1 h-12 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={submitJustification}
                className="flex-1 h-12 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl transition-colors"
              >
                Registrar
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Banner de Estado */}
      <div className={`absolute bottom-0 left-0 w-full p-6 backdrop-blur-xl border-t transition-all duration-300 flex items-center gap-4
        ${matchStatus === 'idle' ? 'bg-black/60 border-white/10' : ''}
        ${matchStatus === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : ''}
        ${matchStatus === 'error' ? 'bg-rose-500/90 border-rose-400 text-white' : ''}
        ${matchStatus === 'verifying' ? 'bg-[#2ec4f1]/90 border-[#2ec4f1] text-white' : ''}
      `}>
        {matchStatus === 'idle' && <Camera className="w-8 h-8 text-white/50" />}
        {matchStatus === 'verifying' && <Loader2 className="w-8 h-8 animate-spin" />}
        {matchStatus === 'success' && <CheckCircle2 className="w-8 h-8" />}
        {matchStatus === 'error' && <AlertCircle className="w-8 h-8" />}
        
        <div className="flex-1">
          <p className="text-xs font-black uppercase tracking-widest opacity-70">
            {matchStatus === 'idle' ? (isCameraActive ? 'Kiosko Biométrico Activo' : 'Kiosko en Espera') : matchStatus}
          </p>
          <h3 className="text-lg font-bold leading-tight">
            {matchStatus === 'idle' ? (isCameraActive ? 'Mira a la cámara para marcar' : 'Presione MARCAR para iniciar') : statusMessage}
          </h3>
        </div>
      </div>
    </div>
  );
}
