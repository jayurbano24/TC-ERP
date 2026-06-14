const fs = require('fs');
let code = fs.readFileSync('src/app/(erp)/recepcion/page.tsx', 'utf8');

if (!code.includes('getCarriers')) {
  code = code.replace(
    `import { printingService } from './services/printingService';`,
    `import { printingService } from './services/printingService';\nimport { getCarriers, getTechnologies, getBrands, getModels, getPxProviders } from '@/lib/database/config';\nimport { getReceptions } from '@/lib/database/receptions';`
  );
}

const stateToAdd = `
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
  }, []);

  useEffect(() => {
    if (pxState.currentEntry.tecnologia) {
      const techId = systemTechnologies.find(t => t.name === pxState.currentEntry.tecnologia)?.id;
      setFilteredBrands(systemBrands.filter(b => b.technology_id === techId));
    } else {
      setFilteredBrands(systemBrands);
    }
  }, [pxState.currentEntry.tecnologia, systemTechnologies, systemBrands]);

  useEffect(() => {
    if (pxState.currentEntry.marca) {
      const brandId = systemBrands.find(b => b.name === pxState.currentEntry.marca)?.id;
      setFilteredModels(systemModels.filter(m => m.brand_id === brandId));
    } else {
      setFilteredModels(systemModels);
    }
  }, [pxState.currentEntry.marca, systemBrands, systemModels]);
`;

code = code.replace('// TODO: Add initialization useEffects here calling receptionService', stateToAdd);

code = code.replace(
  '<CacReceptionTab {...cacState} {...scannerState} {...validationState} handlePrintCAC={printingService.printCACAcuse} />',
  '<CacReceptionTab {...cacState} {...scannerState} {...validationState} handlePrintCAC={printingService.printCACAcuse} transportes={transportes} />'
);

code = code.replace(
  '<PxReceptionTab {...pxState} {...scannerState} {...validationState} printBoxLabel={printingService.printBoxLabel} />',
  '<PxReceptionTab {...pxState} {...scannerState} {...validationState} printBoxLabel={printingService.printBoxLabel} systemPxProviders={systemPxProviders} systemTechnologies={systemTechnologies} filteredBrands={filteredBrands} filteredModels={filteredModels} systemModels={systemModels} moduleMode={moduleMode} />'
);

// If transportes=[] is missing in CacReceptionTab
let cacCode = fs.readFileSync('src/app/(erp)/recepcion/components/CacReceptionTab.tsx', 'utf8');
if (cacCode.includes('transportes,')) {
  cacCode = cacCode.replace('transportes,', 'transportes = [],');
  fs.writeFileSync('src/app/(erp)/recepcion/components/CacReceptionTab.tsx', cacCode);
}

fs.writeFileSync('src/app/(erp)/recepcion/page.tsx', code);
console.log('Fixed page.tsx config state!');
