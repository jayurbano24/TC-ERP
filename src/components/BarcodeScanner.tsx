"use client";

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Loader2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode("reader");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" }, // Forzar cámara trasera (principal)
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (scannerRef.current?.isScanning) {
              scannerRef.current.pause();
              onScanSuccess(decodedText);
              setTimeout(() => {
                if (scannerRef.current && (scannerRef.current as { isPaused?: unknown }).isPaused) {
                  scannerRef.current.resume();
                }
              }, 1500);
            }
          },
          (errorMessage) => {
            // Ignorar errores de "no detectado"
          }
        );
        
        if (isMounted) setIsInitializing(false);
      } catch (err: any) {
        console.error("Error iniciando cámara:", err);
        if (isMounted) {
          setError('No se pudo acceder a la cámara. Por favor verifique los permisos de su navegador.');
          setIsInitializing(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().then(() => {
          scannerRef.current?.clear();
        }).catch(console.error);
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="bg-[#181c3a] p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-[#2ec4f1]" />
            <h3 className="font-black uppercase tracking-widest text-sm">Escáner Automático</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="bg-black relative min-h-[300px] flex items-center justify-center overflow-hidden">
          {isInitializing && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10 bg-black/50">
              <Loader2 className="w-8 h-8 animate-spin text-[#2ec4f1]" />
              <p className="text-xs font-bold tracking-widest uppercase animate-pulse">Iniciando Cámara...</p>
            </div>
          )}
          
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-rose-500/10 p-6 text-center">
              <p className="text-rose-500 font-bold text-sm">{error}</p>
            </div>
          ) : (
            <div id="reader" className="w-full h-full border-none flex items-center justify-center"></div>
          )}
        </div>
        
        <div className="bg-white p-5 text-center border-t border-slate-100">
          <p className="text-xs font-black uppercase text-slate-500 tracking-widest">
            Apunte el código de barras hacia el recuadro
          </p>
        </div>
      </div>
    </div>
  );
}
