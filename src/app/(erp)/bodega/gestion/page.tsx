"use client";

import React, { useState } from 'react';
import BodegaGestionV1 from './BodegaGestionV1';
import BodegaGestionV2 from './BodegaGestionV2';

/** Bodega gestión — lecturas vía GET /api/v1 (V2). V1 solo si falta migración RPC. */
export default function BodegaGestionPage() {
  const [fallbackV1, setFallbackV1] = useState(false);

  if (fallbackV1) {
    return <BodegaGestionV1 />;
  }

  return <BodegaGestionV2 onRequireMigration={() => setFallbackV1(true)} />;
}
