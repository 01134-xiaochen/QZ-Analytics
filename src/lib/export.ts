import * as XLSX from 'xlsx';

/* ------------------------------------------------------------------ */
/*  Calculation Logic Sheet Data                                       */
/* ------------------------------------------------------------------ */

function createLogicSheet(): XLSX.WorkSheet {
  const logicData = [
    { '指标名称': '设备利用率', '计算公式': '工艺耗时(min) / 720min × 100%', '说明': '白班/夜班各12小时=720分钟' },
    { '指标名称': '空窗时间', '计算公式': '下条开始时间 - 上条结束时间', '说明': '相邻工艺记录间的时间间隔' },
    { '指标名称': '良率', '计算公式': '合格晶圆数 / 总晶圆数 × 100%', '说明': '反映生产质量水平' },
    { '指标名称': 'Bin1&2占比', '计算公式': 'Bin1+Bin2数量 / 总Die数量 × 100%', '说明': '高等级品比例' },
  ];

  const ws = XLSX.utils.json_to_sheet(logicData);

  /* -- Apply header styles -- */
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: '3B82F6' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          bottom: { style: 'thin', color: { rgb: '2563EB' } },
        },
      };
    }
  }

  /* -- Auto-fit column widths -- */
  const colWidths: number[] = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = 10;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];
      if (cell && cell.v != null) {
        const text = String(cell.v);
        maxLen = Math.max(maxLen, text.length * 1.2 + 2);
      }
    }
    colWidths.push(Math.min(Math.round(maxLen), 50));
  }
  ws['!cols'] = colWidths.map((w) => ({ wch: w }));

  return ws;
}

/* ------------------------------------------------------------------ */
/*  Apply styles to a worksheet                                        */
/* ------------------------------------------------------------------ */

function applySheetStyles(ws: XLSX.WorkSheet): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  /* -- Apply header styles -- */
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: '3B82F6' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          bottom: { style: 'thin', color: { rgb: '2563EB' } },
        },
      };
    }
  }

  /* -- Auto-fit column widths -- */
  const colWidths: number[] = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = 10;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];
      if (cell && cell.v != null) {
        const text = String(cell.v);
        maxLen = Math.max(maxLen, text.length * 1.2 + 2);
      }
    }
    colWidths.push(Math.min(Math.round(maxLen), 50));
  }
  ws['!cols'] = colWidths.map((w) => ({ wch: w }));

  /* -- Freeze header row -- */
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
}

/* ------------------------------------------------------------------ */
/*  Styled single-sheet Excel export with logic sheet                  */
/* ------------------------------------------------------------------ */

export function exportStyledExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName?: string,
) {
  if (!data || data.length === 0) return;

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();

  applySheetStyles(ws);

  XLSX.utils.book_append_sheet(wb, ws, sheetName || '数据');

  /* -- Add calculation logic sheet -- */
  const logicWs = createLogicSheet();
  XLSX.utils.book_append_sheet(wb, logicWs, '计算逻辑说明');

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/* ------------------------------------------------------------------ */
/*  Multi-sheet Excel export with logic sheet                          */
/* ------------------------------------------------------------------ */

export function exportMultiSheetExcel(
  sheets: { name: string; data: Record<string, unknown>[] }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new();

  sheets.forEach((s) => {
    if (!s.data || s.data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(s.data);
    applySheetStyles(ws);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  });

  /* -- Add calculation logic sheet -- */
  const logicWs = createLogicSheet();
  XLSX.utils.book_append_sheet(wb, logicWs, '计算逻辑说明');

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/* ------------------------------------------------------------------ */
/*  Chart PNG export via html2canvas                                   */
/* ------------------------------------------------------------------ */

export async function exportChartToPng(
  element: HTMLElement | null,
  filename: string,
) {
  if (!element) return;
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(element, {
    backgroundColor: '#111827',
    scale: 2,
    useCORS: true,
    logging: false,
  });
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/* ------------------------------------------------------------------ */
/*  Legacy simple export (kept for compatibility)                      */
/* ------------------------------------------------------------------ */

export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName?: string,
) {
  exportStyledExcel(data, filename, sheetName);
}

/* ------------------------------------------------------------------ */
/*  Page-specific export helpers                                       */
/* ------------------------------------------------------------------ */

export function exportOverviewExcel(overviewData: Record<string, unknown>[]) {
  if (!overviewData || overviewData.length === 0) return;
  exportStyledExcel(
    overviewData,
    '设备运行总览数据',
    '总览数据',
  );
}

export function exportEquipmentExcel(
  gapData: Record<string, unknown>[],
  shiftData: Record<string, unknown>[],
) {
  const sheets: { name: string; data: Record<string, unknown>[] }[] = [];
  if (gapData && gapData.length > 0) {
    sheets.push({ name: '空窗数据', data: gapData });
  }
  if (shiftData && shiftData.length > 0) {
    sheets.push({ name: '班次数据', data: shiftData });
  }
  if (sheets.length === 0) return;
  exportMultiSheetExcel(sheets, '机台运行详情数据');
}

export function exportEfficiencyExcel(efficiencyData: Record<string, unknown>[]) {
  if (!efficiencyData || efficiencyData.length === 0) return;
  exportStyledExcel(efficiencyData, '效率对比数据', '效率数据');
}

export function exportYieldExcel(batchData: Record<string, unknown>[]) {
  if (!batchData || batchData.length === 0) return;
  exportStyledExcel(batchData, '良率分析数据', '良率数据');
}
