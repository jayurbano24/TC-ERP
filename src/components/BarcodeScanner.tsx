"use client";

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Evitar que se inicialice múltiple veces en strict mode
    if (scannerRef.current) return;

    try {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
        },
        false
      );

      scannerRef.current = scanner;

      scanner.render((decodedText) => {
        // Al escanear con éxito, pausamos para evitar escaneos dobles inmediatos
        scanner.pause(true);
        onScanSuccess(decodedText);
        
        // Retomamos después de 1.5s
        setTimeout(() => {
          if (scannerRef.current) scannerRef.current.resume();
        }, 1500);

      }, (err) => {
        // Ignoramos errores de "no detectado" porque se disparan en cada frame
      });
    } catch (e) {
      console.error(e);
      setError('Error al inicializar la cámara. Por favor verifique los permisos.');
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
        scannerRef.current = null;
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="bg-[#181c3a] p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-[#2ec4f1]" />
            <h3 className="font-black uppercase tracking-widest text-sm">Escáner de Cámara</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 bg-slate-50 relative min-h-[300px] flex items-center justify-center">
          {error ? (
            <p className="text-rose-500 font-bold text-center p-6">{error}</p>
          ) : (
            <div id="reader" className="w-full h-full border-none" style={{ border: 'none' }}></div>
          )}
        </div>
        
        <div className="bg-white p-4 border-t border-slate-100 text-center">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            Apunte la cámara hacia el código de barras o QR
          </p>
        </div>
      </div>
    </div>
  );
}
