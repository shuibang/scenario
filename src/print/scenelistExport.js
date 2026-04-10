/**
 * scenelistExport.js — 씬리스트 전용 XLSX / DOCX 다운로드
 *
 * exportScenelistXlsx(ep, scenes, projectChars) → .xlsx
 * exportScenelistDocx(ep, scenes, projectChars, preset) → .docx
 */

import ExcelJS from 'exceljs';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, PageOrientation,
  convertMillimetersToTwip, SectionType, NumberFormat,
} from 'docx';
import { resolveFont } from './FontRegistry';

// ─── 공통: 씬 데이터 정규화 ───────────────────────────────────────────────────
function buildRows(scenes, projectChars) {
  return scenes.map((s, i) => {
    const charNames = (s.characterIds || [])
      .map(cid => { const c = projectChars.find(ch => ch.id === cid); return c ? (c.givenName || c.name) : null; })
      .filter(Boolean);

    let location = s.location?.trim() || '';
    let subLocation = s.subLocation?.trim() || '';
    let timeOfDay = s.timeOfDay?.trim() || '';
    if (!location && s.content) {
      let rest = s.content.replace(/^S#\d+\.?\s*/, '').trim();
      const spM = rest.match(/^([^)]+)\)\s*(.*)$/);
      if (spM) rest = spM[2].trim();
      const timeM = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      if (timeM) { rest = timeM[1].trim(); timeOfDay = timeM[2].trim(); }
      const subM = rest.match(/^(.+?)\s*-\s*(.+)$/);
      if (subM) { location = subM[1].trim(); subLocation = subM[2].trim(); }
      else location = rest;
    }

    return {
      sceneNum:         `S#${i + 1}.`,
      location,
      subLocation,
      timeOfDay,
      characters:       charNames.join(', '),
      sceneListContent: s.sceneListContent || '',
    };
  });
}

const HEADERS = ['씬번호', '장소', '세부장소', '시간대', '등장인물', '내용요약', '비고'];
const COL_WIDTHS_MM = [15, 28, 25, 18, 28, 80, 25]; // mm, landscape A4 257mm 기준

// ─── XLSX ────────────────────────────────────────────────────────────────────
export async function exportScenelistXlsx(ep, scenes, projectChars) {
  const rows = buildRows(scenes, projectChars);
  const epLabel = `${ep.number}회 씬리스트${ep.title ? ` — ${ep.title}` : ''}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = '대본 작업실';

  const ws = wb.addWorksheet(epLabel, {
    pageSetup: {
      paperSize: 9,           // A4
      orientation: 'landscape',
      fitToPage: false,
      margins: { left: 0.79, right: 0.79, top: 0.79, bottom: 0.79, header: 0, footer: 0 },
    },
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  // 타이틀 행 (병합)
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = epLabel;
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // 헤더 행
  const headerRow = ws.getRow(2);
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } };
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FF999999' } },
      bottom: { style: 'thin', color: { argb: 'FF999999' } },
      left:   { style: 'thin', color: { argb: 'FF999999' } },
      right:  { style: 'thin', color: { argb: 'FF999999' } },
    };
  });
  headerRow.height = 20;

  // 컬럼 너비 (엑셀 단위 ≈ 7px/char, mm 근사)
  const MM_TO_CHAR = 0.47; // 경험치
  ws.columns = HEADERS.map((_, i) => ({ width: Math.round(COL_WIDTHS_MM[i] * MM_TO_CHAR * 10) / 10 }));

  // 데이터 행
  rows.forEach((r, ri) => {
    const rowData = [r.sceneNum, r.location, r.subLocation, r.timeOfDay, r.characters, r.sceneListContent, ''];
    const wsRow = ws.addRow(rowData);
    wsRow.height = 18;
    wsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 10 };
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: colNum === 1 ? 'center' : 'left' };
      cell.fill = ri % 2 === 1
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${epLabel}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────
export async function exportScenelistDocx(ep, scenes, projectChars, preset = {}) {
  const rows = buildRows(scenes, projectChars);
  const epLabel = `${ep.number}회 씬리스트${ep.title ? ` — ${ep.title}` : ''}`;
  const { fontName: fontFamily } = resolveFont(preset, 'docx');
  const FS = 10 * 2; // 10pt in half-points

  const marginTwip = convertMillimetersToTwip(20);
  const usableW    = convertMillimetersToTwip(257); // 297 - 20*2
  const COL_PCT    = [6, 11, 10, 7, 12, 40, 14];   // 7컬럼, 합계 100%
  const COL_W      = COL_PCT.map((p, i) =>
    i < COL_PCT.length - 1
      ? Math.round(usableW * p / 100)
      : usableW - COL_PCT.slice(0, -1).reduce((a, b, j) => a + Math.round(usableW * b / 100), 0)
  );

  const cellBorder = {
    top:    { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    left:   { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    right:  { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  };

  const makeCell = (text, w, bold = false, shade = false) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: shade ? { fill: 'ECECEC' } : undefined,
    borders: cellBorder,
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 30, after: 30 },
      children: [new TextRun({ text: String(text ?? ''), bold, font: { name: fontFamily }, size: FS })],
    })],
  });

  const headerRow = new TableRow({
    tableHeader: true,
    children: HEADERS.map((h, i) => makeCell(h, COL_W[i], true, true)),
  });

  const dataRows = rows.map(r => new TableRow({
    children: [
      makeCell(r.sceneNum,         COL_W[0], true),
      makeCell(r.location,         COL_W[1]),
      makeCell(r.subLocation,      COL_W[2]),
      makeCell(r.timeOfDay,        COL_W[3]),
      makeCell(r.characters,       COL_W[4]),
      makeCell(r.sceneListContent, COL_W[5]),
      makeCell('',                 COL_W[6]),
    ],
  }));

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text: epLabel, bold: true, font: { name: fontFamily }, size: FS + 2 })],
  });

  const blankPara = new Paragraph({
    children: [new TextRun({ text: '', font: { name: fontFamily }, size: FS })],
  });

  const table = new Table({
    width: { size: usableW, type: WidthType.DXA },
    rows: [headerRow, ...dataRows],
  });

  const doc = new Document({
    creator: '대본 작업실',
    sections: [{
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: {
            // docxjs swaps width↔height when LANDSCAPE; pass portrait dims to get correct output
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
            orientation: PageOrientation.LANDSCAPE,
          },
          margin: { top: marginTwip, right: marginTwip, bottom: marginTwip, left: marginTwip },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      children: [titlePara, table, blankPara],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${epLabel}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
