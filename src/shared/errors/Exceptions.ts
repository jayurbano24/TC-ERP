export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainException';
  }
}

export class BusinessException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessException';
  }
}

export class ValidationException extends Error {
  public errors: any[];
  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'ValidationException';
    this.errors = errors;
  }
}
