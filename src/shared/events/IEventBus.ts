export interface IEventBus {
  publish(event: any): Promise<void>;
  publishAll(events: any[]): Promise<void>;
  subscribe<T>(eventName: string, handler: any): void;
}
