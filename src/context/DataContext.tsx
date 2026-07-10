import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface OverviewRecord {
  equipment: string;
  date: string;
  avgOutput: number;
  avgUtilization: number;
  avgIdleTime: number;
  recordCount: number;
}

export interface EfficiencyRecord {
  equipment: string;
  date: string;
  shift: string;
  team: string;
  utilization: number;
}

export interface YieldBatch {
  workOrder: string;
  date: string;
  equipment: string;
  yieldPercent: number;
  bin12Ratio: number;
}

export interface MonthlyYieldStat {
  month: string;
  avgYield: number;
  avgBin12Ratio: number;
  batchCount: number;
}

export interface GapRecord {
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  category: string;
}

export interface EquipmentDetail {
  daily: Array<{
    date: string;
    totalPieces: number;
    utilization: number;
    idleTime: number;
  }>;
  shiftData: Array<{
    date: string;
    shift: string;
    pieces: number;
    utilization: number;
  }>;
  hourlyDist: Array<{
    hour: number;
    utilization: number;
    count: number;
  }>;
  gaps: GapRecord[];
  gapStats: Record<string, number>;
}

export interface GanttRecord {
  date: string;
  station: string;
  startTime: string;
  endTime: string;
  startHour: number;
  endHour: number;
  duration: number;
  workOrder: string;
  shift: string;
}

export interface AnalysisData {
  overview: OverviewRecord[];
  details: Record<string, EquipmentDetail>;
  efficiency: EfficiencyRecord[];
  yield: {
    allBatches: Array<{
      batchId: string;
      yield: number;
      bin12Ratio: number;
      waferCount: number;
      delivered: string;
      month: string;
      workOrder: string;
      pieces: number;
    }>;
    recent10Batches: Array<{
      batchId: string;
      yield: number;
      bin12Ratio: number;
      waferCount: number;
      delivered: string;
      month: string;
      workOrder: string;
      pieces: number;
    }>;
    monthlyStats: Array<{
      month: string;
      avgYield: number;
      avgBin12: number;
      totalWafers: number;
      batchCount: number;
      deliveredCount: number;
    }>;
  };
  gantt: Record<string, GanttRecord[]>;
  gapPie: Record<string, Record<string, number>>;
  efficiencyDetail?: {
    heatmap: Array<{ date: string; equipment: string; shift: string; team: string; utilization: number }>;
    dailyEquipmentUtil: Array<{ date: string; equipment: string; utilization: number; totalTime: number }>;
    weeklyTeam: Array<{ week: string; equipment: string; team: string; avgUtilization: number; count: number }>;
    weeklyShift: Array<{ week: string; equipment: string; shift: string; avgUtilization: number; count: number }>;
    monthlyTeam: Array<{ month: string; equipment: string; team: string; avgUtilization: number; count: number }>;
    monthlyShift: Array<{ month: string; equipment: string; shift: string; avgUtilization: number; count: number }>;
  };
  metadata: {
    equipmentTypes: string[];
    dates: string[];
    teams: string[];
    shifts: string[];
  };
}

interface DataContextType {
  data: AnalysisData | null;
  loading: boolean;
  error: string | null;
  uploadLoading: boolean;
  uploadFiles: (files: FileList) => void;
}

const DataContext = createContext<DataContextType>({
  data: null,
  loading: true,
  error: null,
  uploadLoading: false,
  uploadFiles: () => {},
});

export function useData() {
  return useContext(DataContext);
}

/* ------------------------------------------------------------------ */
/*  Yield to main thread to keep UI responsive                         */
/* ------------------------------------------------------------------ */

function yieldToMain() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------ */
/*  Drag Overlay Component                                             */
/* ------------------------------------------------------------------ */

function DragOverlay({
  visible,
  uploadLoading,
}: {
  visible: boolean;
  uploadLoading: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity"
      style={{
        background: 'rgba(11, 15, 25, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#3B82F6] bg-[#111827] px-16 py-14"
        style={{
          boxShadow: '0 0 40px rgba(59,130,246,0.2)',
          animation: 'pulse-border 1.5s ease-in-out infinite',
        }}
      >
        {uploadLoading ? (
          <>
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-[#3B82F6]" />
            <p className="text-[16px] font-medium text-[#F1F5F9]">正在解析文件...</p>
          </>
        ) : (
          <>
            <Upload className="mb-4 h-12 w-12 text-[#3B82F6]" />
            <p className="mb-2 text-[18px] font-semibold text-[#F1F5F9]">
              拖拽文件到此处上传
            </p>
            <p className="text-[13px] text-[#64748B]">
              支持 .xlsx 格式文件
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data Provider                                                      */
/* ------------------------------------------------------------------ */

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [dragVisible, setDragVisible] = useState(false);
  const dragCounter = useRef(0);
  const dataRef = useRef<AnalysisData | null>(null);
  dataRef.current = data;

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('./analysis_data.json');
      if (!response.ok) throw new Error(`Failed to load data: ${response.status}`);
      const json: AnalysisData = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* -- Drag & drop handlers -- */
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer?.types.includes('Files')) {
      setDragVisible(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragVisible(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Yield Summary Sheet Parser                                       */
  /* ------------------------------------------------------------------ */

  function parseYieldSummarySheet(rows: any[][]): {
    batches: AnalysisData['yield']['allBatches'];
  } {
    // Find header row containing wafer columns like W01, W02...
    const headerRowIndex = rows.findIndex((row) => row && String(row[0]).trim() === '分类');
    if (headerRowIndex === -1) {
      throw new Error('无法识别良率汇总表格式：缺少“分类”行');
    }

    const headerRow = rows[headerRowIndex];
    const waferCols: { idx: number; name: string }[] = [];
    headerRow.forEach((cell, idx) => {
      const s = String(cell || '').trim();
      if (/^W\d+$/i.test(s)) {
        waferCols.push({ idx, name: s.toUpperCase() });
      }
    });

    if (waferCols.length === 0) {
      throw new Error('无法识别良率汇总表格式：未找到 Wxx 晶圆列');
    }

    const findRow = (label: string) =>
      rows.find((r) => r && String(r[0]).trim().toLowerCase() === label.toLowerCase());

    const yieldRow = findRow('良率');
    const bin12GoodRatioRow = findRow('Bin1&2/Good Dies');
    const goodDiesRow = findRow('Good Dies');

    if (!yieldRow) {
      throw new Error('无法识别良率汇总表格式：未找到“良率”行');
    }

    // Extract work order from title row
    const title = String(rows[0]?.[0] || '');
    const workOrderMatch = title.match(/^([A-Z0-9-]+)/i);
    const workOrder = workOrderMatch ? workOrderMatch[1] : 'UNKNOWN';
    const month = new Date().toISOString().slice(0, 7);

    const waferCount = waferCols.length;

    const totalYield = waferCols.reduce(
      (s, { idx }) => s + (parseFloat(String(yieldRow[idx] || '').replace('%', '')) || 0),
      0,
    );
    const totalBin12 = bin12GoodRatioRow
      ? waferCols.reduce(
          (s, { idx }) => s + (parseFloat(String(bin12GoodRatioRow[idx] || '').replace('%', '')) || 0),
          0,
        )
      : 0;
    const totalPieces = goodDiesRow
      ? waferCols.reduce((s, { idx }) => s + (parseInt(String(goodDiesRow[idx])) || 0), 0)
      : 0;

    const batch = {
      batchId: workOrder,
      yield: Math.round((totalYield / waferCount) * 100) / 100,
      bin12Ratio: Math.round((totalBin12 / waferCount) * 100) / 100,
      waferCount,
      delivered: 'Y',
      month,
      workOrder,
      pieces: Math.round(totalPieces / waferCount),
    };

    return { batches: [batch] };
  }

  function computeMonthlyYieldStats(
    batches: AnalysisData['yield']['allBatches'],
  ): AnalysisData['yield']['monthlyStats'] {
    const monthMap = new Map<
      string,
      { totalYield: number; totalBin12: number; totalWafers: number; count: number; delivered: number }
    >();

    batches.forEach((b) => {
      const existing = monthMap.get(b.month);
      if (existing) {
        existing.totalYield += b.yield;
        existing.totalBin12 += b.bin12Ratio;
        existing.totalWafers += b.waferCount;
        existing.count += 1;
        if (b.delivered === 'Y') existing.delivered += 1;
      } else {
        monthMap.set(b.month, {
          totalYield: b.yield,
          totalBin12: b.bin12Ratio,
          totalWafers: b.waferCount,
          count: 1,
          delivered: b.delivered === 'Y' ? 1 : 0,
        });
      }
    });

    return Array.from(monthMap.entries()).map(([month, stats]) => ({
      month,
      avgYield: Math.round((stats.totalYield / stats.count) * 100) / 100,
      avgBin12: Math.round((stats.totalBin12 / stats.count) * 100) / 100,
      batchCount: stats.count,
      totalWafers: stats.totalWafers,
      deliveredCount: stats.delivered,
    }));
  }

  const processXlsxFiles = useCallback(
    async (files: FileList) => {
      setUploadLoading(true);
      const toastId = toast.loading('正在解析 Excel 文件...');
      try {
        const xlsxFiles = Array.from(files).filter((f) =>
          f.name.endsWith('.xlsx') || f.name.endsWith('.xls'),
        );
        if (xlsxFiles.length === 0) {
          toast.error('请上传 .xlsx 或 .xls 格式的 Excel 文件', { id: toastId });
          setUploadLoading(false);
          return;
        }

        // Separate yield summary files from equipment files
        const yieldFiles = xlsxFiles.filter(
          (f) => f.name.includes('良率') || f.name.toLowerCase().includes('yield'),
        );
        const equipmentFiles = xlsxFiles.filter((f) => !yieldFiles.includes(f));

        // Parse yield summary files
        const currentData = dataRef.current;
        let yieldData = currentData?.yield || { allBatches: [], recent10Batches: [], monthlyStats: [] };

        if (yieldFiles.length > 0) {
          toast.loading(`正在解析 ${yieldFiles.length} 个良率汇总文件...`, { id: toastId });
          await yieldToMain();

          const existingBatches = currentData?.yield?.allBatches || [];
          const newBatches: AnalysisData['yield']['allBatches'] = [];

          for (const file of yieldFiles) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            for (const sheetName of workbook.SheetNames) {
              const ws = workbook.Sheets[sheetName];
              const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
              const result = parseYieldSummarySheet(rows);
              newBatches.push(...result.batches);
            }
          }

          const mergedBatches = [...existingBatches, ...newBatches];
          yieldData = {
            allBatches: mergedBatches,
            recent10Batches: mergedBatches.slice(-10),
            monthlyStats: computeMonthlyYieldStats(mergedBatches),
          };
        }

        // If only yield files are uploaded, update yield data and skip equipment calculations
        if (equipmentFiles.length === 0) {
          if (!currentData) {
            toast.error('首次使用请先上传机台运行数据，或刷新页面加载默认数据', { id: toastId });
            setUploadLoading(false);
            return;
          }

          const newData: AnalysisData = { ...currentData, yield: yieldData };
          setData(newData);
          await yieldToMain();
          setUploadLoading(false);
          toast.success(`成功更新良率数据！共 ${yieldData.allBatches.length} 个批次`, { id: toastId });
          return;
        }

        // Parse equipment workbooks
        const allSheets: Record<string, any[][]> = {};
        for (const file of equipmentFiles) {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          for (const sheetName of workbook.SheetNames) {
            const ws = workbook.Sheets[sheetName];
            const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
            allSheets[sheetName] = rows;
          }
        }

        // Detect equipment type from sheet names
        const knownEquipment = ['PECVD', 'DRIE', 'ICP', '光刻机'];
        const equipmentTypes = knownEquipment.filter(eq => allSheets[eq] || Object.keys(allSheets).some(k => k.toUpperCase().includes(eq)));

        if (equipmentTypes.length === 0) {
          // Try to use any available sheets as equipment data
          const availableSheets = Object.keys(allSheets).filter(s => s !== 'Sheet1' || Object.keys(allSheets).length === 1);
          if (availableSheets.length > 0) {
            equipmentTypes.push(...availableSheets);
          }
        }

        // Parse records from each sheet
        interface ParsedRecord {
          date: string;
          team: string;
          shift: string;
          station: string;
          workOrder: string;
          startTime: string;
          endTime: string;
          startHour: number;
          endHour: number;
          duration: number;
          pieces: number;
          equipment: string;
        }

        const allRecords: ParsedRecord[] = [];
        const rawGantt: Record<string, any[]> = {};

        /** Return next day in yyyy-MM-dd form without timezone surprises. */
        function addOneDay(dateStr: string): string {
          const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
          const dt = new Date(y, m - 1, d + 1);
          return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        }

        /**
         * Split overnight/multi-day records (endHour > 24) into calendar-day
         * segments. Used for gap and hourly-distribution calculations so a
         * record running across midnight contributes the correct hours to each
         * calendar day. Pieces are kept on the original record only.
         */
        function splitOvernightForTimeAnalysis(records: ParsedRecord[]): ParsedRecord[] {
          const result: ParsedRecord[] = [];
          for (const r of records) {
            if (r.endHour <= 24) {
              result.push(r);
              continue;
            }

            let currentDate = r.date;
            let currentStartHour = r.startHour;
            let dayIndex = 0;
            let remainingEndHour = r.endHour;

            while (remainingEndHour > 24) {
              const segmentEndHour = 24;
              result.push({
                ...r,
                date: currentDate,
                startTime: dayIndex === 0 ? r.startTime : '00:00',
                startHour: currentStartHour,
                endTime: '24:00',
                endHour: segmentEndHour,
                duration: Math.round((segmentEndHour - currentStartHour) * 60),
                pieces: 0,
              });

              remainingEndHour -= 24;
              currentDate = addOneDay(currentDate);
              currentStartHour = 0;
              dayIndex += 1;
            }

            // Last segment: midnight ~ actual end
            result.push({
              ...r,
              date: currentDate,
              startTime: '00:00',
              startHour: 0,
              endTime: r.endTime,
              endHour: remainingEndHour,
              duration: Math.round(remainingEndHour * 60),
              pieces: 0,
            });
          }
          return result;
        }

        for (const eq of equipmentTypes) {
          const sheetName = Object.keys(allSheets).find(k => k === eq || k.toUpperCase().includes(eq)) || eq;
          const rows = allSheets[sheetName];
          if (!rows || rows.length < 2) continue;

          const headers: string[] = (rows[0] || []).map((h: any) => String(h || '').trim());

          // Find column indices
          const colIdx: Record<string, number> = {};
          headers.forEach((h, i) => {
            if (h.includes('日期')) colIdx.date = i;
            else if (h.includes('班组')) colIdx.team = i;
            else if (h.includes('班次')) colIdx.shift = i;
            else if (h.includes('站点')) colIdx.station = i;
            else if (h.includes('工单')) colIdx.workOrder = i;
            else if (h.includes('开始')) colIdx.startTime = i;
            else if (h.includes('结束')) colIdx.endTime = i;
            else if (h.includes('片数') || h.includes('工艺片数')) colIdx.pieces = i;
            else if (h.includes('耗时') || h.includes('min')) colIdx.duration = i;
          });

          rawGantt[eq] = [];
          const eqRecords: ParsedRecord[] = [];

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every((c: any) => !c)) continue;

            const dateStr = colIdx.date !== undefined ? String(row[colIdx.date] || '') : '';
            if (!dateStr) continue;

            // Parse date: supports 'YYYY-MM-DD', 'MM/DD/YYYY', 'M/D/YYYY', 'MM/DD', 'M/D'
            let parsedDate = dateStr;
            if (dateStr.includes('/')) {
              const parts = dateStr.split('/').map((p) => p.trim());
              if (parts.length === 3) {
                parsedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
              } else if (parts.length === 2) {
                const currentYear = new Date().getFullYear();
                parsedDate = `${currentYear}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
              }
            }

            // Parse times
            const startStr = colIdx.startTime !== undefined ? String(row[colIdx.startTime] || '') : '';
            const endStr = colIdx.endTime !== undefined ? String(row[colIdx.endTime] || '') : '';

            // Convert time to decimal hours
            const timeToDecimal = (t: string): number => {
              if (!t) return 0;
              // Handle "HH:MM" or "HH:MM:SS" or decimal
              if (t.includes(':')) {
                const parts = t.split(':');
                return parseInt(parts[0]) + parseInt(parts[1]) / 60;
              }
              return parseFloat(t) || 0;
            };

            const startHour = timeToDecimal(startStr);
            let endHour = timeToDecimal(endStr);

            // Handle overnight (end < start). Shifts ending at 00:00 mean
            // next-day midnight, so endHour === 0 must also be treated as
            // crossing midnight.
            if (endHour < startHour) {
              endHour += 24;
            }

            const durVal = colIdx.duration !== undefined ? parseFloat(String(row[colIdx.duration]).replace(/[^0-9.]/g, '')) || 0 : 0;
            const duration = durVal > 0 ? durVal : Math.max(0, (endHour - startHour) * 60);

            const record: ParsedRecord = {
              date: parsedDate,
              team: colIdx.team !== undefined ? String(row[colIdx.team] || '') : '',
              shift: colIdx.shift !== undefined ? String(row[colIdx.shift] || '') : '',
              station: colIdx.station !== undefined ? String(row[colIdx.station] || '') : '',
              workOrder: colIdx.workOrder !== undefined ? String(row[colIdx.workOrder] || '') : '',
              startTime: startStr,
              endTime: endStr,
              startHour,
              endHour,
              duration,
              pieces: colIdx.pieces !== undefined ? parseInt(String(row[colIdx.pieces])) || 0 : 0,
              equipment: eq,
            };

            eqRecords.push(record);
            allRecords.push(record);

            rawGantt[eq].push({
              date: parsedDate,
              station: record.station,
              startTime: startStr,
              endTime: endStr,
              startHour,
              endHour,
              duration,
              workOrder: record.workOrder,
              shift: record.shift,
            });
          }
        }

        if (allRecords.length === 0) {
          toast.error('未能从文件中解析出有效数据，请检查文件格式', { id: toastId });
          setUploadLoading(false);
          return;
        }

        // Split overnight records so gap/hourly calculations treat each calendar
        // day independently. Original allRecords is still used for output/shift
        // stats because pieces belong to the record's start date.
        const allTimeSegments = splitOvernightForTimeAnalysis(allRecords);

        toast.loading(`已解析 ${allRecords.length} 条记录，正在计算指标...`, { id: toastId });
        await yieldToMain();

        // Compute analysis data from parsed records
        const dates = [...new Set(allRecords.map(r => r.date))].sort();
        const equipmentList = [...new Set(allRecords.map(r => r.equipment))];
        const teams = [...new Set(allRecords.map(r => r.team).filter(Boolean))];
        const shifts = [...new Set(allRecords.map(r => r.shift).filter(Boolean))];

        // Compute overview
        const overview: any[] = [];
        for (const eq of equipmentList) {
          for (const date of dates) {
            const dayRecs = allRecords.filter(r => r.equipment === eq && r.date === date);
            if (dayRecs.length === 0) continue;
            const totalTime = dayRecs.reduce((s, r) => s + r.duration, 0);
            const totalPieces = dayRecs.reduce((s, r) => s + r.pieces, 0);

            // Calculate gaps from day-bound time segments (overnight records split)
            const daySegments = allTimeSegments.filter(r => r.equipment === eq && r.date === date);
            const sortedRecs = [...daySegments].sort((a, b) => a.startHour - b.startHour);
            let totalGap = 0;
            for (let i = 0; i < sortedRecs.length - 1; i++) {
              const gap = (sortedRecs[i + 1].startHour - sortedRecs[i].endHour) * 60;
              if (gap > 0) totalGap += gap;
            }

            overview.push({
              equipment: eq,
              date,
              avgOutput: totalPieces,
              avgUtilization: Math.min((totalTime / 1440) * 100, 100),
              avgIdleTime: Math.round(totalGap),
              recordCount: dayRecs.length,
            });
          }
        }

        await yieldToMain();

        // Compute details per equipment
        const details: Record<string, any> = {};
        const gapPie: Record<string, any> = {};
        const efficiency: any[] = [];

        for (const eq of equipmentList) {
          const eqRecs = allRecords.filter(r => r.equipment === eq);
          const eqTimeSegments = allTimeSegments.filter(r => r.equipment === eq);

          // Daily
          const daily: any[] = [];
          const shiftData: any[] = [];
          const hourlyDist: Record<string, Record<string, number>> = {};
          const gaps: Record<string, any[]> = {};
          const gapDetails: any[] = [];

          for (const date of dates) {
            const dayRecs = eqRecs.filter(r => r.date === date);
            const daySegments = eqTimeSegments.filter(r => r.date === date);
            if (dayRecs.length === 0) continue;

            const totalTime = dayRecs.reduce((s, r) => s + r.duration, 0);
            const totalPieces = dayRecs.reduce((s, r) => s + r.pieces, 0);

            daily.push({ date, totalPieces, utilization: Math.min((totalTime / 1440) * 100, 100), idleTime: 0 });

            // Shift data
            for (const shift of shifts) {
              const shiftRecs = dayRecs.filter(r => r.shift === shift);
              if (shiftRecs.length === 0) continue;
              const shiftTime = shiftRecs.reduce((s, r) => s + r.duration, 0);
              const shiftPieces = shiftRecs.reduce((s, r) => s + r.pieces, 0);
              shiftData.push({ date, shift, pieces: shiftPieces, utilization: Math.min((shiftTime / 720) * 100, 100) });

              // Efficiency records
              for (const team of teams) {
                const teamRecs = shiftRecs.filter(r => r.team === team);
                if (teamRecs.length === 0) continue;
                const teamTime = teamRecs.reduce((s, r) => s + r.duration, 0);
                efficiency.push({ equipment: eq, date, shift, team, utilization: Math.min((teamTime / 720) * 100, 100) });
              }
            }

            // Hourly distribution (use day-bound segments so overnight runs
            // don't spill hours past midnight into the wrong day)
            const hourly: Record<string, number> = {};
            for (let h = 0; h < 24; h++) hourly[String(h)] = 0;
            for (const rec of daySegments) {
              const sH = Math.floor(rec.startHour);
              const eH = Math.floor(rec.endHour);
              for (let h = sH; h <= Math.min(eH, 23); h++) {
                hourly[String(h)] = (hourly[String(h)] || 0) + rec.duration / Math.max(eH - sH + 1, 1);
              }
            }
            hourlyDist[date] = hourly;

            // Gaps (use day-bound segments so an overnight run ending at 01:00
            // produces a gap from 01:00, not from 00:00)
            const sorted = [...daySegments].sort((a, b) => a.startHour - b.startHour);
            const dayGaps: any[] = [];
            for (let i = 0; i < sorted.length - 1; i++) {
              const gapMin = (sorted[i + 1].startHour - sorted[i].endHour) * 60;
              if (gapMin > 0) {
                let cat = '>60min';
                if (gapMin <= 10) cat = '\u226410min';
                else if (gapMin <= 30) cat = '10~30min';
                else if (gapMin <= 60) cat = '30~60min';
                dayGaps.push({
                  start: sorted[i].endTime,
                  end: sorted[i + 1].startTime,
                  duration: Math.round(gapMin),
                  category: cat,
                });
                gapDetails.push({ date, start: sorted[i].endTime, end: sorted[i + 1].startTime, duration: Math.round(gapMin), category: cat });
              }
            }
            gaps[date] = dayGaps;

            // Calculate idle time from gaps
            const dayIdle = dayGaps.reduce((s, g) => s + g.duration, 0);
            const dayEntry = daily.find(d => d.date === date);
            if (dayEntry) dayEntry.idleTime = dayIdle;
          }

          // Gap stats
          const catCounts: Record<string, number> = { '\u226410min': 0, '10~30min': 0, '30~60min': 0, '>60min': 0 };
          for (const g of gapDetails) {
            catCounts[g.category] = (catCounts[g.category] || 0) + 1;
          }
          gapPie[eq] = catCounts;

          details[eq] = {
            equipment: eq,
            dates,
            daily,
            shiftData,
            hourlyDist,
            gaps,
            gapStats: catCounts,
            gapDetails,
          };
        }

        await yieldToMain();

        // Compute efficiencyDetail for the Efficiency page
        const heatmap: Array<{ date: string; equipment: string; shift: string; team: string; utilization: number }> = [];
        const dailyEquipmentUtil: Array<{ date: string; equipment: string; utilization: number; totalTime: number }> = [];
        for (const date of dates) {
          for (const eq of equipmentList) {
            const dayRecs = allRecords.filter(r => r.equipment === eq && r.date === date);
            if (dayRecs.length === 0) continue;
            const totalTime = dayRecs.reduce((s, r) => s + r.duration, 0);
            dailyEquipmentUtil.push({ date, equipment: eq, utilization: Math.min((totalTime / 1440) * 100, 100), totalTime });
            for (const shift of shifts) {
              const shiftRecs = dayRecs.filter(r => r.shift === shift);
              if (shiftRecs.length === 0) continue;
              for (const team of teams) {
                const teamRecs = shiftRecs.filter(r => r.team === team);
                if (teamRecs.length === 0) continue;
                const teamTime = teamRecs.reduce((s, r) => s + r.duration, 0);
                heatmap.push({ date, equipment: eq, shift, team, utilization: Math.min((teamTime / 720) * 100, 100) });
              }
            }
          }
        }
        const getWeekKey = (d: string) => {
          const dt = new Date(d);
          const y = dt.getFullYear();
          const firstDay = new Date(y, 0, 1);
          const pastDays = (dt.getTime() - firstDay.getTime()) / 86400000;
          const w = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
          return `${y}-W${String(w).padStart(2, '0')}`;
        };
        const getMonthKey = (d: string) => d.slice(0, 7);
        const weeklyTeam: Array<{ week: string; equipment: string; team: string; avgUtilization: number; count: number }> = [];
        const weeklyShift: Array<{ week: string; equipment: string; shift: string; avgUtilization: number; count: number }> = [];
        const monthlyTeam: Array<{ month: string; equipment: string; team: string; avgUtilization: number; count: number }> = [];
        const monthlyShift: Array<{ month: string; equipment: string; shift: string; avgUtilization: number; count: number }> = [];
        for (const eq of equipmentList) {
          for (const team of teams) {
            for (const week of [...new Set(dates.map(getWeekKey))]) {
              const vals = heatmap.filter(h => h.equipment === eq && h.team === team && getWeekKey(h.date) === week);
              if (vals.length) weeklyTeam.push({ week, equipment: eq, team, avgUtilization: Math.round(vals.reduce((s, v) => s + v.utilization, 0) / vals.length * 100) / 100, count: vals.length });
            }
            for (const month of [...new Set(dates.map(getMonthKey))]) {
              const vals = heatmap.filter(h => h.equipment === eq && h.team === team && getMonthKey(h.date) === month);
              if (vals.length) monthlyTeam.push({ month, equipment: eq, team, avgUtilization: Math.round(vals.reduce((s, v) => s + v.utilization, 0) / vals.length * 100) / 100, count: vals.length });
            }
          }
          for (const shift of shifts) {
            for (const week of [...new Set(dates.map(getWeekKey))]) {
              const vals = heatmap.filter(h => h.equipment === eq && h.shift === shift && getWeekKey(h.date) === week);
              if (vals.length) weeklyShift.push({ week, equipment: eq, shift, avgUtilization: Math.round(vals.reduce((s, v) => s + v.utilization, 0) / vals.length * 100) / 100, count: vals.length });
            }
            for (const month of [...new Set(dates.map(getMonthKey))]) {
              const vals = heatmap.filter(h => h.equipment === eq && h.shift === shift && getMonthKey(h.date) === month);
              if (vals.length) monthlyShift.push({ month, equipment: eq, shift, avgUtilization: Math.round(vals.reduce((s, v) => s + v.utilization, 0) / vals.length * 100) / 100, count: vals.length });
            }
          }
        }

        await yieldToMain();

        const newData: AnalysisData = {
          overview,
          details,
          efficiency,
          yield: yieldData,
          gantt: rawGantt,
          gapPie,
          efficiencyDetail: {
            heatmap,
            dailyEquipmentUtil,
            weeklyTeam,
            weeklyShift,
            monthlyTeam,
            monthlyShift,
          },
          metadata: {
            equipmentTypes: equipmentList,
            dates,
            teams,
            shifts,
          },
        };

        setData(newData);
        await yieldToMain();
        setUploadLoading(false);
        toast.success(`成功解析并更新数据！共 ${allRecords.length} 条记录，${equipmentTypes.length} 个机台`, { id: toastId });
      } catch (err) {
        console.error('文件解析失败:', err);
        setUploadLoading(false);
        toast.error(`文件解析失败：${err instanceof Error ? err.message : '请检查文件格式是否正确'}`, { id: toastId });
      }
    },
    [], // no dependencies - uses ref
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragVisible(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processXlsxFiles(files);
      }
    },
    [processXlsxFiles],
  );

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  const uploadFiles = useCallback(
    (fileList: FileList) => {
      processXlsxFiles(fileList);
    },
    [processXlsxFiles],
  );

  return (
    <DataContext.Provider value={{ data, loading, error, uploadLoading, uploadFiles }}>
      <DragOverlay visible={dragVisible} uploadLoading={uploadLoading} />
      {children}
    </DataContext.Provider>
  );
}
