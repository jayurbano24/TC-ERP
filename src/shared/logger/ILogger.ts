export interface ILogger {
  info(message: string, obj?: any): void;
  error(message: string, obj?: any): void;
  warn(message: string, obj?: any): void;
  debug(message: string, obj?: any): void;
}
