"use client";

import { useEffect, useRef, useState, useMemo } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, CheckCircle2, AlertCircle, Loader2, LogIn, Coffee, Utensils, LogOut, ShieldAlert, Clock, User, Info } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { notify } from '@/components/ui';
import { useAttendanceState, AllowedAction } from '@/hooks/useAttendanceState';

const getShortName = (fullName: string) => {
  if (!fullName) return '';
  const cleanName = fullName.trim();
  
  if (cleanName.includes(',')) {
    const [surnames, names] = cleanName.split(',').map(s => s.trim());
    const firstName = names ? names.split(/\s+/)[0] : '';
    const firstSurname = surnames ? surnames.split(/\s+/)[0] : '';
    return `${firstName} ${firstSurname}`.trim();
  } else {
    const parts = cleanName.split(/\s+/);
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
    if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
    return `${parts[0]} ${parts[2]}`;
  }
};

export function BiometricKiosk() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Cargando modelos neuronales...');
  const [faceData, setFaceData] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any>(null);
  
  const [matchStatus, setMatchStatus] = useState<'idle' | 'success' | 'error' | 'verifying'>('idle');
  const [faceStatus, setFaceStatus] = useState<'searching' | 'adjusting' | 'ready' | 'capturing' | 'unknown'>('searching');
  const [statusMessage, setStatusMessage] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const cooldownRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [pendingActionSelect, setPendingActionSelect] = useState<any>(null);
  const [pendingJustification, setPendingJustification] = useState<any>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [specialMode, setSpecialMode] = useState(false);
  const [specialDirection, setSpecialDirection] = useState('INGRESO');

  // New Biometric 2-Step Validation State
  const [employeeInput, setEmployeeInput] = useState('');
  const [employeeToVerify, setEmployeeToVerify] = useState<any>(null);
  const [consecutiveMatches, setConsecutiveMatches] = useState(0);
  const [livenessBuffer, setLivenessBuffer] = useState<any[]>([]);

  const [isRegistering, setIsRegistering] = useState(false);
  const [registerStep, setRegisterStep] = useState<'pin' | 'select' | 'capture'>('pin');
  const [pinCode, setPinCode] = useState('');
  const [registerEmployees, setRegisterEmployees] = useState<any[]>([]);
  const [selectedRegisterEmp, setSelectedRegisterEmp] = useState<any>(null);
  const [registerStatusMsg, setRegisterStatusMsg] = useState('');

  const { currentState, allowedActions, calculatePunches } = useAttendanceState({
    logs: pendingActionSelect?.logs || [],
    shift: pendingActionSelect?.shift || null,
    policies: policies
  });

  const stateRefs = useRef({
    isRegistering,
    registerStep,
    selectedRegisterEmp,
    faceData,
    pendingActionSelect,
    pendingJustification,
    employeeToVerify,
    consecutiveMatches,
    livenessBuffer
  });

  useEffect(() => {
    stateRefs.current = {
      isRegistering,
      registerStep,
      selectedRegisterEmp,
      faceData,
      pendingActionSelect,
      pendingJustification,
      employeeToVerify,
      consecutiveMatches,
      livenessBuffer
    };
  }, [isRegistering, registerStep, selectedRegisterEmp, faceData, pendingActionSelect, pendingJustification, employeeToVerify, consecutiveMatches, livenessBuffer]);

  useEffect(() => {
    loadModels();
    fetchPolicies();
    
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0);
    const reloadTimer = setTimeout(() => { window.location.reload(); }, nextMidnight.getTime() - now.getTime());

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(reloadTimer);
    };
  }, []);

  const fetchPolicies = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from('hr_policies_versions').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1).single();
    if (data && data.settings) setPolicies(data.settings);
  };

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
      setLoadingMsg('Error cargando modelos.');
    }
  };

  const fetchEmployeeEmbeddings = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from('employees').select('*').not('face_embedding', 'is', null);
    if (data) setFaceData(data);
  };

  const fetchEmployeesForRegistration = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from('employees').select('*').order('nombre_completo');
    if (data) setRegisterEmployees(data);
  };

  const handleVerifyCode = async () => {
    if (!employeeInput) return;
    setMatchStatus('verifying');
    setStatusMessage('Buscando empleado...');
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // Si el usuario ingresa "21", buscamos "21" pero también "EMP-0021"
    const parsedNumber = parseInt(employeeInput, 10);
    const formattedCode = employeeInput.startsWith('EMP') 
      ? employeeInput 
      : (!isNaN(parsedNumber) ? `EMP-${parsedNumber.toString().padStart(4, '0')}` : employeeInput);

    const lookupCodes = Array.from(new Set([employeeInput, formattedCode].filter(Boolean)));
    const { data: emp, error } = await supabase
      .from('employees')
      .select('*')
      .in('codigo_empleado', lookupCodes)
      .single();

    if (error) {
      console.error("Error fetching employee:", error);
    }

    if (error || !emp) {
      showError('Empleado no encontrado');
      return;
    }

    if (!emp.face_embedding) {
      showError('Empleado no tiene rostro registrado');
      return;
    }

    setEmployeeToVerify(emp);
    setMatchStatus('idle');
    setStatusMessage('');
    startVideo();
  };

  const startVideo = () => {
    setIsCameraActive(true);
    setConsecutiveMatches(0);
    setLivenessBuffer([]);
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch((err) => console.error('Error webcam', err));
  };

  const stopVideo = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
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
          const detections = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();

          if (!detections) {
            setFaceStatus('searching');
          }

          if (detections) {
            if (detections.detection.score < 0.85) {
              setFaceStatus('adjusting');
            } else {
              setFaceStatus('ready');
            }
            if (refs.isRegistering && refs.registerStep === 'capture' && refs.selectedRegisterEmp) {
               const newBuffer = [...refs.livenessBuffer, Array.from(detections.descriptor)];
               if (newBuffer.length < 3) {
                 setLivenessBuffer(newBuffer);
                 setRegisterStatusMsg(`Capturando... ${newBuffer.length}/3`);
                 return;
               }
               
               cooldownRef.current = true;
               setRegisterStatusMsg('Verificando Liveness y guardando datos...');
               
               const dist = faceapi.euclideanDistance(new Float32Array(newBuffer[0]), new Float32Array(newBuffer[2]));
               if (dist < 0.01) { // Liveness check (too static)
                 setRegisterStatusMsg('Liveness Fallido: Rostro demasiado estático (Posible Foto)');
                 setTimeout(() => { setLivenessBuffer([]); cooldownRef.current = false; }, 3000);
                 return;
               }

               const supabase = getSupabaseBrowserClient();
               if (supabase) {
                 await supabase.from('employees').update({ face_embedding: newBuffer }).eq('id', refs.selectedRegisterEmp.id);
                 setRegisterStatusMsg('¡Datos faciales registrados correctamente!');
                 await fetchEmployeeEmbeddings();
                 setTimeout(() => {
                   setIsRegistering(false); setRegisterStep('pin'); setSelectedRegisterEmp(null); stopVideo(); cooldownRef.current = false; setLivenessBuffer([]);
                 }, 3000);
               }
               return;
            }

            if (refs.isRegistering || !refs.employeeToVerify) return;
            
            const emp = refs.employeeToVerify;
            let embeddingsToTest = [];
            if (Array.isArray(emp.face_embedding[0])) {
               embeddingsToTest = emp.face_embedding;
            } else {
               embeddingsToTest = [emp.face_embedding];
            }

            let bestDistance = 1.0;
            for (const emb of embeddingsToTest) {
               const dist = faceapi.euclideanDistance(detections.descriptor, new Float32Array(emb));
               if (dist < bestDistance) bestDistance = dist;
            }

            if (bestDistance <= 0.42) {
               // Aprobación instantánea con 1 solo frame exitoso (sin liveness) para máxima velocidad
               setFaceStatus('ready');
               prepareActionSelect(emp);
            } else if (detections.detection.score >= 0.85) {
               setFaceStatus('unknown');
               setStatusMessage(`Rostro no coincide con empleado ${emp.codigo_empleado || emp.id.substring(0,6)}`);
               setLivenessBuffer([]);
            } 
          }
        } catch (err) { console.error('Error face detection', err); }
      }
    }, 250);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isCameraActive, isModelLoaded]);

  const prepareActionSelect = async (employee: any) => {
    cooldownRef.current = true;
    stopVideo();
    setMatchStatus('verifying');
    setStatusMessage('Autenticando...');

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const { data: shift } = await supabase.from('company_shifts').select('*').eq('id', employee.shift_id).single();
      if (!shift) { showError(`Horario no asignado para ${employee.nombre_completo}`); return; }

      const localMidnight = new Date(new Date().setHours(0, 0, 0, 0));
      const { data: logs } = await supabase.from('time_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('timestamp', localMidnight.toISOString())
        .order('timestamp', { ascending: false });

      setMatchStatus('idle');
      setStatusMessage('');
      
      if (specialMode) {
        setPendingJustification({
          action: 'MARCAJE_ESPECIAL',
          data: { employee, shift, logs },
          options: policies?.justificaciones_marcaje_especial || ["Reingreso a Laborar", "Trabajo Extraordinario", "Capacitación", "Emergencia", "Comisión Externa", "Otros"]
        });
        setSpecialMode(false);
        return;
      }

      setPendingActionSelect({ employee, shift, logs });
    } catch (err) {
      showError('Error de conexión.');
    }
  };

  const handleActionSelect = (action: AllowedAction) => {
    const { employee, shift, logs } = pendingActionSelect;
    
    const lastLog = logs && logs.length > 0 ? logs[0] : null;
    if (lastLog && lastLog.evento_detectado === action) {
       showError('Ya existe una marcación registrada para este evento.');
       setPendingActionSelect(null);
       return;
    }

    const punchData = {
      employee,
      action,
      ...calculatePunches(action)
    };

    setPendingActionSelect(null);
    stopVideo();

    if (action === 'INGRESO' && (punchData.tardanza_segundos > 0 || punchData.minRetraso > 0)) {
      setPendingJustification({ action, data: punchData, options: policies?.justificaciones_llegada_tarde || ["Tráfico", "Transporte público", "Cita médica", "Emergencia familiar", "Otros"] });
      return;
    }
    if (action === 'REGRESO_REFACCION' || action === 'DESAYUNO_FIN') {
      if (punchData.exceso_desayuno_segundos > 0 || punchData.minExcesoBreak > 0) {
        setPendingJustification({ action, data: punchData, options: policies?.justificaciones_exceso_desayuno || ["Atención a cliente", "Reunión", "Demora en servicio", "Problema operativo", "Otros"] });
        return;
      }
    }
    if (action === 'REGRESO_ALMUERZO' || action === 'ALMUERZO_FIN') {
      if (punchData.exceso_almuerzo_segundos > 0 || punchData.minExcesoAlm > 0) {
        setPendingJustification({ action, data: punchData, options: policies?.justificaciones_exceso_almuerzo || ["Atención a cliente", "Reunión", "Demora en servicio", "Problema operativo", "Otros"] });
        return;
      }
    }
    if (action === 'SALIDA_FINAL' && (punchData.salida_anticipada_segundos > 0 || punchData.minSalidaAnt > 0)) {
      setPendingJustification({ action, data: punchData, options: policies?.justificaciones_salida_anticipada || ["Salud", "Emergencia", "Permiso autorizado", "Comisión laboral", "Otros"] });
      return;
    }

    submitPunchFinal({ ...punchData, razon: null });
  };

  const submitJustification = () => {
    if (!pendingJustification) return;
    if (!selectedReason || (selectedReason === 'Otros' && !otherReason)) {
      notify.warning('Por favor indique el motivo.');
      return;
    }
    const finalReason = selectedReason === 'Otros' ? otherReason : selectedReason;
    const action = pendingJustification.action === 'MARCAJE_ESPECIAL' ? specialDirection : pendingJustification.action;
    
    submitPunchFinal({ ...pendingJustification.data, action, razon: finalReason });
  };

  const submitPunchFinal = async (punchData: any) => {
    try {
      setPendingJustification(null);
      setMatchStatus('verifying');
      
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const eventToLog = punchData.action;

      const now = new Date();
      const currentDay = (now.getDay() || 7).toString();
      const daySchedule = punchData.employee?.company_shifts?.weekly_schedule ? punchData.employee.company_shifts.weekly_schedule[currentDay] : null;

      let hora_entrada_prog = null;
      let hora_salida_prog = null;
      if (daySchedule) {
        hora_entrada_prog = daySchedule.entrada;
        hora_salida_prog = daySchedule.salida;
      }

      const shift = punchData.employee?.company_shifts;
      const desayuno_inicio_prog = shift?.ventana_desayuno_inicio || '09:00:00';
      const desayuno_fin_prog = shift?.ventana_desayuno_fin || '10:15:00';
      const almuerzo_inicio_prog = shift?.ventana_almuerzo_inicio || '12:00:00';
      const almuerzo_fin_prog = shift?.ventana_almuerzo_fin || '15:30:00';

      let attendance_session_id = '';
      if (eventToLog === 'INGRESO') {
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const randomCode = Math.floor(1000 + Math.random() * 9000);
        const empCode = punchData.employee.codigo_empleado || punchData.employee.id.substring(0, 6);
        attendance_session_id = `ATD-${dateStr}-${empCode}-${randomCode}`;
      } else {
        const { data: lastLog } = await supabase
          .from('time_logs')
          .select('attendance_session_id, evento_detectado')
          .eq('employee_id', punchData.employee.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();
        
        if (lastLog && lastLog.attendance_session_id && lastLog.evento_detectado !== 'SALIDA_FINAL') {
          attendance_session_id = lastLog.attendance_session_id;
        } else {
          const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
          const randomCode = Math.floor(1000 + Math.random() * 9000);
          const empCode = punchData.employee.codigo_empleado || punchData.employee.id.substring(0, 6);
          attendance_session_id = `ATD-${dateStr}-${empCode}-${randomCode}`;
        }
      }

      const tipo_jornada = punchData.esDiaExtra ? 'Descanso' : 'Laboral';

      const { data: logData, error } = await supabase.from('time_logs').insert({
        employee_id: punchData.employee.id,
        evento_detectado: eventToLog,
        attendance_session_id,
        tipo_jornada,
        
        minutos_retraso_entrada: punchData.minRetraso,
        minutos_exceso_almuerzo: Math.max(punchData.minExcesoAlm || 0, punchData.minExcesoBreak || 0),
        minutos_salida_anticipada: punchData.minSalidaAnt,
        minutos_extra: punchData.minExtra,
        es_dia_extra: punchData.esDiaExtra,
        justificacion: punchData.razon,
        
        hora_entrada_prog,
        hora_salida_prog,
        desayuno_inicio_prog,
        desayuno_fin_prog,
        almuerzo_inicio_prog,
        almuerzo_fin_prog,
        estado_marcacion: punchData.estado_marcacion,
        tardanza_segundos: punchData.tardanza_segundos,
        tiempo_desayuno_segundos: punchData.exceso_desayuno_segundos > 0 ? (punchData.exceso_desayuno_segundos + (policies?.duracion_desayuno_min||15)*60) : 0,
        tiempo_almuerzo_segundos: punchData.exceso_almuerzo_segundos > 0 ? (punchData.exceso_almuerzo_segundos + (policies?.duracion_almuerzo_min||60)*60) : 0,
        salida_anticipada_segundos: punchData.salida_anticipada_segundos,
        horas_extra_segundos: punchData.horas_extra_segundos
      }).select().single();

      if (error) throw error;

      if (punchData.razon) {
         let tipoJust = 'LLEGADA_TARDE';
         if (eventToLog.includes('REGRESO_ALMUERZO') || eventToLog.includes('ALMUERZO_FIN')) tipoJust = 'EXCESO_ALMUERZO';
         else if (eventToLog.includes('REGRESO_REFACCION') || eventToLog.includes('DESAYUNO_FIN')) tipoJust = 'EXCESO_DESAYUNO';
         else if (eventToLog.includes('SALIDA_FINAL') && (punchData.minSalidaAnt > 0 || punchData.salida_anticipada_segundos > 0)) tipoJust = 'SALIDA_ANTICIPADA';
         else if (eventToLog === 'MARCAJE_ESPECIAL') tipoJust = 'MARCAJE_ESPECIAL';

         await supabase.from('time_justifications').insert({
            time_log_id: logData.id,
            employee_id: punchData.employee.id,
            tipo: tipoJust,
            minutos_calculados: Math.max(punchData.minRetraso, punchData.minExcesoAlm, punchData.minExcesoBreak, punchData.minSalidaAnt),
            estado: 'PENDIENTE',
            descripcion: punchData.razon,
            resolucion: 'Pendiente'
         });
      }

      setMatchStatus('success');
      const shortName = getShortName(punchData.employee.nombre_completo);
      let text = 'Marcación registrada';
      if (eventToLog === 'INGRESO') text = `Bienvenido, ${shortName}`;
      if (eventToLog === 'SALIDA_FINAL') text = `Hasta pronto, ${shortName}`;
      if (eventToLog === 'DESAYUNO_INICIO' || eventToLog === 'SALIDA_REFACCION') text = `Buen provecho, ${shortName}`;
      if (eventToLog === 'DESAYUNO_FIN' || eventToLog === 'REGRESO_REFACCION') text = `Bienvenido de vuelta, ${shortName}`;
      if (eventToLog === 'ALMUERZO_INICIO' || eventToLog === 'SALIDA_ALMUERZO') text = `Buen provecho, ${shortName}`;
      if (eventToLog === 'ALMUERZO_FIN' || eventToLog === 'REGRESO_ALMUERZO') text = `Bienvenido de vuelta, ${shortName}`;
      setStatusMessage(text);
      playTTS(eventToLog, shortName);
      resetCooldown(policies?.kiosko_tiempo_bloqueo_ms || 4000);
    } catch (err) {
      showError('Error guardando marcaje.');
    }
  };

  const playTTS = (event: string, shortName: string) => {
    if (!policies?.kiosko_voz_activa || !('speechSynthesis' in window)) return;
    
    const hour = new Date().getHours();
    let greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
    
    const msg = `${greeting} ${shortName}. ${event.replace(/_/g, ' ')} registrado correctamente.`;

    const utterance = new SpeechSynthesisUtterance(msg);
    utterance.lang = 'es-MX';
    const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('es'));
    utterance.voice = voices.find(v => v.name.toLowerCase().includes('natural')) || voices[0];
    window.speechSynthesis.speak(utterance);
  };

  const showError = (msg: string) => { setMatchStatus('error'); setStatusMessage(msg); resetCooldown(4000); };
  const resetCooldown = (ms: number = 3000) => {
    setTimeout(() => {
      setMatchStatus('idle'); setStatusMessage(''); setPendingActionSelect(null); setPendingJustification(null);
      setSelectedReason(''); setOtherReason(''); setSpecialMode(false); setSpecialDirection('INGRESO');
      setFaceStatus('searching'); setEmployeeInput(''); setEmployeeToVerify(null); setConsecutiveMatches(0); setLivenessBuffer([]);
      cooldownRef.current = false; stopVideo();
    }, ms);
  };

  if (!isModelLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400 animate-pulse">
        <Loader2 className="w-12 h-12 mb-4 animate-spin text-[#2ec4f1]" />
        <p className="font-bold uppercase tracking-widest text-xs">{loadingMsg}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] bg-black shadow-2xl flex flex-col items-center">
      <button onClick={() => { if (!isCameraActive) startVideo(); setSpecialMode(true); }} className={`absolute top-4 right-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${specialMode ? 'bg-[#2ec4f1] text-white shadow-[0_0_15px_rgba(46,196,241,0.5)]' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>
        <ShieldAlert className="w-3 h-3" /> Marcaje Especial
      </button>

      {!isCameraActive && !isRegistering && (
        <button onClick={() => { setIsRegistering(true); setRegisterStep('pin'); setPinCode(''); }} className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all bg-white/10 text-white/50 hover:bg-white/20">
          <Camera className="w-3 h-3" /> Registrar Rostro
        </button>
      )}

      {isCameraActive && !isRegistering && (
        <button onClick={() => { stopVideo(); resetCooldown(100); }} className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all bg-rose-500/20 text-rose-400 hover:bg-rose-500/40">
          <AlertCircle className="w-3 h-3" /> Cerrar Cámara
        </button>
      )}

      <div className="w-full min-h-[650px] bg-slate-900 relative flex items-center justify-center py-12">
        {!isCameraActive ? (
           <div className="flex flex-col items-center justify-center p-4 text-center animate-in fade-in zoom-in-95 duration-500 w-full h-full">
              <div className="w-full max-w-md bg-slate-800/80 p-6 rounded-3xl border border-slate-700/50 backdrop-blur-md shadow-2xl flex flex-col items-center">
                 <div className="text-center mb-3">
                   <p className="text-white font-black text-xl tracking-wide uppercase drop-shadow-md">
                     {policies?.kiosko_mensaje_bienvenida || 'Bienvenido a Tech Corps Guatemala'}
                   </p>
                 </div>
                 <p className="text-slate-300 text-xs font-medium leading-relaxed text-center mb-4">
                   Ingrese su <strong className="text-white">Código de Empleado</strong> para verificar su identidad.
                 </p>
                 
                 <div className="w-full relative mb-4">
                   <input 
                     type="text" 
                     value={employeeInput} 
                     onChange={(e) => setEmployeeInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                     placeholder="Código"
                     className="w-full bg-slate-900 border-2 border-[#2ec4f1]/50 focus:border-[#2ec4f1] text-white text-center text-3xl font-black tracking-widest py-3 rounded-xl outline-none shadow-inner transition-colors"
                     autoFocus
                   />
                 </div>

                 {/* Numpad */}
                 <div className="grid grid-cols-3 gap-2 w-full mb-4">
                    {[1,2,3,4,5,6,7,8,9].map(num => (
                      <button key={num} onClick={() => setEmployeeInput(prev => prev + num)} className="bg-slate-700 hover:bg-slate-600 text-white font-black text-xl py-3 rounded-lg transition-colors shadow-sm">
                        {num}
                      </button>
                    ))}
                    <button onClick={() => setEmployeeInput('')} className="bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 font-bold text-xs uppercase py-3 rounded-lg transition-colors">
                      Borrar
                    </button>
                    <button onClick={() => setEmployeeInput(prev => prev + '0')} className="bg-slate-700 hover:bg-slate-600 text-white font-black text-xl py-3 rounded-lg transition-colors shadow-sm">
                      0
                    </button>
                    <button onClick={() => setEmployeeInput(prev => prev.slice(0, -1))} className="bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm uppercase py-3 rounded-lg transition-colors flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
                    </button>
                 </div>

                 <button onClick={handleVerifyCode} disabled={!employeeInput || matchStatus === 'verifying'} className="w-full py-4 bg-[#2ec4f1] hover:bg-[#2ec4f1]/80 text-slate-950 font-black text-lg tracking-widest rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-[0_0_15px_rgba(46,196,241,0.3)] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                   {matchStatus === 'verifying' ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Siguiente'}
                 </button>
                 {statusMessage && <p className={`mt-3 text-xs font-bold ${matchStatus === 'error' ? 'text-rose-400' : 'text-[#2ec4f1]'}`}>{statusMessage}</p>}
              </div>
           </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay muted className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className={`w-72 h-72 rounded-full border-[6px] transition-colors duration-300 flex items-end justify-center pb-8 ${faceStatus === 'searching' ? 'border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.5)]' : faceStatus === 'adjusting' ? 'border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.5)]' : faceStatus === 'unknown' ? 'border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.5)]' : 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.5)]'}`}>
                  <span className={`px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest backdrop-blur-md ${faceStatus === 'searching' ? 'bg-rose-500/80 text-white' : faceStatus === 'adjusting' ? 'bg-amber-400/80 text-black' : faceStatus === 'unknown' ? 'bg-purple-500/80 text-white' : 'bg-emerald-500/80 text-white'}`}>
                    {faceStatus === 'searching' && 'Buscando rostro'}
                    {faceStatus === 'adjusting' && 'Ajustando posición'}
                    {faceStatus === 'unknown' && 'Rostro desconocido'}
                    {faceStatus === 'ready' && 'Rostro listo'}
                    {faceStatus === 'capturing' && 'Capturando...'}
                  </span>
               </div>
            </div>
            
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#2ec4f1]/10 to-transparent w-full h-1/4 animate-scan-line pointer-events-none" />
            
            {isRegistering && registerStatusMsg && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-emerald-500 text-white font-black px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top">
                 {registerStatusMsg}
              </div>
            )}
          </>
        )}

        {isRegistering && !isCameraActive && (
          <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in zoom-in-95">
             {registerStep === 'pin' && (
               <div className="w-full max-w-sm">
                  <h2 className="text-2xl font-black text-white text-center mb-4">Autorización Kiosko</h2>
                  <input type="password" value={pinCode} onChange={(e) => setPinCode(e.target.value)} placeholder="PIN Admin" className="w-full h-14 bg-slate-800 rounded-xl px-4 text-center text-2xl tracking-widest text-white mb-4 outline-none focus:border-[#2ec4f1] border-2 border-slate-700" autoFocus/>
                  <div className="flex gap-4">
                     <button onClick={() => { setIsRegistering(false); setPinCode(''); }} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 transition-colors">Cancelar</button>
                     <button onClick={() => { if (pinCode === '1234') { setRegisterStep('select'); fetchEmployeesForRegistration(); } else { notify.error('PIN Incorrecto'); } }} className="flex-1 bg-[#2ec4f1] text-slate-900 py-3 rounded-xl font-black hover:bg-[#2ec4f1]/80 transition-colors">Verificar</button>
                  </div>
               </div>
             )}
             {registerStep === 'select' && (
               <div className="w-full max-w-md">
                  <h2 className="text-xl font-black text-white text-center mb-4">Seleccionar Empleado a Registrar</h2>
                  <div className="max-h-72 overflow-y-auto bg-slate-800 rounded-xl mb-4 border border-slate-700 p-2">
                     {registerEmployees.length > 0 ? registerEmployees.map(emp => (
                        <button key={emp.id} onClick={() => { setSelectedRegisterEmp(emp); setRegisterStep('capture'); startVideo(); }} className="w-full text-left px-4 py-3 border-b border-slate-700/50 text-white hover:bg-[#2ec4f1]/20 hover:text-[#2ec4f1] font-bold rounded-lg transition-colors">
                           {emp.nombre_completo}
                        </button>
                     )) : <p className="text-center text-slate-400 py-4">Cargando empleados...</p>}
                  </div>
                  <button onClick={() => { setIsRegistering(false); setRegisterStep('pin'); setPinCode(''); }} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 transition-colors">Cancelar Registro</button>
               </div>
             )}
          </div>
        )}

        {pendingActionSelect && (
          <div className="absolute inset-0 z-40 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95">
            <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md flex flex-col items-center mb-6 shadow-xl">
               <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mb-4">
                 <User className="w-10 h-10 text-slate-400" />
               </div>
               <h2 className="text-2xl font-black text-white text-center capitalize">{getShortName(pendingActionSelect.employee.nombre_completo).toLowerCase()}</h2>
               <div className="flex gap-2 mt-2">
                 <span className="bg-[#2ec4f1]/20 text-[#2ec4f1] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                   Estado Actual: {currentState.replace(/_/g, ' ')}
                 </span>
               </div>
            </div>

            {/* Opciones Disponibles (Solo las permitidas por la máquina de estados) */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-md">
              {allowedActions.includes('INGRESO') && (
                <button onClick={() => handleActionSelect('INGRESO')} className="flex flex-col items-center justify-center gap-2 p-5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/30 rounded-2xl text-white transition-colors col-span-2">
                  <LogIn className="w-8 h-8 text-emerald-400" />
                  <span className="text-base font-bold">Ingresar a Laborar</span>
                </button>
              )}
              
              {(allowedActions.includes('DESAYUNO_INICIO') || allowedActions.includes('SALIDA_REFACCION')) && (
                <button onClick={() => handleActionSelect(allowedActions.includes('DESAYUNO_INICIO') ? 'DESAYUNO_INICIO' : 'SALIDA_REFACCION')} className="flex flex-col items-center justify-center gap-2 p-4 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 rounded-2xl text-white transition-colors">
                  <Coffee size={32} />
                  <span className="font-semibold text-sm">Inicio Desayuno</span>
                </button>
              )}
              
              {(allowedActions.includes('DESAYUNO_FIN') || allowedActions.includes('REGRESO_REFACCION')) && (
                <button onClick={() => handleActionSelect(allowedActions.includes('DESAYUNO_FIN') ? 'DESAYUNO_FIN' : 'REGRESO_REFACCION')} className="flex flex-col items-center justify-center gap-2 p-5 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 rounded-2xl text-white transition-colors col-span-2">
                  <CheckCircle2 size={36} />
                  <span className="font-semibold">Fin Desayuno</span>
                </button>
              )}

              {(allowedActions.includes('ALMUERZO_INICIO') || allowedActions.includes('SALIDA_ALMUERZO')) && (
                <button onClick={() => handleActionSelect(allowedActions.includes('ALMUERZO_INICIO') ? 'ALMUERZO_INICIO' : 'SALIDA_ALMUERZO')} className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 rounded-2xl text-white transition-colors">
                  <Utensils size={32} />
                  <span className="font-semibold text-sm">Inicio Almuerzo</span>
                </button>
              )}
              
              {(allowedActions.includes('ALMUERZO_FIN') || allowedActions.includes('REGRESO_ALMUERZO')) && (
                <button onClick={() => handleActionSelect(allowedActions.includes('ALMUERZO_FIN') ? 'ALMUERZO_FIN' : 'REGRESO_ALMUERZO')} className="flex flex-col items-center justify-center gap-2 p-5 bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 rounded-2xl text-white transition-colors col-span-2">
                  <CheckCircle2 size={36} />
                  <span className="font-semibold">Fin Almuerzo</span>
                </button>
              )}

              {allowedActions.includes('SALIDA_FINAL') && (
                <button onClick={() => handleActionSelect('SALIDA_FINAL')} className={`flex flex-col items-center justify-center gap-2 p-4 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/30 rounded-2xl text-white transition-colors ${allowedActions.length <= 2 ? 'col-span-2 p-5' : ''}`}>
                  <LogOut className="w-6 h-6 text-rose-400" />
                  <span className="text-sm font-bold">Finalizar Turno</span>
                </button>
              )}
            </div>

            <button onClick={() => resetCooldown(100)} className="mt-8 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest underline transition-colors">
              Cancelar y Cerrar
            </button>
          </div>
        )}

        {/* MODAL JUSTIFICACIONES */}
        {pendingJustification && (
          <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95">
            <Info className="w-16 h-16 text-amber-500 mb-4" />
            <h2 className="text-2xl font-black text-white mb-2">Justificación Requerida</h2>
            <p className="text-sm text-slate-300 mb-8 max-w-md">
               El sistema ha detectado una excepción en sus tiempos de marcaje. Para continuar, por favor indique el motivo de la demora.
            </p>

            <div className="w-full max-w-md space-y-4 mb-8">
              {pendingJustification.action === 'MARCAJE_ESPECIAL' && (
                <select value={specialDirection} onChange={e => setSpecialDirection(e.target.value)} className="w-full h-14 bg-slate-800 border-2 border-purple-500/50 rounded-xl px-4 text-white font-bold outline-none">
                  <option value="INGRESO">Registrar como: Entrada (Ingreso)</option>
                  <option value="SALIDA_FINAL">Registrar como: Retiro (Salida)</option>
                </select>
              )}

              <select value={selectedReason} onChange={e => setSelectedReason(e.target.value)} className="w-full h-14 bg-slate-800 border-2 border-slate-700 rounded-xl px-4 text-white font-bold outline-none focus:border-amber-500">
                <option value="" disabled>Seleccione una justificación...</option>
                {pendingJustification.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>

              {selectedReason === 'Otros' && (
                <input type="text" value={otherReason} onChange={e => setOtherReason(e.target.value)} placeholder="Escriba el motivo brevemente..." className="w-full h-14 bg-slate-800 border-2 border-slate-700 rounded-xl px-4 text-white font-medium outline-none focus:border-amber-500" maxLength={80} />
              )}
            </div>

            <div className="flex gap-4 w-full max-w-md">
              <button onClick={() => resetCooldown(100)} className="flex-1 h-14 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors">Cancelar</button>
              <button onClick={submitJustification} className="flex-1 h-14 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl transition-colors">Registrar</button>
            </div>
          </div>
        )}
      </div>
      
      {/* BANNER DE ESTADO */}
      <div className={`absolute bottom-0 left-0 w-full p-6 backdrop-blur-xl border-t transition-all duration-300 flex items-center gap-4 ${matchStatus === 'idle' ? 'bg-black/60 border-white/10' : ''} ${matchStatus === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : ''} ${matchStatus === 'error' ? 'bg-rose-500/90 border-rose-400 text-white' : ''} ${matchStatus === 'verifying' ? 'bg-[#2ec4f1]/90 border-[#2ec4f1] text-white' : ''}`}>
        {matchStatus === 'idle' && <Camera className="w-8 h-8 text-white/50" />}
        {matchStatus === 'verifying' && <Loader2 className="w-8 h-8 animate-spin" />}
        {matchStatus === 'success' && <CheckCircle2 className="w-8 h-8" />}
        {matchStatus === 'error' && <AlertCircle className="w-8 h-8" />}
        <div className="flex-1">
          <p className="text-xs font-black uppercase tracking-widest opacity-70">
            {matchStatus === 'idle' ? (isCameraActive ? 'Kiosko Biométrico Activo' : 'Sistema en Espera') : matchStatus}
          </p>
          <h3 className="text-lg font-bold leading-tight">
            {matchStatus === 'idle' ? (isCameraActive ? 'Ubique su rostro dentro del recuadro' : 'Presione MARCAR para iniciar') : statusMessage}
          </h3>
        </div>
      </div>
    </div>
  );
}
