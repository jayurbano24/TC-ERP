import 'reflect-metadata';
import { container } from 'tsyringe';

import prisma from '../../infrastructure/database/prisma/client';

// Aquí se registrarán los providers globales
container.register('PrismaClient', { useValue: prisma });

// Módulo Recepción
import { PrismaOrdenServicioRepository } from '../../modules/recepcion/infrastructure/repositories/PrismaOrdenServicioRepository';
import { CreateRecepcionHandler } from '../../modules/recepcion/application/commands/CreateRecepcionHandler';
import { RecepcionController } from '../../modules/recepcion/interfaces/RecepcionController';

container.register('IOrdenServicioRepository', { useClass: PrismaOrdenServicioRepository });
container.register('CreateRecepcionHandler', { useClass: CreateRecepcionHandler });
container.register('RecepcionController', { useClass: RecepcionController });

// Módulo Inventario

// Módulo Producción
import { GetProduccionDashboardHandler } from '../../modules/produccion/application/queries/GetProduccionDashboardHandler';
container.register('GetProduccionDashboardHandler', { useClass: GetProduccionDashboardHandler });

// Event Bus y Event Handlers
import { EventBus } from '../events/EventBus';
import { RecepcionCreatedEventHandler } from '../../modules/recepcion/application/events/RecepcionCreatedEventHandler';
container.register('EventBus', { useClass: EventBus });
container.register('RecepcionCreatedEventHandler', { useClass: RecepcionCreatedEventHandler });

export { container };
