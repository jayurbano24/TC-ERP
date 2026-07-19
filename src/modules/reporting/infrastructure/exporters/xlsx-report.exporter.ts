import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import type { IReportExporter, ReportExportOptions } from '../../domain/ports/report-exporter.port';
import type { ReportRow } from '../../domain/types/report.types';

const MATRIX_COLS = [
  'Año',
  'País',
  'Mes',
  'Tecnología',
  'Ingresado CACs',
  'Ingresado PX',
  'Taller CACs',
  'Taller PX',
  'Obsoleto CACs',
  'Obsoleto PX',
  'Reparado CACs',
  'Reparado PX',
  'Reacondicionado CACs',
  'Reacondicionado PX',
] as const;

const COL_COUNT = MATRIX_COLS.length;

const COLORS = {
  infoRed: 'FFFF0000',
  headerBlack: 'FF000000',
  headerWhite: 'FFFFFFFF',
  textBlack: 'FF000000',
  bodyGray: 'FFE7E7E7',
};

const thinBlack: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FF000000' },
};

const mediumBlack: Partial<ExcelJS.Border> = {
  style: 'medium',
  color: { argb: 'FF000000' },
};

function allThinBorders(): Partial<ExcelJS.Borders> {
  return { top: thinBlack, left: thinBlack, bottom: thinBlack, right: thinBlack };
}

function applyHeaderCell(cell: ExcelJS.Cell) {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.headerBlack },
  };
  cell.font = {
    bold: true,
    color: { argb: COLORS.headerWhite },
    name: 'Calibri',
    size: 11,
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = allThinBorders();
}

async function buildOpsMonthlyTechMatrixSheet(rows: ReportRow[], sheetName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TC-ERP';
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  sheet.columns = Array.from({ length: COL_COUNT }, (_, i) => ({
    width: i === 3 ? 14 : i < 4 ? 8 : 11,
  }));

  const titleRow = sheet.getRow(1);
  titleRow.height = 22;
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = titleRow.getCell(c);
    cell.value = c === 1 ? 'INFORMACIÓN' : null;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.infoRed },
    };
    cell.font = {
      bold: true,
      color: { argb: COLORS.textBlack },
      name: 'Calibri',
      size: 12,
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allThinBorders();
  }
  sheet.mergeCells(1, 1, 1, COL_COUNT);

  const groupRow = sheet.getRow(2);
  groupRow.height = 20;
  const groupLabels: Array<{ col: number; value: string; span: number }> = [
    { col: 1, value: 'Año', span: 1 },
    { col: 2, value: 'País', span: 1 },
    { col: 3, value: 'Mes', span: 1 },
    { col: 4, value: 'Tecnología', span: 1 },
    { col: 5, value: 'Ingresado', span: 2 },
    { col: 7, value: 'Taller', span: 2 },
    { col: 9, value: 'Obsoleto', span: 2 },
    { col: 11, value: 'Reparado', span: 2 },
    { col: 13, value: 'Reacondicionado', span: 2 },
  ];

  for (let c = 1; c <= COL_COUNT; c++) {
    applyHeaderCell(groupRow.getCell(c));
  }
  for (const g of groupLabels) {
    groupRow.getCell(g.col).value = g.value;
    if (g.span > 1) {
      sheet.mergeCells(2, g.col, 2, g.col + g.span - 1);
    }
  }

  const subRow = sheet.getRow(3);
  subRow.height = 18;
  const subLabels = [
    '',
    '',
    '',
    '',
    'CACs',
    'PX',
    'CACs',
    'PX',
    'CACs',
    'PX',
    'CACs',
    'PX',
    'CACs',
    'PX',
  ];
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = subRow.getCell(c);
    cell.value = subLabels[c - 1] || null;
    applyHeaderCell(cell);
  }
  for (let c = 1; c <= 4; c++) {
    sheet.mergeCells(2, c, 3, c);
    applyHeaderCell(sheet.getCell(2, c));
  }

  const dataStart = 4;
  rows.forEach((r, idx) => {
    const excelRow = sheet.getRow(dataStart + idx);
    const values = MATRIX_COLS.map((col) => {
      const v = r[col];
      return v === null || v === undefined || v === '' ? null : v;
    });
    values.forEach((v, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.bodyGray },
      };
      cell.font = { color: { argb: COLORS.textBlack }, name: 'Calibri', size: 10 };
      cell.alignment = {
        horizontal: i < 4 ? 'center' : 'right',
        vertical: 'middle',
      };
      cell.border = allThinBorders();
    });

    const next = rows[idx + 1];
    if (!next || next['Mes'] !== r['Mes']) {
      for (let c = 1; c <= COL_COUNT; c++) {
        excelRow.getCell(c).border = {
          ...allThinBorders(),
          bottom: mediumBlack,
        };
      }
    }
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  };
}

export class XlsxReportExporter implements IReportExporter {
  readonly format = 'XLSX' as const;

  async export(rows: ReportRow[], sheetName: string, options?: ReportExportOptions) {
    if (options?.xlsxLayout === 'ops_monthly_tech_matrix') {
      return buildOpsMonthlyTechMatrixSheet(rows, sheetName);
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  }
}
