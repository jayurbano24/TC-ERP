const fs = require('fs');

const path = 'src/app/(erp)/recepcion/page.tsx';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Find boundaries
let pxStart = -1;
let cacStart = -1;
let histStart = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('CONTENIDO PX')) pxStart = i;
  if (lines[i].includes('CONTENIDO CAC')) cacStart = i;
  if (lines[i].includes('BARRA DE BÚSQUEDA Y FILTROS') || lines[i].includes('PANEL DE MÉTRICAS HOY') || (lines[i].includes('Historial de Recepciones') && histStart === -1)) {
     if(histStart === -1) histStart = i;
  }
}

// Adjust histStart to the actual container div 
for (let i = histStart; i > 0; i--) {
  if (lines[i].includes('<div className="space-y-6 animate-rise-in">')) {
     histStart = i;
     break;
  }
}

console.log('Bounds:', pxStart, cacStart, histStart);

let pxJSX = lines.slice(pxStart + 2, cacStart).join('\n'); // +2 to skip the condition
let cacJSX = lines.slice(cacStart + 2, histStart - 1).join('\n'); // +2 to skip condition

// Clean up the trailing condition closure if present
pxJSX = pxJSX.replace(/}\s*\)$/g, '');
cacJSX = cacJSX.replace(/}\s*\)$/g, '');

const pxComponent = `import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Scan, Box, Printer, Pencil, Trash2, CheckCircle2, AlertCircle, Plus, FileText } from 'lucide-react';

export const PxReceptionTab = ({ 
  guideData, setGuideData, currentEntry, setCurrentEntry, systemPxProviders, 
  systemTechnologies, filteredBrands, filteredModels, handleAddCaja, manifestItems, 
  scannedSeries, selectedBoxForScan, setSelectedBoxForScan, printBoxLabel, 
  setManifestItems, handleFinalizePX, handleAddSN_PX, currentScans, setCurrentScans, 
  systemModels, moduleMode 
}: any) => {
  return (
    <>
${pxJSX}
    </>
  );
};`;

const cacComponent = `import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Scan, FileText, Upload, Camera, AlertCircle } from 'lucide-react';

export const CacReceptionTab = ({ 
  cacAgency, setCacAgency, cacPilot, setCacPilot, cacCarrier, setCacCarrier, 
  transportes, cacTotalCajas, setCacTotalCajas, isIndustrialScanning, 
  setIsIndustrialScanning, scanInputRef, cacScannedItems, handleScan_CAC, 
  cacScanInput, setCacScanInput, setCacError, setIsCameraScannerOpen, 
  isCameraScannerOpen, cacError, handleEditCACSeries, handleDeleteCACSeries, 
  handleFinalizeCAC, loading 
}: any) => {
  return (
    <>
${cacJSX}
    </>
  );
};`;

fs.writeFileSync('src/app/(erp)/recepcion/components/PxReceptionTab.tsx', pxComponent);
fs.writeFileSync('src/app/(erp)/recepcion/components/CacReceptionTab.tsx', cacComponent);

// Now that we have written the tabs, we overwrite page.tsx with page.v2.tsx
const pageV2 = fs.readFileSync('src/app/(erp)/recepcion/page.v2.tsx', 'utf8');
fs.writeFileSync('src/app/(erp)/recepcion/page.tsx', pageV2);
console.log('Final Assembly complete.');
