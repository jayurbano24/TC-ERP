import 'reflect-metadata';
import { container } from 'tsyringe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Supabase Client (lazy singleton — avoids build-time env requirement) ─────
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      'Supabase no configurado: defina NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  return supabaseClient;
}

container.register('SupabaseClient', { useFactory: getSupabaseClient });

// ─── Core Infrastructure ──────────────────────────────────────────────────────
import { CommandBus } from '../../modules/recepcion/application/cqrs/CommandBus';
import { FeatureFlagService } from '../feature-flags/FeatureFlagService';
import { EventBus } from '../events/EventBus';

container.register('CommandBus', { useClass: CommandBus });
container.register('FeatureFlagService', { useClass: FeatureFlagService });
container.register('EventBus', { useClass: EventBus });

// ─── Módulo Recepción ─────────────────────────────────────────────────────────
import { SupabaseOrdenServicioRepository } from '../../modules/recepcion/infrastructure/repositories/SupabaseOrdenServicioRepository';
import { OrdenServicioMapper } from '../../modules/recepcion/infrastructure/mappers/OrdenServicioMapper';
import { CreateRecepcionHandler } from '../../modules/recepcion/application/commands/CreateRecepcionHandler';
import { RecepcionController } from '../../modules/recepcion/interfaces/RecepcionController';
import { RecepcionCreatedEventHandler } from '../../modules/recepcion/application/events/RecepcionCreatedEventHandler';

container.register(OrdenServicioMapper, { useClass: OrdenServicioMapper });
container.register('IOrdenServicioRepository', { useClass: SupabaseOrdenServicioRepository });
container.register('CreateRecepcionHandler', { useClass: CreateRecepcionHandler });
container.register('RecepcionController', { useClass: RecepcionController });
container.register('RecepcionCreatedEventHandler', { useClass: RecepcionCreatedEventHandler });

// ─── Módulo Inventario ────────────────────────────────────────────────────────
import { SupabaseInventarioRepository } from '../../modules/inventario/infrastructure/repositories/SupabaseInventarioRepository';
import { CreateInventarioHandler } from '../../modules/inventario/application/commands/CreateInventarioHandler';
import { InventarioCreatedFromRecepcionHandler } from '../../modules/inventario/application/events/InventarioCreatedFromRecepcionHandler';

container.register('IInventarioRepository', { useClass: SupabaseInventarioRepository });
container.register('CreateInventarioHandler', { useClass: CreateInventarioHandler });
container.register('RecepcionCreatedEventHandler', { useClass: InventarioCreatedFromRecepcionHandler });

// ─── Módulo Producción ────────────────────────────────────────────────────────
import { GetProduccionDashboardHandler } from '../../modules/produccion/application/queries/GetProduccionDashboardHandler';
container.register('GetProduccionDashboardHandler', { useClass: GetProduccionDashboardHandler });

export { container };
