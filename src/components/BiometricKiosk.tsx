"use client";

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  COMPANY_SHIFT_KIOSK_SELECT,
  EMPLOYEE_KIOSK_VERIFY_SELECT,
  EMPLOYEE_REGISTER_LIST_SELECT,
  HR_POLICY_SETTINGS_SELECT,
  TIME_LOG_KIOSK_SELECT,
} from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { notify } from '@/components/ui';
import {
  KioskActionBar,
  KioskCodePad,
  KioskEnrollmentOverlay,
  KioskEntryMenu,
  KioskFaceGuide,
  KioskIntentConfirm,
  KioskJustificationPanel,
  KioskStatusBanner,
} from '@/components/kiosk';
import {
  evaluatePunch,
  isWithinPermissionWindow,
  specialMarcajeOptions,
  type EvaluatePunchResult,
  type IntentOption,
  type PunchEvent,
} from '@/lib/attendance-engine';
import {
  ENROLLMENT_POSES,
  POSE_INSTRUCTIONS,
  RECOGNITION_CONFIG,
  faceEmbeddingRepository,
  getInsightFaceService,
  getKioskBiometricPin,
  type EnrollmentCapture,
} from '@/lib/face-recognition';

type PunchSession = {
  employee: any;
  shift: any;
  logs: any[];
};

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

const formatPolicyHm = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  return String(value).slice(0, 5);
};

const permissionWindowLabel = (policies: { horario_permiso_inicio?: string; horario_permiso_fin?: string } | null | undefined) =>
  `${formatPolicyHm(policies?.horario_permiso_inicio, '00:00')} – ${formatPolicyHm(policies?.horario_permiso_fin, '23:59')}`;

export function BiometricKiosk() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Cargando motor InsightFace...');
  const [policies, setPolicies] = useState<any>(null);
  
  const [matchStatus, setMatchStatus] = useState<'idle' | 'success' | 'error' | 'verifying'>('idle');
  const [faceStatus, setFaceStatus] = useState<'searching' | 'adjusting' | 'ready' | 'capturing' | 'unknown'>('searching');
  const [statusMessage, setStatusMessage] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const cooldownRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [pendingSession, setPendingSession] = useState<PunchSession | null>(null);
  const [pendingIntent, setPendingIntent] = useState<{
    session: PunchSession;
    decision: EvaluatePunchResult;
  } | null>(null);
  const [pendingJustification, setPendingJustification] = useState<any>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [specialMode, setSpecialMode] = useState(false);
  const [specialDirection, setSpecialDirection] = useState('INGRESO');

  /** menu = elegir método; face = 1:N; code = teclado + verificación 1:1 */
  const [entryMode, setEntryMode] = useState<'menu' | 'face' | 'code'>('menu');
  const [employeeInput, setEmployeeInput] = useState('');
  const [employeeToVerify, setEmployeeToVerify] = useState<any>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerStep, setRegisterStep] = useState<'pin' | 'select' | 'capture'>('pin');
  const [pinCode, setPinCode] = useState('');
  const [registerEmployees, setRegisterEmployees] = useState<any[]>([]);
  const [selectedRegisterEmp, setSelectedRegisterEmp] = useState<any>(null);
  const [registerStatusMsg, setRegisterStatusMsg] = useState('');
  const [enrollmentCaptures, setEnrollmentCaptures] = useState<EnrollmentCapture[]>([]);
  const [enrollmentPoseIndex, setEnrollmentPoseIndex] = useState(0);

  const stateRefs = useRef({
    isRegistering,
    registerStep,
    selectedRegisterEmp,
    pendingSession,
    pendingIntent,
    pendingJustification,
    employeeToVerify,
    entryMode,
    enrollmentCaptures,
    enrollmentPoseIndex,
  });

  useEffect(() => {
    stateRefs.current = {
      isRegistering,
      registerStep,
      selectedRegisterEmp,
      pendingSession,
      pendingIntent,
      pendingJustification,
      employeeToVerify,
      entryMode,
      enrollmentCaptures,
      enrollmentPoseIndex,
    };
  }, [isRegistering, registerStep, selectedRegisterEmp, pendingSession, pendingIntent, pendingJustification, employeeToVerify, entryMode, enrollmentCaptures, enrollmentPoseIndex]);

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
    const { data, error } = await supabase
      .from('hr_policies_versions')
      .select(HR_POLICY_SETTINGS_SELECT)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[BiometricKiosk] hr_policies_versions:', error.message || error);
      return;
    }
    if (data?.settings) setPolicies(data.settings);
  };

  const loadModels = async () => {
    try {
      setLoadingMsg('Cargando InsightFace (ArcFace)...');
      await getInsightFaceService().initialize();
      setLoadingMsg('Motor biométrico listo');
      setIsModelLoaded(true);
    } catch (err) {
      console.error(err);
      setLoadingMsg('Error cargando modelos InsightFace. Ejecute npm run download:insightface');
    }
  };

  const fetchEmployeesForRegistration = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.from('employees').select(EMPLOYEE_REGISTER_LIST_SELECT).order('nombre_completo');
    if (data) setRegisterEmployees(data);
  };

  const startFacePunch = () => {
    setEntryMode('face');
    setEmployeeToVerify(null);
    setEmployeeInput('');
    setMatchStatus('idle');
    setStatusMessage('');
    setFaceStatus('searching');
    startVideo();
  };

  const backToMenu = () => {
    stopVideo();
    setEntryMode('menu');
    setEmployeeToVerify(null);
    setEmployeeInput('');
    setMatchStatus('idle');
    setStatusMessage('');
    setFaceStatus('searching');
    setSpecialMode(false);
    cooldownRef.current = false;
  };

  const fetchEmployeeById = async (employeeId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data: emp, error } = await supabase
      .from('employees')
      .select(EMPLOYEE_KIOSK_VERIFY_SELECT)
      .eq('id', employeeId)
      .single();
    if (error || !emp) {
      console.error('Error fetching employee by id:', error);
      return null;
    }
    return emp;
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
      .select(EMPLOYEE_KIOSK_VERIFY_SELECT)
      .in('codigo_empleado', lookupCodes)
      .single();

    if (error) {
      console.error("Error fetching employee:", error);
    }

    if (error || !emp) {
      showError('Empleado no encontrado');
      return;
    }

    const hasBio = await faceEmbeddingRepository.countActiveForEmployee(emp.id);
    if (!hasBio) {
      showError('Empleado sin biometría InsightFace. Debe re-enrolarse.');
      return;
    }

    setEmployeeToVerify(emp);
    setEntryMode('face');
    setMatchStatus('idle');
    setStatusMessage('');
    startVideo();
  };

  const startVideo = () => {
    setIsCameraActive(true);
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
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

    const faceService = getInsightFaceService();
    let busy = false;

    intervalRef.current = setInterval(async () => {
      const refs = stateRefs.current;
      if (busy || cooldownRef.current || refs.pendingSession || refs.pendingIntent || refs.pendingJustification) return;
      if (!videoRef.current || videoRef.current.readyState < 4) return;

      busy = true;
      try {
        if (refs.isRegistering && refs.registerStep === 'capture' && refs.selectedRegisterEmp) {
          const pose = ENROLLMENT_POSES[refs.enrollmentPoseIndex] ?? 'FRONT';
          const instruction = POSE_INSTRUCTIONS[pose] || pose;
          setFaceStatus('capturing');
          setRegisterStatusMsg(
            `${instruction} (${refs.enrollmentCaptures.length + 1}/${RECOGNITION_CONFIG.MIN_ENROLLMENT_COUNT}–${RECOGNITION_CONFIG.MAX_ENROLLMENT_COUNT})`,
          );

          const capture = await faceService.captureForEnrollment(videoRef.current, pose);
          if ('error' in capture) {
            setFaceStatus('adjusting');
            setRegisterStatusMsg(capture.error);
            return;
          }

          cooldownRef.current = true;
          const nextCaptures = [...refs.enrollmentCaptures, capture];
          setEnrollmentCaptures(nextCaptures);
          const nextPose = Math.min(refs.enrollmentPoseIndex + 1, ENROLLMENT_POSES.length - 1);
          setEnrollmentPoseIndex(nextPose);

          if (nextCaptures.length >= RECOGNITION_CONFIG.MIN_ENROLLMENT_COUNT) {
            setRegisterStatusMsg('Guardando embeddings...');
            const ok = await faceService.saveEnrollment(refs.selectedRegisterEmp.id, nextCaptures);
            setRegisterStatusMsg(ok ? '¡Biometría registrada (InsightFace)!' : 'Error guardando embeddings');
            setTimeout(() => {
              setIsRegistering(false);
              setRegisterStep('pin');
              setSelectedRegisterEmp(null);
              setEnrollmentCaptures([]);
              setEnrollmentPoseIndex(0);
              stopVideo();
              cooldownRef.current = false;
            }, 2500);
          } else {
            setTimeout(() => { cooldownRef.current = false; }, 900);
          }
          return;
        }

        if (refs.isRegistering) return;

        // 1:1 (código + rostro) o 1:N (solo rostro)
        const useOneToOne = Boolean(refs.employeeToVerify);
        if (!useOneToOne && refs.entryMode !== 'face') return;

        const { analysis, match } = useOneToOne
          ? await faceService.verifyEmployee(videoRef.current, refs.employeeToVerify.id)
          : await faceService.identifyEmployee(videoRef.current);

        if (!analysis.embedding) {
          if (analysis.rejectReason?.includes('No se detectó')) setFaceStatus('searching');
          else if (analysis.rejectReason?.includes('más de una')) setFaceStatus('unknown');
          else setFaceStatus('adjusting');
          if (analysis.rejectReason) setStatusMessage(analysis.rejectReason);
          return;
        }

        if (match?.matched) {
          setFaceStatus('ready');
          if (useOneToOne) {
            processSmartPunch(refs.employeeToVerify);
          } else if (match.employeeId) {
            const emp = await fetchEmployeeById(match.employeeId);
            if (!emp) {
              setFaceStatus('unknown');
              setStatusMessage('Empleado reconocido pero no encontrado en RRHH');
              return;
            }
            processSmartPunch(emp);
          }
        } else {
          setFaceStatus('unknown');
          setStatusMessage(
            useOneToOne
              ? `Rostro no coincide (${match?.confidence ?? 0}% · dist ${match?.distance?.toFixed(3) ?? '—'})`
              : `Rostro no reconocido (${match?.confidence ?? 0}% · dist ${match?.distance?.toFixed(3) ?? '—'})`,
          );
        }
      } catch (err) {
        console.error('Error face detection', err);
      } finally {
        busy = false;
      }
    }, RECOGNITION_CONFIG.FRAME_INTERVAL_MS);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isCameraActive, isModelLoaded]);

  const greetingForNow = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const applyDecision = (session: PunchSession, decision: EvaluatePunchResult) => {
    setPendingSession(null);
    setPendingIntent(null);

    if (decision.needsIntent) {
      setPendingIntent({ session, decision });
      setMatchStatus('idle');
      setStatusMessage('');
      return;
    }

    if (!decision.evento) {
      showError('No se pudo determinar el tipo de marcaje.');
      return;
    }

    // Marcaje especial desde intención: pedir dirección + motivo
    if (decision.evento === 'MARCAJE_ESPECIAL') {
      setPendingJustification({
        action: 'MARCAJE_ESPECIAL',
        data: { ...session, ...decision.metrics },
        options: decision.justificacionOptions.length
          ? decision.justificacionOptions
          : specialMarcajeOptions(policies),
        prompt: 'Marcaje especial: indique dirección y motivo.',
      });
      setMatchStatus('idle');
      return;
    }

    const punchData = {
      employee: session.employee,
      shift: session.shift,
      logs: session.logs,
      action: decision.evento,
      ...decision.metrics,
      justificacion_tipo: decision.justificacionTipo || undefined,
    };

    if (decision.requiereJustificacion) {
      setPendingJustification({
        action: decision.evento,
        data: punchData,
        options: decision.justificacionOptions,
        prompt:
          decision.justificacionTipo === 'MARCAJE_ESPECIAL'
            ? 'Detectamos marcaje fuera de jornada. Seleccione el motivo:'
            : 'El sistema ha detectado una excepción. Indique el motivo:',
        justificacion_tipo: decision.justificacionTipo,
      });
      setMatchStatus('idle');
      return;
    }

    submitPunchFinal({ ...punchData, razon: null });
  };

  const processSmartPunch = async (employee: any) => {
    cooldownRef.current = true;
    stopVideo();
    const shortName = getShortName(employee.nombre_completo);
    setMatchStatus('verifying');
    setStatusMessage(`${greetingForNow()}, ${shortName}. Procesando marcaje...`);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data: shift } = await supabase
        .from('company_shifts')
        .select(COMPANY_SHIFT_KIOSK_SELECT)
        .eq('id', employee.shift_id)
        .single();
      if (!shift) {
        showError(`Horario no asignado para ${employee.nombre_completo}`);
        return;
      }

      const localMidnight = new Date(new Date().setHours(0, 0, 0, 0));
      const { data: logs } = await supabase
        .from('time_logs')
        .select(TIME_LOG_KIOSK_SELECT)
        .eq('employee_id', employee.id)
        .gte('timestamp', localMidnight.toISOString())
        .order('timestamp', { ascending: false });

      const session: PunchSession = { employee, shift, logs: logs || [] };

      if (specialMode) {
        if (!policies?.permitir_marcaje_especial || !isWithinPermissionWindow(policies)) {
          setSpecialMode(false);
          notify.warning('Fuera de horario de permisos', {
            description: `Marcaje especial solo entre ${permissionWindowLabel(policies)}.`,
          });
          resetCooldown(100);
          return;
        }
        setSpecialMode(false);
        setPendingJustification({
          action: 'MARCAJE_ESPECIAL',
          data: session,
          options: specialMarcajeOptions(policies),
          prompt: 'Marcaje especial: indique dirección y motivo.',
        });
        setMatchStatus('idle');
        setStatusMessage('');
        return;
      }

      setPendingSession(session);
      const decision = evaluatePunch({
        shift,
        logs: logs || [],
        policies,
        now: new Date(),
      });
      applyDecision(session, decision);
    } catch (err) {
      console.error(err);
      showError('Error de conexión.');
    }
  };

  const handleIntentSelect = (option: IntentOption) => {
    if (!pendingIntent) return;
    const { session } = pendingIntent;
    setPendingIntent(null);
    setMatchStatus('verifying');
    setStatusMessage('Procesando marcaje...');
    const decision = evaluatePunch({
      shift: session.shift,
      logs: session.logs,
      policies,
      now: new Date(),
      forcedEvent: option.evento as PunchEvent,
    });
    applyDecision(session, decision);
  };

  const submitJustification = () => {
    if (!pendingJustification) return;
    if (!selectedReason || (selectedReason === 'Otros' && !otherReason)) {
      notify.warning('Por favor indique el motivo.');
      return;
    }
    const finalReason = selectedReason === 'Otros' ? otherReason : selectedReason;
    const isSpecial = pendingJustification.action === 'MARCAJE_ESPECIAL';
    const action = isSpecial ? specialDirection : pendingJustification.action;

    submitPunchFinal({
      ...pendingJustification.data,
      employee: pendingJustification.data.employee,
      shift: pendingJustification.data.shift,
      action,
      razon: finalReason,
      justificacion_tipo:
        pendingJustification.justificacion_tipo ||
        (isSpecial ? 'MARCAJE_ESPECIAL' : undefined),
    });
  };

  const submitPunchFinal = async (punchData: any) => {
    try {
      setPendingJustification(null);
      setMatchStatus('verifying');
      
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const normalizeEventForTimeLog = (rawEvent: string): string => {
        const event = String(rawEvent || '').trim().toUpperCase();
        const aliases: Record<string, string> = {
          // Canonicalize legacy aliases to the current event names
          SALIDA_REFACCION: 'DESAYUNO_INICIO',
          REGRESO_REFACCION: 'DESAYUNO_FIN',
          SALIDA_ALMUERZO: 'ALMUERZO_INICIO',
          REGRESO_ALMUERZO: 'ALMUERZO_FIN',
          REGRESO_DESAYUNO: 'DESAYUNO_FIN',
          INGRESO_ESPECIAL: 'INGRESO',
          SALIDA_ESPECIAL: 'SALIDA_FINAL',
          SALIDA: 'SALIDA_FINAL',
          MARCAJE_ESPECIAL: 'INGRESO',
        };
        return aliases[event] || event;
      };

      const normalizeEstadoMarcacionForTimeLog = (rawEstado: string): string | null => {
        const estado = String(rawEstado || '').trim().toUpperCase();
        if (!estado) return null;
        const aliases: Record<string, string> = {
          EXCESO_DESAYUNO: 'JUSTIFICADO',
          EXCESO_ALMUERZO: 'JUSTIFICADO',
          SALIDA_ANTICIPADA: 'TEMPRANO',
        };
        return aliases[estado] || estado;
      };

      const eventToLog = normalizeEventForTimeLog(punchData.action);

      const now = new Date();
      const currentDay = (now.getDay() || 7).toString();
      const shift = punchData.shift || punchData.employee?.company_shifts;
      const daySchedule = shift?.weekly_schedule ? shift.weekly_schedule[currentDay] : null;

      let hora_entrada_prog = null;
      let hora_salida_prog = null;
      if (daySchedule) {
        hora_entrada_prog = daySchedule.entrada;
        hora_salida_prog = daySchedule.salida;
      }

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
          .maybeSingle();
        
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
      const minutosJust = Math.max(
        punchData.minRetraso || 0,
        punchData.minExcesoAlm || 0,
        punchData.minExcesoBreak || 0,
        punchData.minSalidaAnt || 0,
      );

      let justificacion_tipo: string | null = punchData.justificacion_tipo || null;
      if (punchData.razon && !justificacion_tipo) {
        justificacion_tipo = 'LLEGADA_TARDE';
        if (eventToLog.includes('REGRESO_ALMUERZO') || eventToLog.includes('ALMUERZO_FIN')) {
          justificacion_tipo = 'EXCESO_ALMUERZO';
        } else if (eventToLog.includes('REGRESO_REFACCION') || eventToLog.includes('DESAYUNO_FIN')) {
          justificacion_tipo = 'EXCESO_DESAYUNO';
        } else if (
          eventToLog.includes('SALIDA_FINAL') &&
          (punchData.minSalidaAnt > 0 || punchData.salida_anticipada_segundos > 0)
        ) {
          justificacion_tipo = 'SALIDA_ANTICIPADA';
        }
      }

      const { data: logData, error } = await supabase.rpc('kiosk_insert_time_log', {
        p_payload: {
          employee_id: punchData.employee.id,
          evento_detectado: eventToLog,
          attendance_session_id,
          tipo_jornada,
          minutos_retraso_entrada: punchData.minRetraso || 0,
          minutos_exceso_almuerzo: Math.max(punchData.minExcesoAlm || 0, punchData.minExcesoBreak || 0),
          minutos_salida_anticipada: punchData.minSalidaAnt || 0,
          minutos_extra: punchData.minExtra || 0,
          es_dia_extra: !!punchData.esDiaExtra,
          justificacion: punchData.razon || null,
          justificacion_tipo: punchData.razon ? justificacion_tipo : null,
          minutos_justificacion: minutosJust,
          hora_entrada_prog,
          hora_salida_prog,
          desayuno_inicio_prog,
          desayuno_fin_prog,
          almuerzo_inicio_prog,
          almuerzo_fin_prog,
          estado_marcacion: normalizeEstadoMarcacionForTimeLog(punchData.estado_marcacion),
          tardanza_segundos: punchData.tardanza_segundos || 0,
          tiempo_desayuno_segundos:
            punchData.exceso_desayuno_segundos > 0
              ? punchData.exceso_desayuno_segundos + (policies?.duracion_desayuno_min || 15) * 60
              : 0,
          tiempo_almuerzo_segundos:
            punchData.exceso_almuerzo_segundos > 0
              ? punchData.exceso_almuerzo_segundos + (policies?.duracion_almuerzo_min || 60) * 60
              : 0,
          salida_anticipada_segundos: punchData.salida_anticipada_segundos || 0,
          horas_extra_segundos: punchData.horas_extra_segundos || 0,
        },
        p_device_pin: getKioskBiometricPin(),
      });

      if (error) throw error;
      if (!logData?.id) throw new Error('No se recibió el marcaje.');

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
    } catch (err: any) {
      console.error('Error guardando marcaje:', err);
      const detail = err?.message || err?.error_description || '';
      showError(detail ? `Error guardando marcaje: ${detail}` : 'Error guardando marcaje.');
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
      setMatchStatus('idle');
      setStatusMessage('');
      setPendingSession(null);
      setPendingIntent(null);
      setPendingJustification(null);
      setSelectedReason('');
      setOtherReason('');
      setSpecialMode(false);
      setSpecialDirection('INGRESO');
      setFaceStatus('searching');
      setEmployeeInput('');
      setEmployeeToVerify(null);
      setEntryMode('menu');
      setEnrollmentCaptures([]);
      setEnrollmentPoseIndex(0);
      cooldownRef.current = false;
      stopVideo();
    }, ms);
  };

  if (!isModelLoaded) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-neutral-500 animate-pulse">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-accent" />
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-700">{loadingMsg}</p>
      </div>
    );
  }

  const bannerTitle =
    matchStatus === 'idle'
      ? isCameraActive
        ? 'Reconocimiento Facial'
        : 'Sistema en Espera'
      : matchStatus;

  const bannerSubtitle =
    matchStatus === 'idle'
      ? isCameraActive
        ? statusMessage ||
          (employeeToVerify
            ? `Confirme rostro · ${getShortName(employeeToVerify.nombre_completo)}`
            : 'Ubique su rostro dentro del círculo')
        : 'Seleccione reconocimiento facial o código'
      : statusMessage;

  const welcomeMessage =
    policies?.kiosko_mensaje_bienvenida || 'Bienvenido a Tech Corps Guatemala';

  const specialWindowLabel = permissionWindowLabel(policies);
  const specialOutsideWindow = !isWithinPermissionWindow(policies);

  return (
    <div className="relative flex w-full flex-col items-center overflow-hidden rounded-2xl border border-white/40 bg-white/35 shadow-2xl backdrop-blur-md">
      <KioskActionBar
        showSpecial={policies?.permitir_marcaje_especial !== false}
        specialActive={specialMode}
        specialOutsideWindow={specialOutsideWindow}
        specialTitle={
          specialOutsideWindow
            ? `Disponible solo entre ${specialWindowLabel}`
            : 'Activar marcaje especial'
        }
        showEnroll={!isCameraActive && !isRegistering && entryMode === 'menu'}
        showCloseCamera={isCameraActive && !isRegistering}
        onSpecial={() => {
          if (specialOutsideWindow) {
            notify.warning('Fuera de horario de permisos', {
              description: `Marcaje especial solo entre ${specialWindowLabel}. Ajústelo en RRHH → Políticas → Permisos Especiales.`,
            });
            return;
          }
          setSpecialMode(true);
          if (!isCameraActive) startFacePunch();
        }}
        onEnroll={() => {
          setIsRegistering(true);
          setRegisterStep('pin');
          setPinCode('');
        }}
        onCloseCamera={backToMenu}
      />

      <div className="relative flex min-h-[650px] w-full items-center justify-center bg-white/10 py-12">
        {!isCameraActive ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-white/50 bg-white/45 p-6 shadow-xl backdrop-blur-sm">
              {entryMode === 'menu' && (
                <KioskEntryMenu
                  welcomeMessage={welcomeMessage}
                  onFacePunch={startFacePunch}
                  onCodeEntry={() => {
                    setEntryMode('code');
                    setEmployeeInput('');
                    setStatusMessage('');
                  }}
                />
              )}

              {entryMode === 'code' && (
                <KioskCodePad
                  value={employeeInput}
                  statusMessage={statusMessage}
                  isError={matchStatus === 'error'}
                  isVerifying={matchStatus === 'verifying'}
                  onChange={setEmployeeInput}
                  onBack={() => {
                    setEntryMode('menu');
                    setEmployeeInput('');
                    setStatusMessage('');
                  }}
                  onSubmit={handleVerifyCode}
                />
              )}

              {statusMessage && entryMode === 'menu' ? (
                <p
                  className={`mt-3 text-xs font-semibold ${
                    matchStatus === 'error' ? 'text-danger' : 'text-accent'
                  }`}
                >
                  {statusMessage}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />

            <KioskFaceGuide
              faceStatus={faceStatus}
              statusMessage={statusMessage}
              showStatusMessage={isCameraActive && !isRegistering}
            />

            {isRegistering && registerStatusMsg ? (
              <div className="absolute top-8 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-success px-6 py-3 font-bold text-white shadow-xl animate-in slide-in-from-top">
                {registerStatusMsg}
              </div>
            ) : null}
          </>
        )}

        {isRegistering && !isCameraActive ? (
          <KioskEnrollmentOverlay
            step={registerStep}
            pinCode={pinCode}
            employees={registerEmployees}
            onPinChange={setPinCode}
            onCancel={() => {
              setIsRegistering(false);
              setRegisterStep('pin');
              setPinCode('');
            }}
            onVerifyPin={() => {
              if (pinCode === '1234') {
                setRegisterStep('select');
                fetchEmployeesForRegistration();
              } else {
                notify.error('PIN Incorrecto');
              }
            }}
            onSelectEmployee={(emp) => {
              setSelectedRegisterEmp(emp);
              setEnrollmentCaptures([]);
              setEnrollmentPoseIndex(0);
              setRegisterStep('capture');
              setRegisterStatusMsg(POSE_INSTRUCTIONS.FRONT);
              startVideo();
            }}
          />
        ) : null}

        {pendingIntent ? (
          <KioskIntentConfirm
            employeeName={getShortName(
              pendingIntent.session.employee.nombre_completo,
            ).toLowerCase()}
            prompt={pendingIntent.decision.intentPrompt || '¿Motivo del marcaje?'}
            options={pendingIntent.decision.intentOptions}
            onSelect={handleIntentSelect}
            onCancel={() => resetCooldown(100)}
          />
        ) : null}

        {pendingJustification ? (
          <KioskJustificationPanel
            employeeName={
              pendingJustification.data?.employee?.nombre_completo
                ? getShortName(pendingJustification.data.employee.nombre_completo)
                : undefined
            }
            prompt={
              pendingJustification.prompt ||
              'El sistema ha detectado una excepción en sus tiempos de marcaje. Para continuar, por favor indique el motivo.'
            }
            action={pendingJustification.action}
            specialDirection={specialDirection}
            selectedReason={selectedReason}
            otherReason={otherReason}
            options={Array.from(new Set((pendingJustification.options || []) as string[]))}
            onSpecialDirectionChange={setSpecialDirection}
            onReasonChange={setSelectedReason}
            onOtherReasonChange={setOtherReason}
            onCancel={() => resetCooldown(100)}
            onSubmit={submitJustification}
          />
        ) : null}
      </div>

      <KioskStatusBanner
        matchStatus={matchStatus}
        title={bannerTitle}
        subtitle={bannerSubtitle}
      />
    </div>
  );
}
