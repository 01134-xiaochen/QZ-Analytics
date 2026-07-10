import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
  Cell, PieChart, Pie, LabelList,
} from 'recharts';
import {
  Download, BarChart3, Gauge, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, Info, ArrowUp, ArrowDown,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { format, parseISO } from 'date-fns';
import GanttChart from '@/components/GanttChart';
import { exportEquipmentExcel, exportChartToPng, exportStyledExcel } from '@/lib/export';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EQUIPMENT_LIST = [
  { name: 'PECVD', color: '#10B981', label: 'PECVD' },
  { name: 'DRIE', color: '#F59E0B', label: 'DRIE' },
  { name: 'ICP', color: '#3B82F6', label: 'ICP' },
  { name: '光刻机', color: '#EC4899', label: '光刻机' },
] as const;

const SHIFT_COLORS = {
  day: '#F59E0B',
  night: '#6366F1',
} as const;

const GAP_CATEGORIES = [
  { key: '≤10min', color: '#22D3EE', label: '≤10min', desc: '短时空窗 (换片/调整)' },
  { key: '10~30min', color: '#A78BFA', label: '10~30min', desc: '中时空窗 (维护/等待)' },
  { key: '30~60min', color: '#FB923C', label: '30~60min', desc: '较长空窗 (换料/清洁)' },
  { key: '>60min', color: '#F43F5E', label: '>60min', desc: '长时空窗 (故障/停机)' },
] as const;

const ROWS_PER_PAGE = 15;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DailyRecord {
  date: string;
  totalPieces: number;
  utilization: number;
  idleTime: number;
}

interface ShiftRecord {
  date: string;
  shift: string;
  pieces: number;
  utilization: number;
}

interface HourlyData {
  [date: string]: { [hour: string]: number };
}

interface GapItem {
  start: string;
  end: string;
  duration: number;
  category: string;
}

interface GapsByDate {
  [date: string]: GapItem[];
}

interface EquipmentData {
  equipment: string;
  dates: string[];
  daily: DailyRecord[];
  shiftData: ShiftRecord[];
  hourlyDist: HourlyData;
  gaps: GapsByDate;
  gapStats: Record<string, number>;
  gapDetails: GapItem[];
}

type CategoryFilter = 'all' | '≤10min' | '10~30min' | '30~60min' | '>60min';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const easeOutCubic = [0.22, 1, 0.36, 1] as [number, number, number, number];

function useAnimatedNumber(value: number, decimals = 1) {
  const [display, setDisplay] = useState('0');

  useMemo(() => {
    const duration = 800;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = value * eased;
      setDisplay(current.toFixed(decimals));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

function getUtilColor(v: number) {
  if (v >= 80) return '#10B981';
  if (v >= 50) return '#F59E0B';
  return '#EF4444';
}

function getIdleColor(v: number) {
  if (v < 60) return '#10B981';
  if (v <= 300) return '#F59E0B';
  return '#EF4444';
}

function formatDateShort(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'MM/dd');
  } catch {
    return dateStr.slice(5);
  }
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltips                                                    */
/* ------------------------------------------------------------------ */

function ShiftOutputTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, e) => s + (Number(e.value) || 0), 0);
  return (
    <div className="rounded-lg border border-[#374151] p-3" style={{ background: 'rgba(26,35,50,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      <p className="mb-2 text-[13px] font-bold text-[#F1F5F9]">{label}</p>
      {payload.map((e) => (
        <div key={e.name} className="mb-1 flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: e.color }} />
          <span className="text-[#94A3B8]">{e.name}</span>
          <span className="ml-auto font-bold text-[#F1F5F9]">{Number(e.value).toFixed(0)} 片</span>
        </div>
      ))}
      <div className="mt-1.5 border-t border-[#374151] pt-1 text-[12px] font-bold text-[#F1F5F9]">
        合计 {total.toFixed(0)} 片
      </div>
    </div>
  );
}

function UtilTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#374151] p-3" style={{ background: 'rgba(26,35,50,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      <p className="mb-2 text-[13px] font-bold text-[#F1F5F9]">{label}</p>
      {payload.map((e) => (
        <div key={e.name} className="mb-1 flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: e.color }} />
          <span className="text-[#94A3B8]">{e.name}</span>
          <span className="ml-auto font-bold text-[#F1F5F9]">{Number(e.value).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function IdleTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const val = Number(payload[0]?.value) || 0;
  return (
    <div className="rounded-lg border border-[#374151] p-3" style={{ background: 'rgba(26,35,50,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      <p className="mb-1 text-[13px] font-bold text-[#F1F5F9]">{label}</p>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: payload[0]?.color }} />
        <span className="text-[#94A3B8]">空窗时间</span>
        <span className="ml-auto font-bold text-[#F1F5F9]">{val.toFixed(0)} 分钟</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export Button                                                      */
/* ------------------------------------------------------------------ */

function ExportButton({ tooltip = '导出数据', onExport }: { tooltip?: string; onExport?: () => void }) {
  return (
    <div className="group relative">
      <button
        onClick={onExport}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#1A2332] hover:text-[#F1F5F9]"
      >
        <Download className="h-4 w-4" />
      </button>
      <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-md bg-[#1A2332] px-2 py-1 text-[11px] text-[#94A3B8] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {tooltip}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category Badge                                                     */
/* ------------------------------------------------------------------ */

function CategoryBadge({ category }: { category: string }) {
  const cfg = GAP_CATEGORIES.find((c) => c.key === category);
  const color = cfg?.color ?? '#94A3B8';
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {category}
    </span>
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function EquipmentDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data, loading, error } = useData();

  /* -- State -- */
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [page, setPage] = useState(1);
  const ganttRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const shiftOutputChartRef = useRef<HTMLDivElement>(null);
  const shiftUtilChartRef = useRef<HTMLDivElement>(null);
  const idleChartRef = useRef<HTMLDivElement>(null);

  /* -- Derived data -- */
  const eqConfig = useMemo(() =>
    EQUIPMENT_LIST.find((e) => e.name === name) ?? EQUIPMENT_LIST[0],
    [name],
  );

  const eqData: EquipmentData | null = useMemo(() => {
    if (!data || !name) return null;
    const d = data.details[name];
    if (!d) return null;
    return d as unknown as EquipmentData;
  }, [data, name]);

  const dates: string[] = useMemo(() => eqData?.dates ?? [], [eqData]);

  /* Set default selected date */
  useMemo(() => {
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[dates.length - 1]);
    }
  }, [dates, selectedDate]);

  /* -- Gantt data -- */
  const ganttRecords = useMemo(() => {
    if (!data?.gantt || !name) return [];
    const records = data.gantt[name] || [];
    return records
      .filter((r: any) => r.date === selectedDate)
      .map((r: any) => ({
        station: r.station,
        startHour: r.startHour,
        endHour: r.endHour,
        duration: r.duration,
        workOrder: r.workOrder,
        shift: r.shift,
        startTime: r.startTime,
        endTime: r.endTime,
      }));
  }, [data, name, selectedDate]);

  /* -- KPI calculations -- */
  const kpis = useMemo(() => {
    if (!eqData?.daily.length) {
      return { avgOutput: 0, avgUtilization: 0, avgIdleTime: 0, totalGaps: 0 };
    }
    const daily = eqData.daily;
    const avgOutput = daily.reduce((s, d) => s + d.totalPieces, 0) / daily.length;
    const avgUtilization = daily.reduce((s, d) => s + d.utilization, 0) / daily.length;
    const avgIdleTime = daily.reduce((s, d) => s + d.idleTime, 0) / daily.length;
    const totalGaps = Object.values(eqData.gapStats).reduce((s, v) => s + v, 0);
    return { avgOutput, avgUtilization, avgIdleTime, totalGaps };
  }, [eqData]);

  /* -- Shift output stacked data -- */
  const shiftOutputData = useMemo(() => {
    if (!eqData) return [];
    const byDate: Record<string, { date: string; day: number; night: number }> = {};
    for (const d of eqData.daily) {
      byDate[d.date] = { date: formatDateShort(d.date), day: 0, night: 0 };
    }
    for (const s of eqData.shiftData) {
      const key = s.date;
      if (!byDate[key]) byDate[key] = { date: formatDateShort(key), day: 0, night: 0 };
      if (s.shift === '白') byDate[key].day = s.pieces;
      else byDate[key].night = s.pieces;
    }
    return dates.map((d) => byDate[d] ?? { date: formatDateShort(d), day: 0, night: 0 });
  }, [eqData, dates]);

  /* -- Shift utilization data -- */
  const shiftUtilData = useMemo(() => {
    if (!eqData) return [];
    const byDate: Record<string, { date: string; dayUtil: number; nightUtil: number }> = {};
    for (const d of eqData.daily) {
      byDate[d.date] = { date: formatDateShort(d.date), dayUtil: 0, nightUtil: 0 };
    }
    for (const s of eqData.shiftData) {
      const key = s.date;
      if (!byDate[key]) byDate[key] = { date: formatDateShort(key), dayUtil: 0, nightUtil: 0 };
      if (s.shift === '白') byDate[key].dayUtil = s.utilization;
      else byDate[key].nightUtil = s.utilization;
    }
    return dates.map((d) => byDate[d] ?? { date: formatDateShort(d), dayUtil: 0, nightUtil: 0 });
  }, [eqData, dates]);

  /* -- Shift summary -- */
  const shiftSummary = useMemo(() => {
    if (!eqData) return { avgDayPieces: 0, avgDayUtil: 0, dayDays: 0, avgNightPieces: 0, avgNightUtil: 0, nightDays: 0 };
    const dayShifts = eqData.shiftData.filter((s) => s.shift === '白');
    const nightShifts = eqData.shiftData.filter((s) => s.shift === '夜');
    return {
      avgDayPieces: dayShifts.length ? dayShifts.reduce((s, d) => s + d.pieces, 0) / dayShifts.length : 0,
      avgDayUtil: dayShifts.length ? dayShifts.reduce((s, d) => s + d.utilization, 0) / dayShifts.length : 0,
      dayDays: dayShifts.length,
      avgNightPieces: nightShifts.length ? nightShifts.reduce((s, d) => s + d.pieces, 0) / nightShifts.length : 0,
      avgNightUtil: nightShifts.length ? nightShifts.reduce((s, d) => s + d.utilization, 0) / nightShifts.length : 0,
      nightDays: nightShifts.length,
    };
  }, [eqData]);

  /* -- Idle time data -- */
  const idleData = useMemo(() => {
    if (!eqData) return [];
    return dates.map((d) => {
      const day = eqData.daily.find((x) => x.date === d);
      return {
        date: formatDateShort(d),
        idleTime: day?.idleTime ?? 0,
      };
    });
  }, [eqData, dates]);

  const idleSummary = useMemo(() => {
    if (!eqData?.daily.length) {
      return { totalIdle: 0, avgIdle: 0, maxIdle: 0, maxDate: '-', trend: 0 };
    }
    const daily = eqData.daily;
    const totalIdle = daily.reduce((s, d) => s + d.idleTime, 0);
    const avgIdle = totalIdle / daily.length;
    const maxDay = daily.reduce((max, d) => (d.idleTime > max.idleTime ? d : max), daily[0]);
    const half = Math.floor(daily.length / 2);
    const firstHalf = daily.slice(0, half).reduce((s, d) => s + d.idleTime, 0) / (half || 1);
    const secondHalf = daily.slice(half).reduce((s, d) => s + d.idleTime, 0) / (daily.length - half || 1);
    return {
      totalIdle,
      avgIdle,
      maxIdle: maxDay.idleTime,
      maxDate: formatDateShort(maxDay.date),
      trend: secondHalf - firstHalf,
    };
  }, [eqData]);

  /* -- Gap stats -- */
  const gapStatsArr = useMemo(() => {
    if (!eqData) return [];
    const total = Object.values(eqData.gapStats).reduce((s, v) => s + v, 0);
    return GAP_CATEGORIES.map((cat) => {
      const count = eqData.gapStats[cat.key] ?? 0;
      return {
        ...cat,
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) : '0.0',
      };
    });
  }, [eqData]);

  /* -- Gap pie data -- */
  const pieData = useMemo(() => {
    if (!data || !name) return [];
    const raw = (data as any).gapPie?.[name];
    if (!raw) return [];
    const total = Object.values(raw).reduce((s: number, v: unknown) => s + (v as number), 0) as number;
    return GAP_CATEGORIES.map((cat) => {
      const count = (raw[cat.key] as number) ?? 0;
      return {
        name: cat.label,
        value: count,
        color: cat.color,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) : '0.0',
      };
    }).filter((d) => d.value > 0);
  }, [data, name]);

  /* -- Flattened gap records -- */
  const allGapRecords = useMemo(() => {
    if (!eqData) return [];
    const records: Array<{
      date: string;
      start: string;
      end: string;
      duration: number;
      category: string;
    }> = [];
    for (const [date, gaps] of Object.entries(eqData.gaps)) {
      for (const g of gaps) {
        records.push({ date, ...g });
      }
    }
    return records;
  }, [eqData]);

  const filteredGapRecords = useMemo(() => {
    if (categoryFilter === 'all') return allGapRecords;
    return allGapRecords.filter((r) => r.category === categoryFilter);
  }, [allGapRecords, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredGapRecords.length / ROWS_PER_PAGE));
  const pagedGaps = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filteredGapRecords.slice(start, start + ROWS_PER_PAGE);
  }, [filteredGapRecords, page]);

  /* Reset page on filter change */
  useMemo(() => {
    setPage(1);
  }, [categoryFilter]);

  /* -- Animated numbers -- */
  const animAvgOutput = useAnimatedNumber(kpis.avgOutput, 1);
  const animAvgUtil = useAnimatedNumber(kpis.avgUtilization, 1);
  const animAvgIdle = useAnimatedNumber(kpis.avgIdleTime, 1);
  const animTotalGaps = useAnimatedNumber(kpis.totalGaps, 0);

  /* -- Loading / Error -- */
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#374151] border-t-[#3B82F6]" />
      </div>
    );
  }

  if (error || !eqData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-[#94A3B8]">{error ?? '未找到设备数据'}</p>
      </div>
    );
  }

  /* ================================================================= */
  /*  RENDER                                                             */
  /* ================================================================= */

  return (
    <div className="mx-auto max-w-[1440px] px-6 pt-6 pb-10">

      {/* ===== Section 1: Page Header ===== */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: easeOutCubic }}
        className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"
      >
        <div>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]"
            style={{ borderColor: `${eqConfig.color}50`, background: '#1A2332' }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eqConfig.color }} />
            <span style={{ color: eqConfig.color }}>{eqConfig.name}</span>
          </motion.div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#F1F5F9]">
            <span style={{ color: eqConfig.color }}>{eqConfig.name}</span> 运行详情
          </h1>
          <p className="mt-1 text-[14px] text-[#64748B]">白夜班对比分析与空窗统计</p>
          <p className="mt-1 text-[12px] text-[#64748B]">
            数据周期: {dates[0] ?? '-'} ~ {dates[dates.length - 1] ?? '-'} ({dates.length}天)
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex items-center gap-2"
        >
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-[#1F2937] bg-[#111827] px-3 py-2 text-[13px] text-[#F1F5F9] outline-none focus:border-[#374151]"
          >
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <ExportButton
            tooltip="导出数据"
            onExport={() =>
              exportEquipmentExcel(
                allGapRecords.map((g) => ({
                  日期: g.date,
                  开始时间: g.start,
                  结束时间: g.end,
                  持续分钟: g.duration,
                  分类: g.category,
                })),
                (eqData?.shiftData ?? []).map((s) => ({
                  日期: s.date,
                  班次: s.shift,
                  产出: s.pieces,
                  利用率: s.utilization,
                })),
              )
            }
          />
        </motion.div>
      </motion.div>

      {/* ===== Section 2: Equipment Selector Tabs ===== */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mb-6 flex gap-1 rounded-xl border border-[#1F2937] bg-[#111827] p-1"
      >
        {EQUIPMENT_LIST.map((eq, i) => {
          const isActive = eq.name === name;
          return (
            <motion.button
              key={eq.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              onClick={() => navigate(`/equipment/${eq.name}`)}
              className="relative flex-1 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors"
              style={{
                color: isActive ? eq.color : '#64748B',
                background: isActive ? '#1A2332' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = '#94A3B8';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = '#64748B';
              }}
            >
              {eq.label}
              {isActive && (
                <motion.div
                  layoutId="eq-tab-indicator"
                  className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                  style={{ backgroundColor: eq.color }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {/* ===== Section 3: Summary KPI Row ===== */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '平均日产出', value: animAvgOutput, unit: '片', icon: BarChart3, color: eqConfig.color },
          { label: '平均日利用率', value: animAvgUtil, unit: '%', icon: Gauge, color: getUtilColor(kpis.avgUtilization) },
          { label: '平均日空窗', value: animAvgIdle, unit: 'min', icon: Clock, color: kpis.avgIdleTime > 120 ? '#F43F5E' : kpis.avgIdleTime > 60 ? '#F59E0B' : '#10B981' },
          { label: '总空窗次数', value: animTotalGaps, unit: '次', icon: AlertTriangle, color: kpis.totalGaps > 50 ? '#F43F5E' : kpis.totalGaps > 20 ? '#F59E0B' : '#10B981' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1, ease: easeOutCubic }}
            className="group rounded-xl border border-[#1F2937] bg-[#111827] p-5 transition-all hover:border-[#374151]"
            style={{ borderTopWidth: 3, borderTopColor: kpi.color }}
          >
            <div className="mb-2 flex items-center gap-2">
              <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
              <span className="text-[13px] text-[#64748B]">{kpi.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-bold text-[#F1F5F9]">{kpi.value}</span>
              <span className="text-[12px] text-[#94A3B8]">{kpi.unit}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ===== Section 4: Shift Output Stacked Bar Chart ===== */}
      <motion.div
        ref={shiftOutputChartRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: easeOutCubic }}
        className="mb-6 rounded-[14px] border border-[#1F2937] bg-[#111827] p-5 transition-all hover:border-[#374151]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-semibold text-[#F1F5F9]">白夜班产出对比 (堆叠)</h2>
            <div className="flex items-center gap-3 text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SHIFT_COLORS.day }} />
                <span className="text-[#94A3B8]">白班</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SHIFT_COLORS.night }} />
                <span className="text-[#94A3B8]">夜班</span>
              </span>
            </div>
          </div>
          <ExportButton tooltip="导出图表" onExport={() => exportChartToPng(shiftOutputChartRef.current, `${eqConfig.name}_白夜班产出对比`)} />
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={shiftOutputData} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
            <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: '片数', position: 'insideTopLeft', offset: 10, fill: '#64748B', fontSize: 11 }} />
            <Tooltip content={<ShiftOutputTooltip />} />
            <Bar dataKey="day" name="白班" stackId="shiftOutput" fill={SHIFT_COLORS.day} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="day" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => Math.round(v)} />
            </Bar>
            <Bar dataKey="night" name="夜班" stackId="shiftOutput" fill={SHIFT_COLORS.night}>
              <LabelList dataKey="night" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => Math.round(v)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* ===== Section 5: Shift Utilization Comparison ===== */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Left — Grouped Bar Chart */}
        <motion.div
          ref={shiftUtilChartRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: easeOutCubic }}
          className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5 transition-all hover:border-[#374151] lg:col-span-3"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#F1F5F9]">白夜班设备利用率对比</h2>
            <ExportButton tooltip="导出图表" onExport={() => exportChartToPng(shiftUtilChartRef.current, `${eqConfig.name}_白夜班利用率对比`)} />
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={shiftUtilData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: '%', position: 'insideTopLeft', offset: 10, fill: '#64748B', fontSize: 11 }} />
              <Tooltip content={<UtilTooltip />} />
              <ReferenceLine y={80} stroke="#10B981" strokeDasharray="6 3" strokeOpacity={0.6} label={{ value: '80%', position: 'right', fill: '#10B981', fontSize: 10 }} />
              <ReferenceLine y={50} stroke="#F59E0B" strokeDasharray="6 3" strokeOpacity={0.6} label={{ value: '50%', position: 'right', fill: '#F59E0B', fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} iconType="square" iconSize={10} />
              <Bar dataKey="dayUtil" name="白班" fill={SHIFT_COLORS.day} fillOpacity={0.85} barSize={20} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="dayUtil" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
              </Bar>
              <Bar dataKey="nightUtil" name="夜班" fill={SHIFT_COLORS.night} fillOpacity={0.85} barSize={20} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="nightUtil" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Right — Shift Summary Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.4, ease: easeOutCubic }}
          className="flex flex-col gap-4 lg:col-span-2"
        >
          {/* Day Shift Card */}
          <div className="flex-1 rounded-[14px] border p-5" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SHIFT_COLORS.day }} />
              <h3 className="text-[16px] font-semibold text-[#F1F5F9]">白班汇总</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[14px]">
                <span className="text-[#94A3B8]">平均产出</span>
                <span className="font-bold text-[#F1F5F9]">{shiftSummary.avgDayPieces.toFixed(1)} 片</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#94A3B8]">平均利用率</span>
                <span className="font-bold" style={{ color: getUtilColor(shiftSummary.avgDayUtil) }}>{shiftSummary.avgDayUtil.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#94A3B8]">有效天数</span>
                <span className="font-bold text-[#F1F5F9]">{shiftSummary.dayDays} 天</span>
              </div>
            </div>
          </div>

          {/* Night Shift Card */}
          <div className="flex-1 rounded-[14px] border p-5" style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SHIFT_COLORS.night }} />
              <h3 className="text-[16px] font-semibold text-[#F1F5F9]">夜班汇总</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[14px]">
                <span className="text-[#94A3B8]">平均产出</span>
                <span className="font-bold text-[#F1F5F9]">{shiftSummary.avgNightPieces.toFixed(1)} 片</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#94A3B8]">平均利用率</span>
                <span className="font-bold" style={{ color: getUtilColor(shiftSummary.avgNightUtil) }}>{shiftSummary.avgNightUtil.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#94A3B8]">有效天数</span>
                <span className="font-bold text-[#F1F5F9]">{shiftSummary.nightDays} 天</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ===== Section 6: Gantt Chart ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45, ease: easeOutCubic }}
        className="mb-6 rounded-[14px] border border-[#1F2937] bg-[#111827] p-5"
      >
        {/* Date selector */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#F1F5F9]">24h 工艺甘特图</h2>
            <p className="mt-0.5 text-[12px] text-[#64748B]">查看所选日期的各工位工艺运行时间分布</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-[#1F2937] bg-[#111827] px-3 py-2 text-[13px] text-[#F1F5F9] outline-none focus:border-[#374151]"
            >
              {dates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <ExportButton
              tooltip="导出图表"
              onExport={() => exportChartToPng(ganttRef.current, `${eqConfig.name}_甘特图_${selectedDate}`)}
            />
          </div>
        </div>
        <div ref={ganttRef}>
          <GanttChart
            data={ganttRecords}
            date={selectedDate}
            
          />
        </div>
      </motion.div>

      {/* ===== Section 7: Idle Time Summary ===== */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Left — Daily Idle Bar Chart */}
        <motion.div
          ref={idleChartRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5, ease: easeOutCubic }}
          className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5 transition-all hover:border-[#374151] lg:col-span-3"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#F1F5F9]">每日空窗时间</h2>
            <ExportButton tooltip="导出图表" onExport={() => exportChartToPng(idleChartRef.current, `${eqConfig.name}_每日空窗时间`)} />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={idleData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: '分钟', position: 'insideTopLeft', offset: 10, fill: '#64748B', fontSize: 11 }} />
              <Tooltip content={<IdleTooltip />} />
              <Bar dataKey="idleTime" fill={`${eqConfig.color}99`} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="idleTime" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => Math.round(v)} />
                {idleData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getIdleColor(entry.idleTime)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Right — Idle Summary Card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.55, ease: easeOutCubic }}
          className="flex flex-col justify-center rounded-[14px] border p-6 lg:col-span-2"
          style={{ background: `${eqConfig.color}0D`, borderColor: `${eqConfig.color}30` }}
        >
          <h3 className="mb-4 text-[16px] font-semibold text-[#F1F5F9]">空窗时间汇总</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-[14px]">
              <span className="text-[#94A3B8]">累计空窗</span>
              <span className="font-bold text-[#F1F5F9]">{idleSummary.totalIdle.toFixed(0)} 分钟</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-[#94A3B8]">日均空窗</span>
              <span className="font-bold" style={{ color: getIdleColor(idleSummary.avgIdle) }}>{idleSummary.avgIdle.toFixed(1)} 分钟</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-[#94A3B8]">峰值日期</span>
              <span className="font-bold text-[#F1F5F9]">{idleSummary.maxDate} ({idleSummary.maxIdle.toFixed(0)}分钟)</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-[#94A3B8]">趋势</span>
              <span className="flex items-center gap-1 font-bold" style={{ color: idleSummary.trend > 0 ? '#EF4444' : '#10B981' }}>
                {idleSummary.trend > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {Math.abs(idleSummary.trend).toFixed(1)} min
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ===== Section 8: Gap Statistics Cards + Pie Chart ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6, ease: easeOutCubic }}
        className="mb-4"
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[16px] font-semibold text-[#F1F5F9]">空窗时间分类统计</h2>
          <div className="group relative">
            <Info className="h-4 w-4 cursor-help text-[#64748B]" />
            <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1A2332] px-2 py-1 text-[11px] text-[#94A3B8] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              按空窗时长分类统计
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Left — 4 gap stat cards */}
          <div className="grid grid-cols-2 gap-4">
            {gapStatsArr.map((gs, i) => (
              <motion.div
                key={gs.key}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, delay: i * 0.08, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
                className="rounded-xl border p-4 transition-transform hover:scale-[1.02]"
                style={{
                  backgroundColor: `${gs.color}15`,
                  borderColor: `${gs.color}4D`,
                }}
              >
                <span
                  className="mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: `${gs.color}25`, color: gs.color }}
                >
                  {gs.label}
                </span>
                <div className="mb-1 text-[32px] font-bold" style={{ color: gs.color }}>{gs.count}</div>
                <div className="mb-1 text-[12px] text-[#94A3B8]">{gs.desc}</div>
                <div className="text-[12px] text-[#64748B]">占比 {gs.percentage}%</div>
              </motion.div>
            ))}
          </div>

          {/* Right — Gap Time Pie Chart */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.65, ease: easeOutCubic }}
            className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5"
            ref={pieRef}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[#F1F5F9]">空窗时间分布</h3>
              <ExportButton
                tooltip="导出图表"
                onExport={() => exportChartToPng(pieRef.current, `${eqConfig.name}_空窗饼图`)}
              />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={({ active, payload }: any) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0];
                    return (
                      <div className="rounded-lg border border-[#374151] p-2" style={{ background: 'rgba(26,35,50,0.95)' }}>
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p?.payload?.color || '#ccc' }} />
                          <span className="text-[#94A3B8]">{p?.name || ''}</span>
                          <span className="font-bold text-[#F1F5F9]">{p?.value ?? 0} 次</span>
                          <span className="text-[#64748B]">({p?.payload?.percentage ?? 0}%)</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: '#94A3B8', paddingTop: 8 }}
                  formatter={(value: string) => <span className="text-[#94A3B8]">{value}</span>}
                />
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                  animationBegin={200}
                  animationDuration={800}
                  label={({ cx, cy, midAngle, outerRadius, name, value, payload }: any) => {
                    const RADIAN = Math.PI / 180;
                    const radius = outerRadius + 16;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    return (
                      <text
                        x={x}
                        y={y}
                        fill="#CBD5E1"
                        textAnchor={x > cx ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={10}
                        fontFamily="Microsoft YaHei, sans-serif"
                      >
                        {name}: {value}次 ({payload.percentage}%)
                      </text>
                    );
                  }}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      </motion.div>

      {/* ===== Section 9: Gap Detail Table ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.65, ease: easeOutCubic }}
        className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5"
      >
        {/* Title row */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-[16px] font-semibold text-[#F1F5F9]">空窗时间段明细</h2>
            <span className="rounded-full bg-[#1A2332] px-2.5 py-0.5 text-[11px] text-[#94A3B8]">
              {filteredGapRecords.length} 条
            </span>
          </div>
          <ExportButton
            tooltip="导出数据"
            onExport={() =>
              exportStyledExcel(
                filteredGapRecords.map((g) => ({
                  日期: g.date,
                  开始时间: g.start,
                  结束时间: g.end,
                  持续分钟: g.duration,
                  分类: g.category,
                })),
                `${eqConfig.name}_空窗数据`,
              )
            }
          />
        </div>

        {/* Category filter pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          {[{ key: 'all' as CategoryFilter, label: '全部', color: '#94A3B8' }, ...GAP_CATEGORIES.map((c) => ({ key: c.key as CategoryFilter, label: c.label, color: c.color }))].map((f) => {
            const isActive = categoryFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setCategoryFilter(f.key)}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-all"
                style={{
                  backgroundColor: isActive ? `${f.color}25` : 'transparent',
                  color: isActive ? f.color : '#64748B',
                  border: `1px solid ${isActive ? `${f.color}60` : '#1F2937'}`,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#1F2937] text-left">
                <th className="sticky top-0 bg-[#111827] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">#</th>
                <th className="sticky top-0 bg-[#111827] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">日期</th>
                <th className="sticky top-0 bg-[#111827] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">开始时间</th>
                <th className="sticky top-0 bg-[#111827] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">结束时间</th>
                <th className="sticky top-0 bg-[#111827] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">持续时间</th>
                <th className="sticky top-0 bg-[#111827] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">分类</th>
                <th className="sticky top-0 bg-[#111827] px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">时间段</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {pagedGaps.length > 0 ? (
                  pagedGaps.map((row, idx) => (
                    <motion.tr
                      key={`${row.date}-${row.start}-${row.end}-${idx}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.025 }}
                      className="border-b border-[#1F2937]/50 transition-colors hover:bg-[#1E2D42]"
                      style={{
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        borderLeft: row.duration > 30 ? `2px solid ${GAP_CATEGORIES.find((c) => c.key === row.category)?.color ?? 'transparent'}` : undefined,
                      }}
                    >
                      <td className="px-3 py-2.5 text-[#64748B]">{(page - 1) * ROWS_PER_PAGE + idx + 1}</td>
                      <td className="px-3 py-2.5 text-[#F1F5F9]">{row.date}</td>
                      <td className="px-3 py-2.5 text-[#94A3B8]">{row.start}</td>
                      <td className="px-3 py-2.5 text-[#94A3B8]">{row.end}</td>
                      <td className="px-3 py-2.5 font-bold text-[#F1F5F9]">{row.duration.toFixed(0)} min</td>
                      <td className="px-3 py-2.5"><CategoryBadge category={row.category} /></td>
                      <td className="px-3 py-2.5 text-[#94A3B8]">{row.start} ~ {row.end}</td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <Clock className="mx-auto mb-2 h-8 w-8 text-[#374151]" />
                      <p className="text-[#64748B]">暂无数据</p>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredGapRecords.length > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-[#1F2937] pt-3">
            <span className="text-[12px] text-[#64748B]">
              共 {filteredGapRecords.length} 条记录
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1F2937] text-[#94A3B8] transition-colors hover:bg-[#1A2332] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="flex h-8 min-w-[32px] items-center justify-center rounded-lg border px-2 text-[12px] font-medium transition-colors"
                  style={{
                    borderColor: p === page ? eqConfig.color : '#1F2937',
                    color: p === page ? eqConfig.color : '#94A3B8',
                    background: p === page ? `${eqConfig.color}15` : 'transparent',
                  }}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1F2937] text-[#94A3B8] transition-colors hover:bg-[#1A2332] disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="ml-2 text-[12px] text-[#64748B]">第 {page} / {totalPages} 页</span>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
