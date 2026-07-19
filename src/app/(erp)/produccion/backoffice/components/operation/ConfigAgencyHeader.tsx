'use client';

import React from 'react';
import { Badge } from '@/components/ui';
import { Calendar, ChevronLeft, MapPin, Phone, Truck, UserCheck } from 'lucide-react';
import type { OperationContext } from '../../operation/operationContext';
import { getReceiverName } from '../../backofficeHelpers';

type Props = { ctx: OperationContext };

export function ConfigAgencyHeader({ ctx }: Props) {
  const {
    setReceptionStep,
    scannedGuides,
    activeReception,
    agencyDetails,
    setShowAgencyModal,
    processingDateLabel,
  } = ctx;

  if (!activeReception) return null;

  return (
    <>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
              <ChevronLeft size={16} /> Volver al Triaje
            </button>
            <div className="h-6 w-[2px] bg-slate-100 mx-2"></div>
            <h2 className="text-2xl font-black text-[#181c3a] uppercase tracking-tighter">Procesando Guía: <span className="text-[#2ec4f1] ml-2">{scannedGuides.map(g => g.split(' ')[0]).join(' / ') || activeReception.guide_number?.split(' ')[0]}</span></h2>
          </div>
          <div className="flex gap-2">
             <Badge className="bg-[#181c3a] text-white px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-lg">Lote ID: {activeReception.id.substring(0,8)}</Badge>
          </div>
        </div>
          
        {/* PANEL DE INFORMACIÓN DE AGENCIA (HEADER) - REDISEÑADO PARA METADATOS DINÁMICOS */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl grid grid-cols-1 md:grid-cols-3 gap-10 mb-8 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2ec4f1] to-[#181c3a]"></div>
          
          <button 
            onClick={() => setShowAgencyModal(true)}
            className="flex items-start gap-6 border-r border-slate-50 pr-6 text-left hover:bg-slate-50/50 transition-all rounded-[2rem] p-4 -m-4 group/btn"
          >
            <div className="bg-slate-50 p-5 rounded-2xl text-[#181c3a] shadow-inner group-hover/btn:bg-[#181c3a] group-hover/btn:text-white transition-all"><Truck size={28} /></div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Tienda / Agencia Destino</p>
              <h3 className="text-xl font-black text-[#181c3a] uppercase truncate leading-tight group-hover/btn:text-[#2ec4f1] transition-colors">{agencyDetails?.name || 'SELECCIONAR AGENCIA'}</h3>
              <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase flex items-center gap-2">
                <MapPin size={12} className="text-[#2ec4f1]" /> {agencyDetails?.direccion || 'SIN DIRECCIÓN REGISTRADA'}
              </p>
            </div>
          </button>
          
          <div className="flex items-start gap-6 border-r border-slate-50 pr-6">
            <div className="bg-blue-50 p-5 rounded-2xl text-[#2ec4f1] shadow-inner"><UserCheck size={28} /></div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Encargado de Tienda</p>
              <h3 className="text-xl font-black text-[#181c3a] uppercase leading-tight">{agencyDetails?.manager || 'PENDIENTE'}</h3>
              <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-2">
                <Phone size={12} className="text-[#2ec4f1]" /> {(agencyDetails as any)?.telefono || 'SIN TELÉFONO'}
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-6">
            <div className="bg-emerald-50 p-5 rounded-2xl text-emerald-500 shadow-inner"><Calendar size={28} /></div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Fecha de Procesamiento</p>
              <h3 className="text-xl font-black text-[#181c3a] uppercase leading-tight">{processingDateLabel || '---'}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Usuario: {getReceiverName(activeReception)}</p>
            </div>
          </div>
        </div>
    </>
  );
}
