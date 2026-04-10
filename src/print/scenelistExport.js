/**
 * scenelistExport.js — 씬리스트 전용 XLSX 다운로드
 */

import ExcelJS from 'exceljs';
import { resolveSceneLabel, parseSceneContent } from '../utils/sceneResolver';

// ─── 씬 데이터 정규화 ─────────────────────────────────────────────────────────
// parseSceneContent 버그(location이 specialSituation에 잘못 저장된 경우) 대응:
// resolveSceneLabel로 표시 텍스트를 얻은 뒤 다시 parseSceneContent로 파싱.
function buildRows(scenes, projectChars) {
  return scenes.map((s, i) => {
    const charNames = (s.characterIds || [])
      .map(cid => {
        const c = projectChars.find(ch => ch.id === cid);
        return c ? (c.givenName || c.name) : null;
      })
      .filter(Boolean);

    let location    = s.location?.trim()    || '';
    let subLocation = s.subLocation?.trim() || '';
    let timeOfDay   = s.timeOfDay?.trim()   || '';

    if (!location) {
      // 잘못 파싱된 기존 데이터: specialSituation에 전체 장소 텍스트가 들어 있을 수 있음
      // resolveSceneLabel → 올바른 표시 문자열로 복원 후 재파싱
      const displayText = resolveSceneLabel({ ...s, label: '' }).trim();
      if (displayText) {
        const parsed = parseSceneContent(displayText);
        location    = parsed.location    || '';
        subLocation = parsed.subLocation || subLocation;
        timeOfDay   = parsed.timeOfDay   || timeOfDay;
      }
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

const HEADERS        = ['씬번호', '장소', '세부장소', '시간대', '등장인물', '내용요약', '비고'];
const COL_WIDTHS_CH  = [8, 14, 12, 9, 14, 40, 12]; // Excel 문자 단위 너비

// ─── XLSX ────────────────────────────────────────────────────────────────────
export async function exportScenelistXlsx(ep, scenes, projectChars) {
  const rows     = buildRows(scenes, projectChars);
  const epLabel  = `${ep.number}회 씬리스트${ep.title ? ` - ${ep.title}` : ''}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = '대본 작업실';

  const ws = wb.addWorksheet('씬리스트', {
    pageSetup: {
      paperSize:   9,           // A4
      orientation: 'landscape',
      margins: { left: 0.79, right: 0.79, top: 0.79, bottom: 0.79, header: 0, footer: 0 },
    },
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  ws.columns = HEADERS.map((_, i) => ({ width: COL_WIDTHS_CH[i] }));

  // 타이틀 행 (1행 병합)
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value     = epLabel;
  titleCell.font      = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // 헤더 행 (2행)
  const headerRow = ws.getRow(2);
  headerRow.height    = 20;
  HEADERS.forEach((h, i) => {
    const cell      = headerRow.getCell(i + 1);
    cell.value      = h;
    cell.font       = { bold: true, size: 10 };
    cell.alignment  = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } };
    cell.border     = {
      top:    { style: 'thin', color: { argb: 'FF999999' } },
      bottom: { style: 'thin', color: { argb: 'FF999999' } },
      left:   { style: 'thin', color: { argb: 'FF999999' } },
      right:  { style: 'thin', color: { argb: 'FF999999' } },
    };
  });

  // 데이터 행 (3행~)
  rows.forEach((r, ri) => {
    const rowData = [r.sceneNum, r.location, r.subLocation, r.timeOfDay, r.characters, r.sceneListContent, ''];
    const wsRow   = ws.addRow(rowData);
    wsRow.height  = 18;
    wsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font      = { size: 10 };
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: colNum === 1 ? 'center' : 'left' };
      cell.fill      = ri % 2 === 1
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cell.border    = {
        top:    { style: 'thin', color: { argb: 'FFDDDDDD' } },
        bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    });
  });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${epLabel}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
