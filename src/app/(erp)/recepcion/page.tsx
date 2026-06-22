// @ts-nocheck
"use client";

import React, { useState, useEffect } from 'react';
import { ModulePage } from '@/components/module-page';
import { ReceptionHeader } from './components/ReceptionHeader';
import { PxReceptionTab } from './components/PxReceptionTab';
import { CacReceptionTab } from './components/CacReceptionTab';
import { HistoryTab } from './components/HistoryTab';

// Hooks
import { useReceptionPX } from './hooks/useReceptionPX';
import { validatePxFinalizeReadiness, validatePxIncrementalFinalizeReadiness, canCreateNewPxBox } from './utils/pxBoxUtils';
import { useReceptionCAC } from './hooks/useReceptionCAC';
import { useReceptionScanner } from './hooks/useReceptionScanner';
import { useReceptionValidation } from './hooks/useReceptionValidation';

import { receptionService } from './services/receptionService';
import { receptionRepository } from './repositories/receptionRepository';
import { printingService } from './services/printingService';
import { validationService } from './services/validationService';
import { getCarriers, getTechnologies, getBrands, getModels, getPxProviders } from '@/lib/database/config';
import { getReceptions, deletePxReceptionCascade } from '@/lib/database/receptions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { groupPxSeriesByEquipment } from './utils/pxSeriesUtils';
import { isIncrementalBoxCaptureEnabled } from '@/lib/featureFlags';
import {
  snapshotToGuideData,
  snapshotToPxUiState,
  type PxReceptionSnapshot,
} from '@/lib/database/pxReceptionCapture';
import {
  createPxBoxApi,
  fetchPxInProgressList,
  fetchPxReceptionSnapshot,
  getIncrementalReceptionIdFromSession,
  setIncrementalReceptionIdInSession,
  joinOrStartPxReceptionApi,
  scanPxEquipmentApi,
  acquireBoxLockApi,
  adjustPxBoxQuantityApi,
  closePxBoxApi,
  promotePxBoxApi,
  reopenPxBoxApi,
  updatePxReceptionHeaderApi,
  finalizePxReceptionApi,
  isPxReceptionResumable,
} from './services/pxIncrementalApi';

export default function ReceptionsPage() {
  const [moduleMode, setModuleMode] = useState<'cac' | 'px'>('cac');
  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [currentUserFullName, setCurrentUserFullName] = useState('OPERADOR_SISTEMA');
  const [currentOperatorId, setCurrentOperatorId] = useState<string | null>(null);

  // History Tab State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPilot, setFilterPilot] = useState('Todos');
  const [showTimeline, setShowTimeline] = useState<any | null>(null);
  const [timelineActiveGuide, setTimelineActiveGuide] = useState<string | null>(null);

  // Load PX State
  const pxState = useReceptionPX();
  const useIncrementalCapture = isIncrementalBoxCaptureEnabled();
  const [incrementalReceptionId, setIncrementalReceptionId] = useState<string | null>(null);
  const [boxIdByCode, setBoxIdByCode] = useState<Record<string, string>>({});
  const [boxVersionByCode, setBoxVersionByCode] = useState<Record<string, number>>({});
  const [boxMetaByCode, setBoxMetaByCode] = useState<Record<string, import('@/lib/database/pxReceptionCapture').PxBoxSnapshot>>({});
  const [receptionVersion, setReceptionVersion] = useState(1);
  const [pxInProgressList, setPxInProgressList] = useState<
    Array<{ id: string; guide_number: string; sap_document: string | null; captured_count: number; created_at: string }>
  >([]);
  const [isLoadingIncrementalResume, setIsLoadingIncrementalResume] = useState(false);
  
  // Load CAC State
  const cacState = useReceptionCAC();

  useEffect(() => {
    getSupabaseBrowserClient()?.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setCurrentOperatorId(data.user.id);
      if (data?.user?.user_metadata?.full_name) {
        setCurrentUserFullName(data.user.user_metadata.full_name);
      } else if (data?.user?.email) {
        setCurrentUserFullName(data.user.email.split('@')[0]);
      }
    });
  }, []);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'px' || mode === 'cac') setModuleMode(mode);
  }, []);

  const clearPxIncrementalOperationState = () => {
    setIncrementalReceptionIdInSession(null);
    setIncrementalReceptionId(null);
    setBoxIdByCode({});
    setBoxVersionByCode({});
    setBoxMetaByCode({});
    setReceptionVersion(1);
    pxState.setManifestItems([]);
    pxState.setScannedSeries([]);
    pxState.setClosedBoxes([]);
    pxState.setIsReceptionStarted(false);
    scannerState.setIsIndustrialScanning(false);
  };

  const applyPxSnapshot = (snapshot: PxReceptionSnapshot) => {
    if (!isPxReceptionResumable(snapshot.reception.status)) {
      clearPxIncrementalOperationState();
      return;
    }

    const ui = snapshotToPxUiState(snapshot);
    pxState.setManifestItems(ui.manifestItems);
    pxState.setScannedSeries(ui.scannedSeries);
    pxState.setClosedBoxes(ui.closedBoxes);
    setBoxIdByCode(ui.boxIdByCode);
    setBoxVersionByCode(ui.boxVersionByCode);
    setBoxMetaByCode(ui.boxMetaByCode);
    setReceptionVersion(snapshot.reception.version ?? 1);
    pxState.setGuideData((prev) => ({
      ...prev,
      ...snapshotToGuideData(snapshot),
      guia: snapshot.reception.guide_number,
    }));
    pxState.setIsReceptionStarted(true);
    setIncrementalReceptionId(snapshot.reception.id);
    setIncrementalReceptionIdInSession(snapshot.reception.id);
  };

  useEffect(() => {
    if (!useIncrementalCapture || moduleMode !== 'px') return;

    fetchPxInProgressList()
      .then(setPxInProgressList)
      .catch((err) => console.error('px in-progress list:', err));

    const sessionId = getIncrementalReceptionIdFromSession();
    if (!sessionId) return;

    setIsLoadingIncrementalResume(true);
    fetchPxReceptionSnapshot(sessionId)
      .then(applyPxSnapshot)
      .catch((err) => {
        console.error('resume px reception:', err);
        setIncrementalReceptionIdInSession(null);
      })
      .finally(() => setIsLoadingIncrementalResume(false));
  }, [moduleMode, useIncrementalCapture]);

  useEffect(() => {
    if (!useIncrementalCapture || !incrementalReceptionId || moduleMode !== 'px') return;
    const interval = setInterval(() => {
      fetchPxReceptionSnapshot(incrementalReceptionId)
        .then(applyPxSnapshot)
        .catch((err) => console.error('px poll:', err));
    }, 4000);
    return () => clearInterval(interval);
  }, [useIncrementalCapture, incrementalReceptionId, moduleMode]);

  // Load Scanner State
  const scannerState = useReceptionScanner();

  // Load Validation logic
  const validationState = useReceptionValidation();

  // --- SUBMIT LÓGICA (STRANGLER FIG) ---
  const handleFinalizeCAC = async () => {
    try {
      cacState.setCacError('');

      if (cacState.cacScannedItems.length === 0) {
        alert('No hay guías escaneadas.');
        return;
      }

      const result = await receptionService.finalizeCACReception({
        cacScannedItems: cacState.cacScannedItems,
        cacCarrier: cacState.cacCarrier,
        cacPilot: cacState.cacPilot,
        cacAgency: cacState.cacAgency,
        cacTotalCajas: cacState.cacTotalCajas
      }, currentUserFullName);
      
      if (result && result.error) {
        throw new Error(result.error);
      }
      
      alert('Recepción CAC guardada. Pendiente de clasificación en Backoffice.');
      cacState.setCacScannedItems([]);
      scannerState.setIsIndustrialScanning(false);
      cacState.setCacPilot('');
      cacState.setCacCarrier('');
      cacState.setCacAgency('');
      cacState.setCacTotalCajas(0);

      // Recargar el historial silenciosamente
      const historyData = await getReceptions();
      if (historyData) {
        const mappedPx: any[] = [];
        const mappedCac: any[] = [];
        for (const row of historyData) {
          const legacyRec = {
            id: row.id,
            fecha_formateada: new Date(row.created_at).toLocaleString(),
            guide_number: row.guide_number,
            carrier: row.carrier || '---',
            usuario: row.received_by || 'SISTEMA',
            received_by: row.received_by || 'SISTEMA',
            received_units: row.received_units || 1,
            status: row.status || 'RECEPCIONADA',
            notes: row.notes || '',
            sap_document: row.sap_document || '---',
            sap_orden_servicio: row.id,
            tipo: row.source.toUpperCase(),
            pilot_display: row.carrier || 'OPERADOR LOGÍSTICO',
            allGuias: row.processed_guides || []
          };
          if (row.source === 'px') mappedPx.push(legacyRec);
          else mappedCac.push(legacyRec);
        }
        pxState.setPxRecords(mappedPx);
        cacState.setCacRecords(mappedCac);
      }
    } catch (err: any) {
      cacState.setCacError(err.message || 'Error de conexión');
    }
  };

  const [isSubmittingPX, setIsSubmittingPX] = useState(false);

  const handleFinalizePX = async () => {
    if (isSubmittingPX) return;

    const resetPxFormAfterFinalize = async () => {
      try {
        localStorage.removeItem('tc_erp_px_reception_state');
      } catch {
        /* ignore */
      }
      clearPxIncrementalOperationState();
      pxState.setGuideData({
        sap: '',
        docReferencia: '',
        agencia: 'Monte Verdes',
        proveedorPx: '',
        guia: '',
        piloto: '',
        courier: '',
        totalCajasEsperadas: 1,
      });

      const historyData = await getReceptions();
      if (historyData) {
        const mappedPx: any[] = [];
        const mappedCac: any[] = [];
        for (const row of historyData) {
          const legacyRec = {
            id: row.id,
            fecha_formateada: new Date(row.created_at).toLocaleString(),
            guide_number: row.guide_number,
            carrier: row.carrier || '---',
            usuario: row.received_by || 'SISTEMA',
            received_by: row.received_by || 'SISTEMA',
            received_units: row.received_units || 1,
            status: row.status || 'RECEPCIONADA',
            notes: row.notes || '',
            sap_document: row.sap_document || '---',
            sap_orden_servicio: row.id,
            tipo: row.source.toUpperCase(),
            pilot_display: row.carrier || 'OPERADOR LOGÍSTICO',
            allGuias: row.processed_guides || [],
          };
          if (row.source === 'px') mappedPx.push(legacyRec);
          else mappedCac.push(legacyRec);
        }
        pxState.setPxRecords(mappedPx);
        cacState.setCacRecords(mappedCac);
      }

      if (useIncrementalCapture) {
        fetchPxInProgressList().then(setPxInProgressList).catch(console.error);
      }
    };

    if (useIncrementalCapture && incrementalReceptionId) {
      try {
        const readiness = validatePxIncrementalFinalizeReadiness(
          boxMetaByCode,
          pxState.closedBoxes,
          pxState.scannedSeries
        );
        if (!readiness.ok) {
          alert(readiness.reason);
          return;
        }

        const snapshot = await fetchPxReceptionSnapshot(incrementalReceptionId);
        const declaredExpected = snapshot.boxes.reduce(
          (acc, b) => acc + (b.captured_count > 0 ? b.declared_quantity : 0),
          0
        );
        const expected =
          snapshot.reception.expected_units_sap && snapshot.reception.expected_units_sap > 0
            ? snapshot.reception.expected_units_sap
            : declaredExpected;
        const received = snapshot.total_captured;

        let varianceReason: string | undefined;
        if (expected > 0 && received !== expected) {
          varianceReason = window
            .prompt(
              `Recepción parcial: esperado ${expected}, capturados ${received}.\n\nIndique motivo (obligatorio):`
            )
            ?.trim();
          if (!varianceReason) return;
        }

        const partialNote =
          expected > 0 && received !== expected
            ? `\nEstado: RECEPCION_PARCIAL (${received}/${expected})`
            : '';

        if (
          !window.confirm(
            `¿Finalizar recepción ${snapshot.reception.guide_number}?\n\n${received} equipos → Bodega Central (cajas BOX-xxx).${partialNote}\n\nNo podrá editar después.`
          )
        ) {
          return;
        }

        setIsSubmittingPX(true);

        const result = await finalizePxReceptionApi({
          receptionId: incrementalReceptionId,
          expectedVersion: snapshot.reception.version ?? receptionVersion,
          varianceReason,
          operatorId: currentOperatorId,
          operatorName: currentUserFullName,
        });

        if (result.already_finalized) {
          alert(`La recepción ${result.guide_number} ya estaba finalizada.`);
        } else if (result.is_partial) {
          alert(
            `Recepción ${result.guide_number} finalizada como PARCIAL.\n${result.received_units} equipos ingresados a Bodega Central (${result.received_units}/${result.expected_units}).`
          );
        } else {
          alert(
            `Recepción ${result.guide_number} finalizada.\n${result.received_units} equipos ingresados a Bodega Central.`
          );
        }

        await resetPxFormAfterFinalize();
      } catch (err: any) {
        console.error(err);
        alert(err.message || 'Error al finalizar recepción');
      } finally {
        setIsSubmittingPX(false);
      }
      return;
    }

    try {
      const readiness = validatePxFinalizeReadiness(
        pxState.manifestItems,
        pxState.scannedSeries,
        pxState.closedBoxes
      );
      if (!readiness.ok) {
        alert(readiness.reason);
        return;
      }

      if (
        !window.confirm(
          `¿Finalizar recepción PX?\n\nSe enviarán ${readiness.boxCodes.length} caja(s) con ${pxState.scannedSeries.length} equipos a Bodega Central.\n\nNo podrá editar esta recepción después.`
        )
      ) {
        return;
      }

      setIsSubmittingPX(true);

      // Utilizamos la lógica Legacy directamente para asegurar el ingreso a Bodega General
      const result = await receptionService.finalizePXReception(
        pxState.guideData,
        pxState.manifestItems,
        pxState.scannedSeries,
        systemBrands,
        systemModels,
        currentUserFullName
      );

      if (result && result.error) {
        throw new Error(result.error);
      }

      alert('Recepción PX finalizada. Equipos ingresados a Bodega Central (cajas BOX-xxx).');

      await resetPxFormAfterFinalize();

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error de conexión');
    } finally {
      setIsSubmittingPX(false);
    }
  };
  
  // --- CONFIG STATE ---
  const [transportes, setTransportes] = useState<any[]>([]);
  const [systemTechnologies, setSystemTechnologies] = useState<any[]>([]);
  const [systemBrands, setSystemBrands] = useState<any[]>([]);
  const [systemModels, setSystemModels] = useState<any[]>([]);
  const [systemPxProviders, setSystemPxProviders] = useState<any[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<any[]>([]);
  const [filteredModels, setFilteredModels] = useState<any[]>([]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [techs, brnds, mdls, pxProvs, carriers] = await Promise.all([
          getTechnologies(),
          getBrands(),
          getModels(),
          getPxProviders(),
          getCarriers()
        ]);
        setSystemTechnologies(techs || []);
        setSystemBrands(brnds || []);
        setSystemModels(mdls || []);
        setSystemPxProviders(pxProvs || []);
        setTransportes(carriers || []);
        
        if (techs?.length > 0) pxState.setCurrentEntry(prev => ({ ...prev, tecnologia: techs[0].name }));
        if (brnds?.length > 0) pxState.setCurrentEntry(prev => ({ ...prev, marca: brnds[0].name }));
        if (mdls?.length > 0) pxState.setCurrentEntry(prev => ({ ...prev, modelo: mdls[0].name }));
        if (pxProvs?.length > 0) pxState.setGuideData(prev => ({ ...prev, proveedorPx: pxProvs[0].name }));
      } catch (err) {
        console.error('Error fetching config', err);
      }
    };
    fetchConfig();

    const fetchHistory = async () => {
      try {
        const data = await getReceptions();
        
        if (data) {
          const mappedPx: any[] = [];
          const mappedCac: any[] = [];
          
          for (const row of data) {
            // Already in legacy format, but ensure proper shape for HistoryTab
            const legacyRec = {
              id: row.id,
              created_at: row.created_at,
              fecha_formateada: new Date(row.created_at).toLocaleString(),
              guide_number: row.guide_number,
              carrier: row.carrier || '---',
              usuario: row.received_by || 'SISTEMA',
              received_by: row.received_by || 'SISTEMA',
              received_units: row.received_units || 1,
              status: row.status || 'RECEPCIONADA',
              notes: row.notes || '',
              sap_document: row.sap_document || '---',
              sap_orden_servicio: row.id,
              tipo: row.source.toUpperCase(),
              pilot_display: row.notes?.split('Piloto: ')?.[1]?.split('\n')?.[0]?.trim() || row.carrier || 'OPERADOR LOGÍSTICO',
              allGuias: row.processed_guides || []
            };
            
            if (row.source === 'px') {
              mappedPx.push(legacyRec);
            } else {
              mappedCac.push(legacyRec);
            }
          }
          
          pxState.setPxRecords(mappedPx);
          cacState.setCacRecords(mappedCac);
        }
      } catch(err) {
        console.error('Error fetching history', err);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    setFilteredBrands(systemBrands);
  }, [systemBrands]);

  useEffect(() => {
    let filtered = systemModels;
    
    if (pxState.currentEntry.marca) {
      const brandId = systemBrands.find(b => b.name === pxState.currentEntry.marca)?.id;
      filtered = filtered.filter(m => m.brand_id === brandId);
    }
    
    if (pxState.currentEntry.tecnologia) {
      const techId = systemTechnologies.find(t => t.name === pxState.currentEntry.tecnologia)?.id;
      filtered = filtered.filter(m => m.technology_id === techId);
    }
    
    setFilteredModels(filtered);
  }, [pxState.currentEntry.marca, pxState.currentEntry.tecnologia, systemBrands, systemTechnologies, systemModels]);


  
  const handleAddCaja = () => {
    const { currentEntry, setManifestItems, manifestItems, setCurrentEntry, setSelectedBoxForScan } = pxState;
    if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
      alert("Por favor, complete tecnología, marca, modelo y cantidad esperada.");
      return;
    }
    
    const newBoxCode = `PX-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    setManifestItems([...manifestItems, {
      id: Math.random().toString(36).substr(2, 9),
      boxCode: newBoxCode,
      ...currentEntry,
      material: ''
    }]);

    setSelectedBoxForScan(newBoxCode);
    
    setCurrentEntry({
      ...currentEntry,
      totalEsperado: 0
    });
  };

  const handleAddSN_PX = async (e: React.FormEvent) => {
    e.preventDefault();
    const { selectedBoxForScan, currentScans, manifestItems, scannedSeries, setScannedSeries, setCurrentScans } = pxState;

    if (!selectedBoxForScan) {
      alert("Seleccione una caja primero.");
      return;
    }

    if (!currentScans[0] || currentScans[0].trim() === '') {
      return;
    }

    const serialNum = currentScans[0].trim().toUpperCase();
    const validScans = currentScans.map(s => s?.trim().toUpperCase()).filter(s => s !== '');

    if (new Set(validScans).size !== validScans.length) {
      alert("Ha ingresado series duplicadas en los campos de escaneo.");
      return;
    }

    const isDuplicateInScanned = scannedSeries.some((s: any) =>
      validScans.includes(s.sn) ||
      validScans.includes(s.s2) ||
      validScans.includes(s.s3) ||
      validScans.includes(s.s4)
    );

    if (isDuplicateInScanned) {
      alert("Una o más series ingresadas ya han sido escaneadas en esta recepción.");
      return;
    }

    if (useIncrementalCapture && incrementalReceptionId) {
      const boxId = boxIdByCode[selectedBoxForScan];
      if (!boxId) {
        alert('Esta caja aún no está registrada en servidor. Agregue al menos un lote primero.');
        return;
      }

      const meta = boxMetaByCode[selectedBoxForScan];
      const hasLock =
        meta?.locked_by &&
        (!currentOperatorId || meta.locked_by === currentOperatorId);
      if (!hasLock) {
        const locked = await handleAcquireBoxLock(selectedBoxForScan, boxId);
        if (!locked) return;
      }

      const boxLots = manifestItems.filter((i: any) => i.boxCode === selectedBoxForScan);
      const firstLot = boxLots[0];
      const brandId = systemBrands.find((b: any) => b.name === firstLot?.marca)?.id || null;
      const modelId = systemModels.find((m: any) => m.name === firstLot?.modelo)?.id || null;

      try {
        await scanPxEquipmentApi({
          receptionId: incrementalReceptionId,
          boxId,
          mainSerial: serialNum,
          serialS2: currentScans[1]?.trim().toUpperCase(),
          serialS3: currentScans[2]?.trim().toUpperCase(),
          serialS4: currentScans[3]?.trim().toUpperCase(),
          brandId,
          modelId,
          material: firstLot?.material,
          operatorId: currentOperatorId,
          operatorName: currentUserFullName,
        });

        const snapshot = await fetchPxReceptionSnapshot(incrementalReceptionId);
        applyPxSnapshot(snapshot);
        setCurrentScans(['', '', '', '']);
        setTimeout(() => {
          document.getElementById('scan-input-0')?.focus();
        }, 10);
      } catch (err: any) {
        alert(err.message || 'Error al capturar equipo');
      }
      return;
    }

    const box = manifestItems.find((i: any) => i.boxCode === selectedBoxForScan);
    if (!box) return;

    const boxStats = manifestItems
      .filter((i: any) => i.boxCode === selectedBoxForScan)
      .reduce((acc: number, i: any) => acc + (i.totalEsperado || 0), 0);
    const currentCount = scannedSeries.filter((s: any) => s.boxCode === selectedBoxForScan).length;
    if (currentCount >= boxStats) {
      alert(`La caja ${selectedBoxForScan} ya alcanzó su capacidad de ${boxStats} equipos.`);
      return;
    }

    // 2. Validación de estado en Base de Datos
    try {
      for (const scan of validScans) {
        const validation = await validationService.checkSerialInSystem(scan);
        if (validation.blocked) {
          alert(validation.info);
          return;
        }
      }
    } catch (err: any) {
      console.error(err);
      alert("Error validando serie en base de datos: " + err.message);
      return;
    }

    setScannedSeries([
      ...scannedSeries,
      {
        boxCode: selectedBoxForScan,
        sn: serialNum,
        s2: currentScans[1]?.trim().toUpperCase(),
        s3: currentScans[2]?.trim().toUpperCase(),
        s4: currentScans[3]?.trim().toUpperCase(),
        material: box.material
      }
    ]);

    setCurrentScans(['', '', '', '']);
    setTimeout(() => {
      document.getElementById('scan-input-0')?.focus();
    }, 10);
  };

  const handleStartReceptionIncremental = async (): Promise<boolean> => {
    if (!pxState.guideData.sap || !pxState.guideData.proveedorPx) {
      alert('Por favor complete al menos el Número de Pedido y Proveedor PX');
      return false;
    }
    const headerCheck = await receptionRepository.validatePxHeaderUniqueness(
      pxState.guideData.sap,
      pxState.guideData.docReferencia
    );
    if (!headerCheck.ok) {
      alert(headerCheck.message);
      return false;
    }

    try {
      const result = await joinOrStartPxReceptionApi({
        guideData: pxState.guideData,
        operatorName: currentUserFullName,
        operatorId: currentOperatorId,
        preferredGuideNumber: pxState.guideData.guia?.trim(),
      });
      pxState.setGuideData((prev) => ({ ...prev, guia: result.guideNumber }));
      setIncrementalReceptionId(result.receptionId);
      setIncrementalReceptionIdInSession(result.receptionId);
      pxState.setIsReceptionStarted(true);
      if (result.joined) {
        const snapshot = await fetchPxReceptionSnapshot(result.receptionId);
        applyPxSnapshot(snapshot);
      }
      const list = await fetchPxInProgressList();
      setPxInProgressList(list);
      return true;
    } catch (err: any) {
      alert(err.message || 'No se pudo iniciar la recepción en servidor.');
      return false;
    }
  };

  const handleResumePxReception = async (receptionId: string) => {
    setIsLoadingIncrementalResume(true);
    try {
      const snapshot = await fetchPxReceptionSnapshot(receptionId);
      if (!isPxReceptionResumable(snapshot.reception.status)) {
        clearPxIncrementalOperationState();
        fetchPxInProgressList().then(setPxInProgressList).catch(console.error);
        alert('Esta recepción ya fue finalizada. Consulte el historial.');
        return;
      }
      applyPxSnapshot(snapshot);
    } catch (err: any) {
      alert(err.message || 'No se pudo recuperar la recepción.');
    } finally {
      setIsLoadingIncrementalResume(false);
    }
  };

  const handleAddLotToBoxIncremental = async (
    targetBoxCode: string,
    entry: typeof pxState.currentEntry
  ): Promise<boolean> => {
    if (!incrementalReceptionId) {
      alert('Inicie la recepción antes de agregar lotes.');
      return false;
    }
    if (!entry.tecnologia || !entry.marca || !entry.modelo || !entry.totalEsperado) {
      alert('Complete tecnología, marca, modelo y cantidad esperada.');
      return false;
    }

    const brandId = systemBrands.find((b: any) => b.name === entry.marca)?.id || null;
    const modelId = systemModels.find((m: any) => m.name === entry.modelo)?.id || null;

    try {
      if (!boxIdByCode[targetBoxCode]) {
        const limitCheck = canCreateNewPxBox(boxMetaByCode, pxState.guideData.totalCajasEsperadas || 1);
        if (!limitCheck.ok) {
          alert(limitCheck.reason);
          return false;
        }
        await createPxBoxApi(incrementalReceptionId, targetBoxCode, [
          {
            technologyName: entry.tecnologia,
            brandId,
            modelId,
            brandName: entry.marca,
            modelName: entry.modelo,
            expectedUnits: entry.totalEsperado,
          },
        ]);
      } else {
        alert(
          'En captura incremental, configure la cantidad total al crear la caja. Edición de lotes adicionales llegará en Fase 3.'
        );
        return false;
      }

      const snapshot = await fetchPxReceptionSnapshot(incrementalReceptionId);
      const newBoxId = snapshot.boxes.find((b) => b.box_code === targetBoxCode)?.id;
      applyPxSnapshot(snapshot);
      pxState.setSelectedBoxForScan(targetBoxCode);
      if (!newBoxId) {
        alert('No se encontró la caja en servidor.');
        return false;
      }
      const locked = await handleAcquireBoxLock(targetBoxCode, newBoxId);
      if (!locked) return false;
      return true;
    } catch (err: any) {
      alert(err.message || 'Error al registrar la caja en servidor.');
      return false;
    }
  };

  const handleAcquireBoxLock = async (boxCode: string, boxIdOverride?: string) => {
    const boxId = boxIdOverride || boxIdByCode[boxCode];
    if (!boxId) {
      alert('Caja no registrada en servidor. Agregue un lote primero.');
      return false;
    }
    try {
      await acquireBoxLockApi({
        boxId,
        operatorId: currentOperatorId,
        operatorName: currentUserFullName,
      });
      if (incrementalReceptionId) {
        const snapshot = await fetchPxReceptionSnapshot(incrementalReceptionId);
        applyPxSnapshot(snapshot);
      }
      return true;
    } catch (err: any) {
      alert(err.message || 'No se pudo tomar control de la caja.');
      return false;
    }
  };

  const handleAdjustBoxQuantity = async (
    boxCode: string,
    newQuantity: number,
    reason: string
  ): Promise<boolean> => {
    const boxId = boxIdByCode[boxCode];
    const version = boxVersionByCode[boxCode];
    if (!boxId || !version) return false;
    try {
      await adjustPxBoxQuantityApi({
        boxId,
        newDeclaredQuantity: newQuantity,
        reason,
        expectedVersion: version,
        operatorId: currentOperatorId,
        operatorName: currentUserFullName,
      });
      if (incrementalReceptionId) {
        const snapshot = await fetchPxReceptionSnapshot(incrementalReceptionId);
        applyPxSnapshot(snapshot);
      }
      return true;
    } catch (err: any) {
      alert(err.message || 'Error al ajustar cantidad.');
      return false;
    }
  };

  const handleCloseBoxIncremental = async (boxCode: string): Promise<boolean> => {
    const boxId = boxIdByCode[boxCode];
    const version = boxVersionByCode[boxCode];
    const meta = boxMetaByCode[boxCode];
    if (!boxId || !version || !meta) return false;

    const captured = meta.captured_count;
    const declared = meta.declared_quantity;
    let partialReason: string | undefined;

    if (captured < declared) {
      partialReason = window.prompt(
        `Caja incompleta (${captured}/${declared}).\n\nIndique motivo de caja parcial, o cancele para ajustar la cantidad esperada primero:`
      )?.trim();
      if (!partialReason) return false;
    } else if (!window.confirm(`¿Cerrar ${boxCode} con ${captured}/${declared} equipos?`)) {
      return false;
    }

    try {
      await closePxBoxApi({
        boxId,
        expectedVersion: version,
        partialReason,
        operatorId: currentOperatorId,
        operatorName: currentUserFullName,
      });
      try {
        await promotePxBoxApi({
          boxId,
          operatorId: currentOperatorId,
          operatorName: currentUserFullName,
        });
      } catch (promoteErr: any) {
        console.warn('Promote on close:', promoteErr?.message);
      }
      if (incrementalReceptionId) {
        const snapshot = await fetchPxReceptionSnapshot(incrementalReceptionId);
        applyPxSnapshot(snapshot);
      }
      pxState.setSelectedBoxForScan(null);
      return true;
    } catch (err: any) {
      alert(err.message || 'Error al cerrar caja.');
      return false;
    }
  };

  const handleReopenBoxIncremental = async (boxCode: string): Promise<boolean> => {
    const boxId = boxIdByCode[boxCode];
    const version = boxVersionByCode[boxCode];
    if (!boxId || !version) return false;

    const reason = window
      .prompt(
        `¿Reabrir ${boxCode}?\n\nPodrá volver a escanear y ajustar. Indique motivo (opcional):`
      )
      ?.trim();

    try {
      await reopenPxBoxApi({
        boxId,
        expectedVersion: version,
        reason: reason || undefined,
        operatorId: currentOperatorId,
        operatorName: currentUserFullName,
      });
      if (incrementalReceptionId) {
        const snapshot = await fetchPxReceptionSnapshot(incrementalReceptionId);
        applyPxSnapshot(snapshot);
      }
      await handleAcquireBoxLock(boxCode, boxId);
      return true;
    } catch (err: any) {
      alert(err.message || 'Error al reabrir caja.');
      return false;
    }
  };

  const handleSaveHeaderIncremental = async (): Promise<boolean> => {
    if (!incrementalReceptionId) return false;
    try {
      const snapshot = await updatePxReceptionHeaderApi({
        receptionId: incrementalReceptionId,
        guideData: pxState.guideData,
        operatorName: currentUserFullName,
        expectedVersion: receptionVersion,
      });
      applyPxSnapshot(snapshot);
      return true;
    } catch (err: any) {
      alert(err.message || 'No se pudo guardar la cabecera.');
      return false;
    }
  };

  const handlePrintPXManifest = async (rec: any) => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const { data: boxes, error: boxError } = await supabase
        .from('boxes')
        .select('*, brands(name), models(name, technologies(name))')
        .eq('reception_id', rec.id);

      if (boxError) throw boxError;

      const { data: series, error: seriesError } = await supabase
        .from('series')
        .select('serial_number, service_order_id, current_box_id, material')
        .eq('current_reception_id', rec.id);

      if (seriesError) throw seriesError;

      const { data: serviceOrders } = await supabase
        .from('service_orders')
        .select('id, main_serial')
        .eq('reception_id', rec.id);

      const boxCodeById = Object.fromEntries((boxes || []).map((b: any) => [b.id, b.box_code]));
      const mappedSeries = groupPxSeriesByEquipment(series || [], serviceOrders || [], boxCodeById);

      const manifestBoxes = (boxes || []).map((b: any) => ({
        ...b,
        boxCode: b.box_code,
        marca: b.brands?.name || 'N/A',
        modelo: b.models?.name || 'N/A',
        tecnologia: b.models?.technologies?.name || 'EQUIPO',
        totalEsperado: b.capacity || 0
      }));

      printingService.printPXManifest(rec, mappedSeries, manifestBoxes);
    } catch (error: any) {
      alert("Error al obtener datos para impresión: " + error.message);
    }
  };

  const handlePrintLabelsPX = async (rec: any) => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const { data: boxes, error: boxError } = await supabase
        .from('boxes')
        .select('*, brands(name), models(name, technologies(name))')
        .eq('reception_id', rec.id);

      if (boxError) throw boxError;
      if (!boxes || boxes.length === 0) {
        alert("No hay cajas para imprimir en esta recepción.");
        return;
      }

      const manifestBoxes = boxes.map((b: any) => ({
        ...b,
        boxCode: b.box_code,
        marca: b.brands?.name || 'N/A',
        modelo: b.models?.name || 'N/A',
        tecnologia: b.models?.technologies?.name || 'EQUIPO',
        totalEsperado: b.capacity || 0
      }));

      printingService.printAllBoxLabels(manifestBoxes);
    } catch (error: any) {
      alert("Error al obtener datos para etiquetas: " + error.message);
    }
  };

  const handlePrintCACWrapper = async (item: any) => {
    let allGuias = item.allGuias || [];
    if (allGuias.length === 0 || (allGuias.length === 1 && item.received_units > 1)) {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data } = await supabase.from('series').select('serial_number').eq('current_reception_id', item.id);
        if (data && data.length > 0) {
          allGuias = data.map((s: any) => s.serial_number);
        }
      }
    }
    if (allGuias.length === 0 && item.guide_number) {
      allGuias = [item.guide_number];
    }
    printingService.printCACAcuse({ ...item, allGuias });
  };

  return (
    <ModulePage
      title={moduleMode === 'px' ? "Recepción Planta Externa (PX)" : "Recepción de Carga (CAC)"}
      category="Logística"
      actions={
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setModuleMode('px')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'px' ? 'bg-[#181c3a] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Módulo PX
          </button>
          <button 
            onClick={() => setModuleMode('cac')}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${moduleMode === 'cac' ? 'bg-[#181c3a] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Módulo CAC
          </button>
        </div>
      }
    >
      <ReceptionHeader 
        moduleMode={moduleMode}
        setModuleMode={setModuleMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {moduleMode === 'px' && activeTab === 'scan' && (
        <PxReceptionTab {...pxState} {...scannerState} {...validationState} printBoxLabel={printingService.printBoxLabel} systemPxProviders={systemPxProviders} systemTechnologies={systemTechnologies} filteredBrands={filteredBrands} filteredModels={filteredModels} systemModels={systemModels} moduleMode={moduleMode} handleFinalizePX={handleFinalizePX} isSubmittingPX={isSubmittingPX} handleAddCaja={handleAddCaja} handleAddSN_PX={handleAddSN_PX} isReceptionStarted={pxState.isReceptionStarted} setIsReceptionStarted={pxState.setIsReceptionStarted} useIncrementalCapture={useIncrementalCapture} onStartReceptionIncremental={handleStartReceptionIncremental} onAddLotToBoxIncremental={handleAddLotToBoxIncremental} pxInProgressList={pxInProgressList} onResumePxReception={handleResumePxReception} isLoadingIncrementalResume={isLoadingIncrementalResume} incrementalReceptionId={incrementalReceptionId} boxMetaByCode={boxMetaByCode} onAcquireBoxLock={handleAcquireBoxLock} onAdjustBoxQuantity={handleAdjustBoxQuantity} onCloseBoxIncremental={handleCloseBoxIncremental} onReopenBoxIncremental={handleReopenBoxIncremental} onSaveHeaderIncremental={handleSaveHeaderIncremental} currentOperatorId={currentOperatorId} />
      )}

      {moduleMode === 'cac' && activeTab === 'scan' && (
        <CacReceptionTab {...cacState} {...scannerState} {...validationState} handlePrintCAC={handlePrintCACWrapper} transportes={transportes} handleFinalizeCAC={handleFinalizeCAC} />
      )}

      {activeTab === 'history' && (
        <HistoryTab 
           moduleMode={moduleMode}
           pxRecords={pxState.pxRecords}
           cacRecords={cacState.cacRecords}
           searchTerm={searchTerm}
           setSearchTerm={setSearchTerm}
           filterPilot={filterPilot}
           setFilterPilot={setFilterPilot}
           showTimeline={showTimeline}
           setShowTimeline={setShowTimeline}
           timelineActiveGuide={timelineActiveGuide}
           setTimelineActiveGuide={setTimelineActiveGuide}
           setPxRecords={pxState.setPxRecords}
           handlePrintCAC={handlePrintCACWrapper}
           handlePrintPX={handlePrintPXManifest}
           handlePrintLabelsPX={handlePrintLabelsPX}
           handleViewPxDetails={() => {}}
           handleDeleteHistoryPX={async (id: string) => {
             try {
               const result = await deletePxReceptionCascade(id);
               if (result?.error) throw new Error(result.error);
               pxState.setPxRecords((prev: any[]) => prev.filter((r: any) => r.id !== id));
             } catch (err: any) {
               alert('Error al eliminar recepción PX: ' + err.message);
             }
           }}
           handleDeleteHistoryCAC={async (id: string) => {
             const confirmDelete = window.confirm('¿Está seguro de eliminar esta recepción y todos sus sub-procesos asociados?');
             if (!confirmDelete) return;
             try {
               const supabase = getSupabaseBrowserClient();
               
               // Buscar las series asociadas a esta recepción
               const { data: seriesList } = await supabase.from('series').select('id').eq('current_reception_id', id);
               
               if (seriesList && seriesList.length > 0) {
                 const seriesIds = seriesList.map((s: any) => s.id);
                 
                 // Buscar service_orders de estas series
                 const { data: soList } = await supabase.from('service_orders').select('id').in('series_id', seriesIds);
                 
                 if (soList && soList.length > 0) {
                   const soIds = soList.map((so: any) => so.id);
                   // Eliminar tablas dependientes de service_orders
                   await supabase.from('workshop_jobs').delete().in('service_order_id', soIds);
                   await supabase.from('qc_checks').delete().in('service_order_id', soIds);
                   // Si hay una tabla diagnostico
                   await supabase.from('diagnostico').delete().in('service_order_id', soIds).catch(() => {});
                   
                   // Eliminar service_orders
                   await supabase.from('service_orders').delete().in('series_id', seriesIds);
                 }
                 
                 // Eliminar de box_series
                 await supabase.from('box_series').delete().in('series_id', seriesIds);
                 
                 // Eliminar series
                 await supabase.from('series').delete().in('id', seriesIds);
               }
               
               // Marcar cajas como eliminadas para mantener el consecutivo de IDs
               await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('reception_id', id);

               // Finalmente actualizar el estatus de la recepción
               const { error } = await supabase.from('receptions').update({ status: 'ELIMINADO' }).eq('id', id);
               if (error) throw error;
               cacState.setCacRecords((prev: any[]) => prev.filter((r: any) => r.id !== id));
             } catch (err: any) {
               alert('Error al eliminar sub-procesos: ' + err.message);
             }
           }}
           handleEditHistoryCAC={() => {}}
        />
      )}

    </ModulePage>
  );
}
