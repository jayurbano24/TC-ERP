import type { IndividualReturnEntry } from '../../domain/types/return.types';

export class RegisterIndividualReturnCommand {
  constructor(readonly entry: IndividualReturnEntry) {}
}
