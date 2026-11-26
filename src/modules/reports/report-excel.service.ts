import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

export type ColumnKind = 'text' | 'money' | 'number' | 'quantity' | 'percent';

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  kind?: ColumnKind;
}

export interface SheetSpec {
  name: string;
  title: string;
  subtitle?: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
}

const NUMBER_FORMATS: Record<ColumnKind, string | undefined> = {
  text: undefined,
  money: '#,##0.##',
  number: '#,##0',
  quantity: '#,##0.###',
  percent: '0.00"%"',
};

/** Renders tabular report data into a styled XLSX workbook. */
@Injectable()
export class ReportExcelService {
  async build(sheets: SheetSpec[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BurgutPOS';
    workbook.created = new Date();

    for (const spec of sheets) {
      const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: spec.subtitle ? 4 : 3 }],
      });
      sheet.columns = spec.columns.map((column) => ({
        key: column.key,
        width: column.width ?? 16,
      }));

      const lastColumn = spec.columns.length;
      sheet.mergeCells(1, 1, 1, Math.max(lastColumn, 1));
      const title = sheet.getCell(1, 1);
      title.value = spec.title;
      title.font = { bold: true, size: 14, color: { argb: 'FF1D1A6B' } };
      let headerRow = 3;
      if (spec.subtitle) {
        sheet.mergeCells(2, 1, 2, Math.max(lastColumn, 1));
        const subtitle = sheet.getCell(2, 1);
        subtitle.value = spec.subtitle;
        subtitle.font = { size: 10, color: { argb: 'FF5D627C' } };
        headerRow = 4;
      }

      const header = sheet.getRow(headerRow);
      spec.columns.forEach((column, index) => {
        const cell = header.getCell(index + 1);
        cell.value = column.header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF262387' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
      });
      header.height = 22;

      const addRow = (data: Record<string, unknown>, bold = false) => {
        const row = sheet.addRow(
          spec.columns.map((column) => data[column.key] ?? ''),
        );
        spec.columns.forEach((column, index) => {
          const cell = row.getCell(index + 1);
          const format = NUMBER_FORMATS[column.kind ?? 'text'];
          if (format && typeof cell.value === 'number') cell.numFmt = format;
          if (bold) cell.font = { bold: true };
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FFE6E7F0' } },
          };
        });
      };
      spec.rows.forEach((row) => addRow(row));
      if (spec.totals) addRow(spec.totals, true);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
