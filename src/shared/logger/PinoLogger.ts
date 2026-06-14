import pino from 'pino';
import { ILogger } from './ILogger';
import { injectable } from 'tsyringe';

@injectable()
export class PinoLogger implements ILogger {
  private logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    } : undefined
  });

  info(message: string, obj?: any): void {
    if (obj) this.logger.info(obj, message);
    else this.logger.info(message);
  }

  error(message: string, obj?: any): void {
    if (obj) this.logger.error(obj, message);
    else this.logger.error(message);
  }

  warn(message: string, obj?: any): void {
    if (obj) this.logger.warn(obj, message);
    else this.logger.warn(message);
  }

  debug(message: string, obj?: any): void {
    if (obj) this.logger.debug(obj, message);
    else this.logger.debug(message);
  }
}
