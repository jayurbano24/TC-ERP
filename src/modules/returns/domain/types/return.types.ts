export type IndividualReturnEntry = {
  sn: string;
  motivo: string;
  guiaSalida: string;
  category?: string;
  originalGuide?: string;
};

export type IndividualReturnResult =
  | { success: true }
  | {
      success?: false;
      error: string;
      sapTransferId?: string;
      requiresBlockReturn?: boolean;
    };
