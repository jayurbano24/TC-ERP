/**
 * Proyecciones SQL explícitas — evita select('*') y reduce egress.
 * Usar en consultas PostgREST donde el payload importa.
 */

/** Conteos PostgREST sin filas (head: true). */
export const COUNT_HEAD = 'id';

/** Read-model cac_tray_units (ver CacTrayUnitRow). */
export const CAC_TRAY_UNIT_SELECT =
  'id, service_order_id, reception_id, sap_transfer_id, reception_guide_id, classified_at, os_label, os_number, guide_number, pilot_name, carrier, received_by_name, agency_code, agency_name, sap_document_number, unit_status, unit_status_label, reentry_count, tech_id, brand_id, model_id, serial_numbers, series_ids';

export const TECHNOLOGY_SELECT = 'id, name, series_count, digits_per_series';
export const BRAND_SELECT = 'id, name, code';
export const MODEL_SELECT = 'id, name, code, brand_id, technology_id, series_count, digits_per_series';
export const AGENCY_SELECT = 'id, code, name, client_id, manager, email, phone, address';
export const CARRIER_SELECT = 'id, name, code';
export const RETURN_REASON_SELECT = 'id, name, active';
export const PX_PROVIDER_SELECT = 'id, name, code';
export const CAT_REPAIR_SELECT = 'id, name';
export const CAT_DIAGNOSTIC_SELECT = 'id, name';
export const CAT_DIAGNOSTIC_REPAIR_SELECT = 'diagnostic_id, repair_id';
export const CAT_REACOND_TEST_SELECT = 'id, name, technology_ids, model_ids';

export const SAP_TRANSFER_DOC_SELECT =
  'id, reception_id, reception_guide_id, sap_document_number, agency, registered_by, status';

export const RECEPTION_GUIDE_SELECT =
  'id, reception_id, guide_number, status, category, classified_by, classified_at, created_at, motivo';

export const RECEPTION_RETURN_SELECT = 'id, notes, processed_guides, status';
/** Alias semántico (undo / devolución parcial). */
export const RECEPTION_UNDO_SELECT = RECEPTION_RETURN_SELECT;

export const RECEPTION_DETAIL_SELECT =
  'id, guide_number, notes, carrier, received_by, status, created_at, source, processed_guides';

export const RECEPTION_TIMELINE_SELECT =
  'id, guide_number, status, carrier, created_at, service_orders(id, os_label, main_serial, model_id, brand_id, series(serial_number))';

export const ACCESSORY_SELECT =
  'id, name, sku, characteristics, comments, qty_new, qty_recovered, created_at, updated_at';
export const ACCESSORY_BOX_SELECT =
  'id, recovery_order, accessory_id, quantity, status, location, created_by, created_at, updated_at';
export const ACCESSORY_BOX_LIST_SELECT =
  'id, recovery_order, accessory_id, quantity, status, location, created_by, created_at, accessories(name, sku)';
export const ACCESSORY_MOVEMENT_SELECT =
  'id, accessory_id, movement_type, condition, quantity, destination, notes, sap_transfer_number, created_by, created_at';

export const TALLER_KPI_GOAL_SELECT =
  'id, user_id, stage, technology_id, model_id, daily_goal, weekly_goal, created_at, updated_at';
export const ACTIVITY_COST_SELECT = 'id, name, cost, description, created_at, updated_at';

export const ERP_AUDIT_LOG_SELECT =
  'id, module, table_name, record_id, action, severity, user_id, old_values, new_values, observations, created_at, ip_address';

export const ERP_ROLE_PERMISSION_SELECT =
  'id, role_id, module_name, can_view, can_edit, can_delete, updated_at';
export const HR_POSITION_SELECT = 'id, name, description';
export const HR_DEPARTMENT_SELECT = 'id, name';
export const HR_EMPLOYEE_TYPE_SELECT = 'id, name';
export const COMPANY_SHIFT_SELECT =
  'id, name, weekly_schedule, ventana_desayuno_inicio, ventana_desayuno_fin, ventana_almuerzo_inicio, ventana_almuerzo_fin';
export const ERP_USER_SECURITY_SELECT =
  'user_id, force_pwd_change, require_2fa, failed_attempts, locked_until, allowed_ips, updated_at';

/** Versiones de políticas RRHH (UI configuración + historial). */
export const HR_POLICY_VERSION_SELECT =
  'id, version, is_active, settings, created_at, created_by, created_by_name';
/** Solo settings — kiosko / lecturas ligeras. */
export const HR_POLICY_SETTINGS_SELECT = 'settings';
export const HR_PAYROLL_CLOSURE_SELECT =
  'id, periodo, fecha_proceso, estado, total_empleados, total_salarios, total_liquido, total_igss_laboral, total_isr_retenido, total_igss_patronal, total_irtra, total_intecap, costo_total_patronal, costo_total_planilla, created_at';

export const TIME_LOG_PAYROLL_SELECT =
  'id, employee_id, timestamp, minutos_retraso_entrada, minutos_exceso_almuerzo, minutos_salida_anticipada, minutos_extra, es_dia_extra';
export const EMPLOYEE_ABSENCE_PAYROLL_SELECT = 'id, employee_id, tipo_falta, fecha';

export const EMPLOYEE_LIST_SELECT =
  'id, codigo_empleado, nombre_completo, departamento, tipo_contrato, created_at, shift_id, department_id, position_id, company_shifts(name), hr_departments(name), hr_positions(name)';

export const EMPLOYEE_DOMAIN_SELECT =
  'id, tenant_id, branch_id, nombre, apellidos, apellido, dni, cargo, departamento, estado, user_id';

export const PROD_DIAGNOSTICO_SELECT =
  'id, tenant_id, branch_id, orden_logistica_id, tecnico_id, estado, observaciones';
export const PROD_REPARACION_SELECT =
  'id, tenant_id, branch_id, diagnostico_id, tecnico_id, estado, repuestos_usados, tiempo_invertido';

export const PRODUCTION_ORDER_SELECT =
  'id, po_number, status, target_quantity, technology_id, model_id, requested_by_name, notes, created_at';

export const SERVICE_ORDER_OPS_STATE_SELECT =
  'service_order_id, state_code, state_label, source_channel, series_status, tray_active, tray_excluded, updated_at';

export const SAP_UPLOAD_SELECT =
  'id, archivo, hash_sha256, fecha, usuario, registros, encontrados, no_encontrados, inconsistencias, tiempo_proceso, estado';

export const ZK_RAW_LOG_SELECT = 'id, user_pin, check_time, processed';
export const ZK_COMMAND_SELECT = 'id, command_str, device_sn, status, created_at';
export const OUTBOX_EVENT_SELECT =
  'id, event_name, payload, attempts, created_at, status, next_retry';

export const EMPLOYEE_BIOMETRIC_EMBEDDING_SELECT =
  'id, employee_id, embedding, pose, quality, model, active';
export const EMPLOYEE_REGISTER_LIST_SELECT = 'id, codigo_empleado, nombre_completo';
export const EMPLOYEE_KIOSK_VERIFY_SELECT =
  'id, codigo_empleado, nombre_completo, shift_id, company_shifts(id, name, weekly_schedule, ventana_desayuno_inicio, ventana_desayuno_fin, ventana_almuerzo_inicio, ventana_almuerzo_fin)';
export const EMPLOYEE_FACE_EMBEDDING_SELECT =
  'id, employee_id, embedding, pose, quality, brightness, sharpness, contrast, face_size, tilt, model, created_at, active';
export const COMPANY_SHIFT_KIOSK_SELECT =
  'id, name, weekly_schedule, ventana_desayuno_inicio, ventana_desayuno_fin, ventana_almuerzo_inicio, ventana_almuerzo_fin';
export const RRHH_ASISTENCIA_SELECT =
  'id, empleado_id, fecha, entrada, salida, tipo, horas_trabajadas';
export const TIME_LOG_KIOSK_SELECT =
  'id, employee_id, timestamp, evento_detectado, minutos_retraso_entrada, minutos_exceso_almuerzo, minutos_salida_anticipada, minutos_extra, es_dia_extra, attendance_session_id';

export const EMPLOYEE_CURRENT_STATUS_SELECT =
  'employee_id, estado_actual, ultimo_evento, llego_tarde_hoy, fecha_estado, updated_at, attendance_session_id';

export const EMPLOYEE_PAYROLL_OBLIGATIONS_SELECT =
  'id, codigo_empleado, nombre_completo, sueldo_mensual_base, bono_metas, hr_departments(name)';

export const EMPLOYEE_REPORT_SELECT =
  'id, codigo_empleado, nombre_completo, tipo_contrato, estado_rrhh, fecha_inicio_labores, hr_departments(name), hr_positions(name), company_shifts(name, weekly_schedule, ventana_desayuno_inicio, ventana_desayuno_fin, ventana_almuerzo_inicio, ventana_almuerzo_fin)';

export const TIME_LOG_REPORT_SELECT =
  'id, employee_id, timestamp, evento_detectado, tipo_jornada, es_dia_extra, estado_marcacion, hora_entrada_prog, hora_salida_prog, tardanza_segundos, minutos_retraso_entrada, salida_anticipada_segundos, minutos_salida_anticipada, horas_extra_segundos, minutos_extra, tiempo_desayuno_segundos, tiempo_almuerzo_segundos, minutos_exceso_almuerzo, justificacion, employees(id, codigo_empleado, nombre_completo, company_shifts(name, weekly_schedule, ventana_desayuno_inicio, ventana_desayuno_fin, ventana_almuerzo_inicio, ventana_almuerzo_fin)), time_justifications(estado, descripcion, resolucion)';

export const TIME_LOG_AUDIT_SELECT =
  'id, timestamp, evento_detectado, minutos_retraso_entrada, minutos_exceso_almuerzo, minutos_salida_anticipada, es_dia_extra, employees(id, nombre_completo, codigo_empleado), time_justifications(id, descripcion, resolucion)';

export const EMPLOYEE_ABSENCE_AUDIT_SELECT =
  'id, fecha, tipo_falta, employees(nombre_completo)';

export const LOG_ORDEN_SERVICIO_SELECT =
  'id, tenant_id, branch_id, equipo_id, tipo_recepcion, estado_recepcion, diagnostico_inicial, falla_reportada, guia_px, transporte, version, is_deleted, equipo:log_equipo(id, numero_serie, marca, modelo, tipo_dispositivo)';
