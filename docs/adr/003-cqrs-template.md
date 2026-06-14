# ADR 003: Plantilla Estándar CQRS (Custom TSyringe)

Este documento define la estructura oficial y obligatoria para todos los nuevos casos de uso del TC-ERP, asegurando consistencia y un despliegue seguro en Vercel (sin *auto-discovery* dinámico).

## 1. El Payload (Command / Query)
El archivo de Payload **no debe contener lógica de negocio ni dependencias inyectadas**. Solo transporta datos.

> **Regla de Oro:** La propiedad `commandName` o `queryName` debe ser **exactamente igual** al nombre de la clase para que el Bus lo resuelva correctamente (`NombreClase` -> `NombreClaseHandler`).

### Ejemplo de Command (`CrearEntidadCommand.ts`)
```typescript
import { ICommand } from '../../../../shared/cqrs/ICommand';
import { CrearEntidadDTO } from '../dto/EntidadDTO';

export class CrearEntidadCommand implements ICommand {
  // 1. Debe coincidir con el nombre de esta misma clase
  readonly commandName = 'CrearEntidadCommand';

  // 2. Transportar el payload tipado
  constructor(public readonly payload: CrearEntidadDTO) {}
}
```

### Ejemplo de Query (`GetEntidadQuery.ts`)
```typescript
import { IQuery } from '../../../../shared/cqrs/IQuery';

export class GetEntidadQuery implements IQuery {
  readonly queryName = 'GetEntidadQuery';

  // En una Query, el payload pueden ser filtros o paginación
  constructor(public readonly filtros: { estado?: string; limite: number }) {}
}
```

---

## 2. El Handler (Lógica de Negocio)
El Handler centraliza la lógica, la inyección de dependencias (`@injectable()`) y la validación.

### Ejemplo de Handler (`CrearEntidadHandler.ts`)
```typescript
import { injectable, inject } from 'tsyringe';
import { ICommandHandler } from '../../../../shared/cqrs/ICommandHandler';
import { CrearEntidadCommand } from './CrearEntidadCommand';
import { RequestContext } from '../../../../shared/context/RequestContext';
import type { IEntidadRepository } from '../../domain/repositories/IEntidadRepository';

@injectable()
// 1. Debe llamarse exactamente igual que el Command + "Handler"
export class CrearEntidadHandler implements ICommandHandler<CrearEntidadCommand, void> {
  
  // 2. Inyectar dependencias usando interfaces (Tokens en string)
  constructor(
    @inject('IEntidadRepository') private readonly repository: IEntidadRepository
  ) {}

  // 3. Ejecutar la lógica de negocio
  async execute(command: CrearEntidadCommand, ctx: RequestContext): Promise<void> {
    const data = command.payload;
    // Lógica...
  }
}
```

---

## 3. Registro en el Contenedor (Manual y Seguro)
Para que Vercel / Turbopack evalúen correctamente el código en compilación, **TODO Handler debe registrarse manualmente** en `src/shared/di/container.ts`.

```typescript
import { CrearEntidadHandler } from '../../modules/ejemplo/application/commands/CrearEntidadHandler';

// Registro explícito
container.register('CrearEntidadCommandHandler', { useClass: CrearEntidadHandler });
```

---

## 4. Invocación en la API Route (Capa de Presentación)
El endpoint Next.js es muy delgado. Solo inyecta el `CommandBus` o `QueryBus` y despacha el mensaje.

```typescript
import 'reflect-metadata';
import { NextResponse } from 'next/server';
import { container } from '../../../../shared/di/container';
import { CommandBus } from '../../../../shared/cqrs/CommandBus';
import { CrearEntidadCommand } from '../../../../modules/ejemplo/application/commands/CrearEntidadCommand';

export async function POST(request: Request) {
  try {
    const commandBus = container.resolve(CommandBus);
    const body = await request.json();
    const ctx = /* Obtener RequestContext */;

    await commandBus.execute(new CrearEntidadCommand(body), ctx);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
```
