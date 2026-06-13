"use client";

import React, { useState, useEffect } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { Boxes, Plus, X, ArrowUpRight, ArrowDownRight, Search, Activity, PackageSearch, MoreVertical, Trash2, Edit2, MapPin, ScanLine } from 'lucide-react';
import { getAccessories, createAccessory, registerAccessoryEntry, registerAccessoryDispatch, getAccessoryMovements, getAccessoryBoxes, updateAccessoryBoxStatus, deleteAccessoryBox, updateAccessoryBox, bulkUpdateAccessoryBoxLocation } from '@/lib/database/accessories';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
// @ts-ignore
import Barcode from 'react-barcode';

export default function BodegaAccesoriosPage() {
  const [accessories, setAccessories] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'inventario'|'historial'|'recuperacion'>('inventario');
  const [loading, setLoading] = useState(true);
  
  // Create accessory modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccCharacteristics, setNewAccCharacteristics] = useState('');
  const [newAccComments, setNewAccComments] = useState('');
  
  // Movement modal
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveType, setMoveType] = useState<'IN'|'OUT'>('IN');
  const [moveAccId, setMoveAccId] = useState('');
  const [moveCondition, setMoveCondition] = useState<'NEW'|'RECOVERED'>('NEW');
  const [moveInitialStatus, setMoveInitialStatus] = useState('Clasificado, Pendiente de Limpiar');
  const [moveBoxId, setMoveBoxId] = useState('');
  const [moveNumBoxes, setMoveNumBoxes] = useState('1');
  const [moveQty, setMoveQty] = useState('');
  const [moveBoxDetails, setMoveBoxDetails] = useState<string[]>(['']);
  const [moveSap, setMoveSap] = useState('');
  const [moveDest, setMoveDest] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  
  // Print Label Modal
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [generatedLabels, setGeneratedLabels] = useState<{order: string, name: string, qty: string, status: string}[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);

  // Recovery table bulk/CRUD actions
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  const [showBulkLocationModal, setShowBulkLocationModal] = useState(false);
  const [bulkLocationText, setBulkLocationText] = useState('');
  
  const [showEditBoxModal, setShowEditBoxModal] = useState(false);
  const [editBoxId, setEditBoxId] = useState('');
  const [editBoxAccId, setEditBoxAccId] = useState('');
  const [editBoxQty, setEditBoxQty] = useState('');
  const [editBoxLocation, setEditBoxLocation] = useState('');
  const [editBoxOldQty, setEditBoxOldQty] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const num = parseInt(moveNumBoxes) || 0;
    setMoveBoxDetails(prev => {
      if (num === prev.length) return prev;
      if (num > prev.length) return [...prev, ...Array(num - prev.length).fill('')];
      return prev.slice(0, num);
    });
  }, [moveNumBoxes]);

  const loadData = async () => {
    setLoading(true);
    const [accs, movs, bxs] = await Promise.all([
      getAccessories(),
      getAccessoryMovements(),
      getAccessoryBoxes()
    ]);
    setAccessories(accs);
    setMovements(movs);
    setBoxes(bxs);
    setLoading(false);
  };

  const handleCreateAccessory = async () => {
    if (!newAccName.trim()) return;
    setIsProcessing(true);
    const res = await createAccessory(newAccName, newAccCharacteristics, newAccComments);
    if (res.error) {
      alert("Error: " + res.error);
    } else {
      setNewAccName('');
      setNewAccCharacteristics('');
      setNewAccComments('');
      setShowCreateModal(false);
      await loadData();
    }
    setIsProcessing(false);
  };

  const handleMovement = async () => {
    if (moveType === 'OUT' && (!moveAccId || !moveQty || parseInt(moveQty) <= 0)) return;
    if (moveType === 'IN' && (!moveAccId || !moveNumBoxes || parseInt(moveNumBoxes) <= 0)) return;
    
    let boxQuantities: number[] = [];
    if (moveType === 'IN') {
      boxQuantities = moveBoxDetails.map(q => parseInt(q) || 0);
      if (boxQuantities.some(q => q <= 0)) {
        alert("Debes ingresar una cantidad válida mayor a 0 para todas las cajas.");
        return;
      }
    }
    
    if (moveType === 'IN' && moveCondition === 'NEW' && !moveSap.trim()) {
      alert("Debes ingresar el número de traslado SAP para accesorios nuevos.");
      return;
    }
    
    if (moveType === 'OUT' && !moveDest.trim()) {
      alert("Debes ingresar el destino del despacho.");
      return;
    }

    setIsProcessing(true);
    const qtyNum = parseInt(moveQty);

    let res;
    if (moveType === 'IN') {
      res = await registerAccessoryEntry(moveAccId, moveCondition, boxQuantities, moveCondition === 'NEW' ? moveSap : undefined, moveCondition === 'RECOVERED' ? moveInitialStatus : undefined);
    } else {
      res = await registerAccessoryDispatch(moveAccId, moveCondition, qtyNum, moveDest, undefined, moveBoxId || undefined);
    }

    if (res.error) {
      alert("Error: " + res.error);
    } else {
      setShowMoveModal(false);
      
      if (moveType === 'IN') {
        const accName = accessories.find(a => a.id === moveAccId)?.name || 'Accesorio';
        const labels: any[] = [];
        
        if (moveCondition === 'RECOVERED' && res.recoveryOrders) {
          res.recoveryOrders.forEach((order: string, i: number) => {
            labels.push({
              order,
              name: accName,
              qty: boxQuantities[i].toString(),
              status: moveInitialStatus
            });
          });
        } else if (moveCondition === 'NEW') {
          for (let i = 0; i < boxQuantities.length; i++) {
            labels.push({
              order: moveSap,
              name: accName,
              qty: boxQuantities[i].toString(),
              status: 'Nuevo'
            });
          }
        }
        
        if (labels.length > 0) {
          setGeneratedLabels(labels);
          setShowLabelModal(true);
        }
      }
      
      // Reset form
      setMoveQty('');
      setMoveNumBoxes('1');
      setMoveBoxDetails(['']);
      setMoveSap('');
      setMoveDest('');
      setMoveBoxId('');
      await loadData();
    }
    setIsProcessing(false);
  };

  const openMoveModal = (type: 'IN'|'OUT', accId?: string) => {
    setMoveType(type);
    if (accId) setMoveAccId(accId);
    else if (accessories.length > 0) setMoveAccId(accessories[0].id);
    setShowMoveModal(true);
  };

  const handleUpdateBoxStatus = async (boxId: string, newStatus: string) => {
    setIsProcessing(true);
    await updateAccessoryBoxStatus(boxId, newStatus);
    await loadData();
    setIsProcessing(false);
  };

  const toggleSelectBox = (boxId: string) => {
    setSelectedBoxes(prev => 
      prev.includes(boxId) ? prev.filter(id => id !== boxId) : [...prev, boxId]
    );
  };

  const handleSelectAllBoxes = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedBoxes(boxes.map(b => b.id));
    } else {
      setSelectedBoxes([]);
    }
  };

  const openEditBoxModal = (box: any) => {
    setEditBoxId(box.id);
    setEditBoxAccId(box.accessory_id);
    setEditBoxQty(box.quantity.toString());
    setEditBoxOldQty(box.quantity);
    setEditBoxLocation(box.location || '');
    setShowEditBoxModal(true);
  };

  const handleUpdateBox = async () => {
    const qty = parseInt(editBoxQty);
    if (!qty || qty <= 0) {
      alert("La cantidad debe ser mayor a 0");
      return;
    }
    setIsProcessing(true);
    const res = await updateAccessoryBox(editBoxId, editBoxAccId, editBoxOldQty, qty, editBoxLocation);
    if (res.error) {
      alert("Error actualizando caja: " + res.error);
    } else {
      setShowEditBoxModal(false);
      await loadData();
    }
    setIsProcessing(false);
  };

  const handleDeleteBox = async (boxId: string, boxQty: number, accId: string) => {
    if (!confirm("¿Estás seguro de eliminar esta caja? Esto descontará la cantidad del inventario general de Recuperados.")) return;
    setIsProcessing(true);
    const res = await deleteAccessoryBox(boxId, boxQty, accId);
    if (res.error) {
      alert("Error eliminando caja: " + res.error);
    } else {
      await loadData();
    }
    setIsProcessing(false);
  };

  const handleBulkLocation = async () => {
    if (selectedBoxes.length === 0) return;
    setIsProcessing(true);
    const res = await bulkUpdateAccessoryBoxLocation(selectedBoxes, bulkLocationText);
    if (res.error) {
      alert("Error actualizando ubicaciones: " + res.error);
    } else {
      setShowBulkLocationModal(false);
      setSelectedBoxes([]);
      await loadData();
    }
    setIsProcessing(false);
  };

  const openPartialDispatch = (box: any) => {
    setMoveType('OUT');
    setMoveAccId(box.accessory_id);
    setMoveCondition('RECOVERED');
    setMoveBoxId(box.id);
    setMoveQty('');
    setMoveDest('');
    setScannedBarcode('');
    setShowMoveModal(true);
  };

  const handleBarcodeScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setScannedBarcode(val);
    
    if (val.trim()) {
      const foundBox = boxes.find(b => b.recovery_order.toLowerCase() === val.trim().toLowerCase());
      if (foundBox) {
        setMoveAccId(foundBox.accessory_id);
        setMoveCondition('RECOVERED');
        setMoveBoxId(foundBox.id);
        setMoveQty(foundBox.quantity.toString());
      }
    }
  };

  return (
    <ModulePage
      title="Bodega de Accesorios"
      subtitle="Gestión de inventario de accesorios nuevos y recuperados."
      category="Bodega"
      actions={
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowCreateModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Nuevo Accesorio
          </Button>
          <Button variant="outline" onClick={() => openMoveModal('OUT')} className="text-rose-600 hover:text-rose-700" leftIcon={<ArrowUpRight className="w-4 h-4" />}>
            Despachar
          </Button>
          <Button variant="primary" onClick={() => openMoveModal('IN')} leftIcon={<ArrowDownRight className="w-4 h-4" />}>
            Ingresar
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('inventario')}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'inventario' ? 'bg-white text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Inventario Actual
          </button>
          <button 
            onClick={() => setActiveTab('recuperacion')}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'recuperacion' ? 'bg-white text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Proceso de Recuperación
          </button>
          <button 
            onClick={() => setActiveTab('historial')}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'historial' ? 'bg-white text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Historial de Movimientos
          </button>
        </div>

        {activeTab === 'inventario' ? (
          <div className="space-y-6 animate-in fade-in">
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Accesorio</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50/30">Nuevos (SAP)</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50/30">Recuperados</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50/30">Total</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {accessories.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                              <Boxes className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-black text-[#181c3a]">{acc.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 bg-emerald-50/10">
                          <span className="text-sm font-bold text-emerald-700">{acc.qty_new}</span>
                        </td>
                        <td className="px-6 py-5 bg-amber-50/10">
                          <span className="text-sm font-bold text-amber-700">{acc.qty_recovered}</span>
                        </td>
                        <td className="px-6 py-5 bg-indigo-50/10">
                          <span className="text-sm font-bold text-indigo-700">{acc.qty_new + acc.qty_recovered}</span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openMoveModal('IN', acc.id)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="Ingresar">
                              <ArrowDownRight className="w-4 h-4" />
                            </button>
                            <button onClick={() => openMoveModal('OUT', acc.id)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors" title="Despachar">
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {accessories.length === 0 && !loading && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 text-sm">No hay accesorios registrados. Crea uno nuevo.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : activeTab === 'recuperacion' ? (
          <div className="space-y-6 animate-in fade-in">
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                {selectedBoxes.length > 0 && (
                  <div className="bg-indigo-50 p-3 border-b border-indigo-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-indigo-700">{selectedBoxes.length} cajas seleccionadas</span>
                    <Button size="sm" onClick={() => setShowBulkLocationModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md text-xs h-8">
                      <MapPin className="w-3.5 h-3.5 mr-1" /> Asignar Ubicación
                    </Button>
                  </div>
                )}
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-4 w-10">
                        <input 
                          type="checkbox" 
                          onChange={handleSelectAllBoxes}
                          checked={boxes.length > 0 && selectedBoxes.length === boxes.length}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="px-2 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Orden de Recup.</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Accesorio</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cant.</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Ubicación (Rack)</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado Actual</th>
                      <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {boxes.map((box) => (
                      <tr key={box.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-4">
                          <input 
                            type="checkbox" 
                            checked={selectedBoxes.includes(box.id)}
                            onChange={() => toggleSelectBox(box.id)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-2 py-4">
                          <span className="text-sm font-black text-[#181c3a] font-mono">{box.recovery_order}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-bold text-slate-500">{new Date(box.created_at).toLocaleDateString()}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-bold text-slate-700">{box.accessories?.name}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-bold text-slate-700">{box.quantity}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-bold text-slate-700">{box.location || '-'}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={
                            box.status.includes('Limpiar') ? 'bg-rose-50 text-rose-600' :
                            box.status.includes('Probar') ? 'bg-amber-50 text-amber-600' :
                            'bg-emerald-50 text-emerald-600'
                          }>
                            {box.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {box.status === 'Clasificado, Pendiente de Limpiar' && (
                              <Button 
                                variant="outline" 
                                className="text-xs py-1 px-2 h-auto"
                                onClick={() => handleUpdateBoxStatus(box.id, 'Clasificado, Pendiente de Probar')}
                              >
                                Marcar Limpio
                              </Button>
                            )}
                            {box.status === 'Clasificado, Pendiente de Probar' && (
                              <Button 
                                className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-none shadow-none text-xs py-1 px-2 h-auto"
                                onClick={() => handleUpdateBoxStatus(box.id, 'Clasificado Y Limpio')}
                              >
                                Aprobar Pruebas
                              </Button>
                            )}
                            <button onClick={() => openEditBoxModal(box)} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors ml-2" title="Editar Cantidad/Ubicación">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => openPartialDispatch(box)} className="p-1 text-slate-400 hover:text-emerald-600 transition-colors" title="Despacho Parcial">
                              <PackageSearch className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteBox(box.id, box.quantity, box.accessory_id)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors" title="Eliminar Caja">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {boxes.length === 0 && !loading && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">No hay cajas en proceso de recuperación.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in">
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Accesorio</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cantidad</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Detalles</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Usuario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {movements.map((mov) => (
                      <tr key={mov.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-500">{new Date(mov.created_at).toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-black text-[#181c3a]">{mov.accessories?.name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {mov.movement_type === 'IN' ? (
                              <Badge className="bg-emerald-50 text-emerald-600">Entrada</Badge>
                            ) : (
                              <Badge className="bg-rose-50 text-rose-600">Salida</Badge>
                            )}
                            <Badge className={mov.condition === 'NEW' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}>
                              {mov.condition === 'NEW' ? 'Nuevo' : 'Recuperado'}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-slate-700">{mov.quantity}</span>
                        </td>
                        <td className="px-6 py-4">
                          {mov.movement_type === 'IN' && mov.condition === 'NEW' && (
                            <span className="text-xs font-mono font-bold text-slate-500">SAP: {mov.sap_transfer_number}</span>
                          )}
                          {mov.movement_type === 'OUT' && (
                            <span className="text-xs font-bold text-slate-500">Dest: {mov.destination}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-500">{mov.profiles?.full_name || 'Sistema'}</span>
                        </td>
                      </tr>
                    ))}
                    {movements.length === 0 && !loading && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">No hay movimientos registrados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Create Accessory Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-sm bg-white shadow-2xl p-0 overflow-hidden">
              <div className="bg-[#181c3a] p-5 text-white flex justify-between items-center">
                <h3 className="font-black text-lg">Nuevo Accesorio</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre del Accesorio *</label>
                  <input 
                    type="text" 
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    placeholder="Ej: Control Remoto ZXV10"
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Características del Accesorio</label>
                  <input 
                    type="text" 
                    value={newAccCharacteristics}
                    onChange={(e) => setNewAccCharacteristics(e.target.value)}
                    placeholder="Ej: Infrarrojo, Negro"
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comentarios</label>
                  <textarea 
                    value={newAccComments}
                    onChange={(e) => setNewAccComments(e.target.value)}
                    placeholder="Observaciones adicionales..."
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500 min-h-[80px]"
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
                <Button variant="primary" onClick={handleCreateAccessory} disabled={isProcessing || !newAccName.trim()}>Guardar</Button>
              </div>
            </Card>
          </div>
        )}

        {/* Movement Modal */}
        {showMoveModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-md bg-white shadow-2xl p-0 overflow-hidden">
              <div className={`p-5 text-white flex justify-between items-center ${moveType === 'IN' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                <h3 className="font-black text-lg">{moveType === 'IN' ? 'Ingreso de Accesorios' : 'Despacho de Accesorios'}</h3>
                <button onClick={() => setShowMoveModal(false)} className="text-white/60 hover:text-white"><X className="w-5 h-5"/></button>
              </div>
              <div className="p-6 space-y-4">
                {moveType === 'OUT' && (
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-4 shadow-inner">
                    <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1 mb-2">
                      <ScanLine className="w-3 h-3" /> Escanear Código de Caja
                    </label>
                    <input 
                      type="text" 
                      value={scannedBarcode}
                      onChange={handleBarcodeScan}
                      placeholder="Pistolea la etiqueta aquí..."
                      className="w-full bg-white p-3 rounded-lg border border-indigo-200 text-sm font-bold outline-none focus:border-indigo-500 text-indigo-900 shadow-sm"
                      autoFocus
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accesorio *</label>
                  <select 
                    value={moveAccId}
                    onChange={(e) => setMoveAccId(e.target.value)}
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500"
                  >
                    {accessories.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="space-y-2 flex-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Condición *</label>
                    <select 
                      value={moveCondition}
                      onChange={(e) => setMoveCondition(e.target.value as any)}
                      className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500"
                    >
                      <option value="NEW">Nuevo</option>
                      <option value="RECOVERED">Recuperado</option>
                    </select>
                  </div>
                  
                  {moveType === 'IN' ? (
                    <>
                      <div className="space-y-2 flex-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cant. Cajas *</label>
                        <input 
                          type="number" 
                          min="1"
                          value={moveNumBoxes}
                          onChange={(e) => setMoveNumBoxes(e.target.value)}
                          placeholder="1"
                          className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 flex-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cantidad *</label>
                      <input 
                        type="number" 
                        min="1"
                        value={moveQty}
                        onChange={(e) => setMoveQty(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}
                </div>

                {/* Cantidades individuales por caja para IN */}
                {moveType === 'IN' && parseInt(moveNumBoxes) > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Detalle de Unidades por Caja *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-40 overflow-y-auto pr-1">
                      {moveBoxDetails.map((qty, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400 shrink-0">Caja {idx + 1}:</span>
                          <input 
                            type="number" 
                            min="1"
                            value={qty}
                            onChange={(e) => {
                              const newDetails = [...moveBoxDetails];
                              newDetails[idx] = e.target.value;
                              setMoveBoxDetails(newDetails);
                            }}
                            placeholder="Ej: 20"
                            className="w-full bg-white p-2 rounded-lg border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500"
                          />
                        </div>
                      ))}
                    </div>
                    {moveBoxDetails.length > 0 && (
                      <div className="text-right text-xs font-bold text-indigo-600 border-t border-slate-200 pt-2">
                        Total a ingresar: {moveBoxDetails.reduce((a, b) => a + (parseInt(b) || 0), 0)} UND
                      </div>
                    )}
                  </div>
                )}


                {/* Mostrar disponibilidad */}
                {moveType === 'OUT' && moveAccId && (
                  <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded-md">
                    Disponibilidad: <strong>{moveCondition === 'NEW' ? accessories.find(a => a.id === moveAccId)?.qty_new : accessories.find(a => a.id === moveAccId)?.qty_recovered}</strong> unidades
                  </div>
                )}

                {/* Seleccionar caja específica al despachar recuperados */}
                {moveType === 'OUT' && moveCondition === 'RECOVERED' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Despachar desde Caja (Opcional)</label>
                    <select 
                      value={moveBoxId}
                      onChange={(e) => setMoveBoxId(e.target.value)}
                      className="w-full bg-indigo-50 p-3 rounded-xl border border-indigo-200 text-sm font-bold outline-none focus:border-indigo-500 text-indigo-800"
                    >
                      <option value="">Selección automática (Más antiguas primero)</option>
                      {boxes.filter(b => b.accessory_id === moveAccId && b.status === 'Clasificado Y Limpio').map(b => (
                        <option key={b.id} value={b.id}>{b.recovery_order} (Disp: {b.quantity})</option>
                      ))}
                    </select>
                  </div>
                )}

                {moveType === 'IN' && moveCondition === 'NEW' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Traslado SAP *</label>
                    <input 
                      type="text" 
                      value={moveSap}
                      onChange={(e) => setMoveSap(e.target.value)}
                      placeholder="Ej: SAP-00123"
                      className="w-full bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-sm font-bold outline-none focus:border-emerald-500 text-emerald-800"
                    />
                  </div>
                )}
                
                {moveType === 'IN' && moveCondition === 'RECOVERED' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado Inicial de Recuperación *</label>
                    <select 
                      value={moveInitialStatus}
                      onChange={(e) => setMoveInitialStatus(e.target.value)}
                      className="w-full bg-amber-50 p-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:border-amber-500 text-amber-800"
                    >
                      <option value="Clasificado, Pendiente de Limpiar">Clasificado, Pendiente de Limpiar</option>
                      <option value="Clasificado, Pendiente de Probar">Clasificado, Pendiente de Probar</option>
                      <option value="Clasificado Y Limpio">Clasificado Y Limpio</option>
                    </select>
                  </div>
                )}

                {moveType === 'OUT' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destino de Salida *</label>
                    <input 
                      type="text" 
                      value={moveDest}
                      onChange={(e) => setMoveDest(e.target.value)}
                      placeholder="Ej: Taller, Producción, Externa..."
                      className="w-full bg-rose-50 p-3 rounded-xl border border-rose-200 text-sm font-bold outline-none focus:border-rose-500 text-rose-800"
                    />
                  </div>
                )}
              </div>
              <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
                <Button variant="outline" onClick={() => setShowMoveModal(false)}>Cancelar</Button>
                <Button 
                  className={`border-none shadow-lg text-white ${moveType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'}`}
                  onClick={handleMovement} 
                  disabled={isProcessing || (moveType === 'OUT' && !moveQty) || (moveType === 'IN' && (!moveNumBoxes || parseInt(moveNumBoxes) <= 0))}
                >
                  Confirmar {moveType === 'IN' ? 'Ingreso' : 'Despacho'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Print Label Modal */}
        {showLabelModal && generatedLabels.length > 0 && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in py-10">
            <Card className="w-full max-w-4xl bg-white shadow-2xl p-0 flex flex-col max-h-full overflow-hidden">
              <div className="bg-[#181c3a] p-5 text-white flex justify-between items-center shrink-0 print:hidden">
                <h3 className="font-black text-lg">Cajas Generadas con Éxito ({generatedLabels.length})</h3>
                <button onClick={() => setShowLabelModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="overflow-y-auto p-6 bg-slate-100 flex-1">
                <div id="print-label-area" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 bg-white p-6 rounded-xl shadow-inner min-h-full">
                  {generatedLabels.map((label, index) => (
                    <div key={index} className="text-center w-full border-2 border-dashed border-slate-300 rounded-xl p-4 break-inside-avoid" style={{ pageBreakInside: 'avoid', marginBottom: '20px' }}>
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">ETIQUETA DE CAJA {label.status === 'Nuevo' ? 'NUEVA' : 'RECUPERADA'}</h4>
                      <div className="flex justify-center w-full">
                        <Barcode 
                          value={label.order} 
                          width={1.5}
                          height={50}
                          fontSize={14}
                          margin={5}
                          background="#ffffff"
                        />
                      </div>
                      <div className="mt-4 space-y-1 text-left bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-black uppercase text-slate-400">Contenido</p>
                        <p className="text-sm font-bold text-[#181c3a] truncate">{label.name}</p>
                        
                        <div className="flex justify-between mt-2 pt-2 border-t border-slate-200">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400">Cantidad</p>
                            <p className="text-sm font-bold text-slate-700">{label.qty} UND</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black uppercase text-slate-400">Estado</p>
                            <p className={`text-[11px] font-bold ${label.status === 'Nuevo' ? 'text-emerald-600' : 'text-indigo-600'}`}>{label.status}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100 shrink-0 print:hidden">
                <Button variant="outline" onClick={() => setShowLabelModal(false)}>Cerrar</Button>
                <Button 
                  variant="primary" 
                  onClick={() => {
                    const printContent = document.getElementById('print-label-area');
                    const originalContent = document.body.innerHTML;
                    if (printContent) {
                      document.body.innerHTML = printContent.innerHTML;
                      window.print();
                      document.body.innerHTML = originalContent;
                      window.location.reload(); // Reload to restore React bindings
                    }
                  }}
                >
                  Imprimir Todas
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Edit Box Modal */}
        {showEditBoxModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-sm bg-white shadow-2xl p-0 overflow-hidden">
              <div className="bg-[#181c3a] p-5 text-white flex justify-between items-center">
                <h3 className="font-black text-lg">Actualizar Caja</h3>
                <button onClick={() => setShowEditBoxModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cantidad *</label>
                  <input 
                    type="number" 
                    min="1"
                    value={editBoxQty}
                    onChange={(e) => setEditBoxQty(e.target.value)}
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-amber-600 font-bold">Nota: Al cambiar la cantidad se ajustará automáticamente el inventario general.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ubicación (Rack)</label>
                  <input 
                    type="text" 
                    value={editBoxLocation}
                    onChange={(e) => setEditBoxLocation(e.target.value)}
                    placeholder="Ej: A-1-4"
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500 uppercase"
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
                <Button variant="outline" onClick={() => setShowEditBoxModal(false)}>Cancelar</Button>
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 border-none"
                  onClick={handleUpdateBox} 
                  disabled={isProcessing || !editBoxQty || parseInt(editBoxQty) <= 0}
                >
                  Guardar Cambios
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Bulk Location Modal */}
        {showBulkLocationModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-sm bg-white shadow-2xl p-0 overflow-hidden">
              <div className="bg-indigo-600 p-5 text-white flex justify-between items-center">
                <h3 className="font-black text-lg">Ubicación Masiva ({selectedBoxes.length} cajas)</h3>
                <button onClick={() => setShowBulkLocationModal(false)} className="text-indigo-200 hover:text-white"><X className="w-5 h-5"/></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ubicación (Rack)</label>
                  <input 
                    type="text" 
                    value={bulkLocationText}
                    onChange={(e) => setBulkLocationText(e.target.value)}
                    placeholder="Ej: Rack Principal"
                    className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-500 uppercase"
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
                <Button variant="outline" onClick={() => setShowBulkLocationModal(false)}>Cancelar</Button>
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 border-none"
                  onClick={handleBulkLocation} 
                  disabled={isProcessing}
                >
                  Aplicar a {selectedBoxes.length} cajas
                </Button>
              </div>
            </Card>
          </div>
        )}

      </div>
    </ModulePage>
  );
}
