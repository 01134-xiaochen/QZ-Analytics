import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  Download, CalendarDays, ArrowLeftRight,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { exportToExcel } from '@/lib/export';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EQUIPMENT = [
  { key: 'PECVD', label: 'PECVD', color: '#10B981' },
  { key: 'DRIE', label: 'DRIE', color: '#F59E0B' },
  { key: 'ICP', label: 'ICP', color: '#3B82F6' },
  { key: '光刻机', label: '光刻机', color: '#EC4899' },
] as const;

const TEAMS = [
  { key: 'A', label: 'A班', color: '#3B82F6' },
  { key: 'B', label: 'B班', color: '#10B981' },
  { key: 'C', label: 'C班', color: '#F59E0B' },
] as const;

const SHIFT_NAMES: Record<string, string> = { '白': '白班', '夜': '夜班' };

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HeatmapItem {
  date: string;
  equipment: string;
  shift: string;
  team: string;
  utilization: number;
}

interface DailyEquipmentUtilItem {
  date: string;
  equipment: string;
  utilization: number;
  totalTime: number;
}

interface WeeklyTeamItem {
  week: string;
  equipment: string;
  team: string;
  avgUtilization: number;
  count: number;
}

interface WeeklyShiftItem {
  week: string;
  equipment: string;
  shift: string;
  avgUtilization: number;
  count: number;
}

interface MonthlyTeamItem {
  month: string;
  equipment: string;
  team: string;
  avgUtilization: number;
  count: number;
}

interface MonthlyShiftItem {
  month: string;
  equipment: string;
  shift: string;
  avgUtilization: number;
  count: number;
}

interface EfficiencyDetail {
  heatmap: HeatmapItem[];
  dailyEquipmentUtil: DailyEquipmentUtilItem[];
  weeklyTeam: WeeklyTeamItem[];
  weeklyShift: WeeklyShiftItem[];
  monthlyTeam: MonthlyTeamItem[];
  monthlyShift: MonthlyShiftItem[];
  weeklySummary: Array<{
    week: string;
    team: string;
    avgUtilization: number;
    equipmentBreakdown: Record<string, number>;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function getEquipmentColor(eq: string): string {
  return EQUIPMENT.find((e) => e.key === eq)?.color ?? '#94A3B8';
}

function getTeamColor(team: string): string {
  return TEAMS.find((t) => t.key === team)?.color ?? '#94A3B8';
}

function getTeamLabel(team: string): string {
  return TEAMS.find((t) => t.key === team)?.label ?? team;
}

function shiftLabel(shift: string): string {
  return SHIFT_NAMES[shift] ?? shift;
}

function heatmapColor(value: number): string {
  if (value >= 80) return 'rgba(16,185,129,0.7)';
  if (value >= 50) return 'rgba(245,158,11,0.4)';
  return 'rgba(239,68,68,0.2)';
}

function utilizationColor(value: number): string {
  if (value >= 80) return '#10B981';
  if (value >= 50) return '#F59E0B';
  return '#EF4444';
}

function formatDateCN(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltips                                                    */
/* ------------------------------------------------------------------ */


function RechartsTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#374151] px-3 py-2" style={{ background: 'rgba(26,35,50,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      <p className="mb-1 text-[12px] font-bold text-[#F1F5F9]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-[11px]">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-[#94A3B8]">{entry.name}</span>
          <span className="ml-auto font-bold text-[#F1F5F9]">{typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}%</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary Card                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard({ title, value, color, subtitle }: { title: string; value: string; color: string; subtitle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="rounded-xl border border-[#1F2937] bg-[#111827] p-4"
    >
      <p className="text-[12px] text-[#64748B]">{title}</p>
      <p className="mt-1 text-[24px] font-bold" style={{ color }}>{value}</p>
      {subtitle && <p className="mt-1 text-[11px] text-[#64748B]">{subtitle}</p>}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Title                                                      */
/* ------------------------------------------------------------------ */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[18px] font-semibold text-[#F1F5F9]">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[12px] text-[#64748B]">{subtitle}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export Button                                                      */
/* ------------------------------------------------------------------ */

function ExportButton({ data, filename, sheetName }: { data: Record<string, unknown>[]; filename: string; sheetName?: string }) {
  return (
    <button
      onClick={() => exportToExcel(data, filename, sheetName)}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#1A2332] hover:text-[#F1F5F9]"
      title="导出Excel"
    >
      <Download className="h-4 w-4" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart Card Wrapper                                                 */
/* ------------------------------------------------------------------ */

function ChartCard({ children, title, subtitle, exportData, exportFilename, exportSheetName }: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  exportData?: Record<string, unknown>[];
  exportFilename?: string;
  exportSheetName?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="mb-6 rounded-[14px] border border-[#1F2937] bg-[#111827] p-5 transition-all hover:border-[#374151]"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-[#F1F5F9]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-[#64748B]">{subtitle}</p>}
        </div>
        {exportData && exportFilename && (
          <ExportButton data={exportData} filename={exportFilename} sheetName={exportSheetName} />
        )}
      </div>
      {children}
    </motion.div>
  );
}

/* ================================================================== */
/*  MAIN PAGE COMPONENT                                                */
/* ================================================================== */

export default function Efficiency() {
  const { data, loading } = useData();

  /* ---- Access efficiencyDetail with type assertion --------------- */
  const ed = useMemo<EfficiencyDetail | null>(() => {
    if (!data) return null;
    return (data as unknown as { efficiencyDetail: EfficiencyDetail }).efficiencyDetail ?? null;
  }, [data]);

  /* ---- All dates sorted ------------------------------------------ */
  const allDates = useMemo(() => {
    if (!ed) return [];
    const dates = Array.from(new Set(ed.heatmap.map((h) => h.date)));
    dates.sort();
    return dates;
  }, [ed]);

  /* ---- Date picker state (default = most recent) ----------------- */
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    if (allDates.length > 0 && !selectedDate) {
      setSelectedDate(allDates[allDates.length - 1]);
    }
  }, [allDates, selectedDate]);

  /* ---- Heatmap: equipment x dates data --------------------------- */
  const heatmapMatrix = useMemo(() => {
    if (!ed) return [];
    const equipmentList = EQUIPMENT.map((e) => e.key);
    return equipmentList.map((eq) => {
      const cells = allDates.map((date) => {
        const records = ed.heatmap.filter((h) => h.equipment === eq && h.date === date);
        const avgUtil = records.length > 0 ? avg(records.map((r) => r.utilization)) : 0;
        const shifts = Array.from(new Set(records.map((r) => r.shift))).map(shiftLabel).join(', ');
        const teams = Array.from(new Set(records.map((r) => r.team))).join(', ');
        return {
          date,
          equipment: eq,
          value: avgUtil,
          shift: shifts || '-',
          team: teams || '-',
        };
      });
      return { equipment: eq, cells };
    });
  }, [ed, allDates]);

  /* ---- Daily data for selected date ------------------------------ */
  const dailyData = useMemo(() => {
    if (!ed || !selectedDate) return { equipmentUtil: [], shiftBreakdown: [], teamBreakdown: [], summary: null };

    const equipmentUtil = ed.dailyEquipmentUtil.filter((d) => d.date === selectedDate);

    const shiftBreakdown: Record<string, { shift: string; equipment: string; utilization: number }[]> = { '白班': [], '夜班': [] };
    const teamBreakdown: Record<string, { team: string; equipment: string; utilization: number }[]> = { A: [], B: [], C: [] };

    const dayRecords = ed.heatmap.filter((h) => h.date === selectedDate && h.shift === '白');
    const nightRecords = ed.heatmap.filter((h) => h.date === selectedDate && h.shift === '夜');

    for (const r of dayRecords) {
      shiftBreakdown['白班'].push({ shift: '白班', equipment: r.equipment, utilization: r.utilization });
    }
    for (const r of nightRecords) {
      shiftBreakdown['夜班'].push({ shift: '夜班', equipment: r.equipment, utilization: r.utilization });
    }

    for (const team of ['A', 'B', 'C'] as const) {
      const teamRecords = ed.heatmap.filter((h) => h.date === selectedDate && h.team === team);
      for (const r of teamRecords) {
        teamBreakdown[team].push({ team, equipment: r.equipment, utilization: r.utilization });
      }
    }

    // Summary
    const allUtils = equipmentUtil.map((e) => e.utilization);
    const avgUtil = allUtils.length > 0 ? avg(allUtils) : 0;
    const maxUtil = allUtils.length > 0 ? Math.max(...allUtils) : 0;
    const minUtil = allUtils.length > 0 ? Math.min(...allUtils) : 0;
    const bestEq = equipmentUtil.find((e) => e.utilization === maxUtil)?.equipment ?? '-';
    const worstEq = equipmentUtil.find((e) => e.utilization === minUtil)?.equipment ?? '-';

    return { equipmentUtil, shiftBreakdown, teamBreakdown, summary: { avgUtil, maxUtil, minUtil, bestEq, worstEq } };
  }, [ed, selectedDate]);

  /* ---- Chart data for daily section ------------------------------ */
  const dailyShiftChartData = useMemo(() => {
    if (!ed || !selectedDate) return [];
    return EQUIPMENT.map((e) => {
      const dayVal = ed.heatmap.find((h) => h.equipment === e.key && h.date === selectedDate && h.shift === '白');
      const nightVal = ed.heatmap.find((h) => h.equipment === e.key && h.date === selectedDate && h.shift === '夜');
      return {
        equipment: e.key,
        白班: dayVal?.utilization ?? 0,
        夜班: nightVal?.utilization ?? 0,
      };
    });
  }, [ed, selectedDate]);

  const dailyTeamChartData = useMemo(() => {
    if (!ed || !selectedDate) return [];
    return EQUIPMENT.map((e) => {
      const entry: Record<string, string | number> = { equipment: e.key };
      for (const team of TEAMS) {
        const vals = ed.heatmap
          .filter((h) => h.equipment === e.key && h.date === selectedDate && h.team === team.key)
          .map((h) => h.utilization);
        entry[team.key] = vals.length > 0 ? avg(vals) : 0;
      }
      return entry;
    });
  }, [ed, selectedDate]);

  /* ---- Weekly data ----------------------------------------------- */
  const weeklyTeamChartData = useMemo(() => {
    if (!ed) return [];
    const weeks = Array.from(new Set(ed.weeklyTeam.map((w) => w.week))).sort();
    return weeks.map((week) => {
      const entry: Record<string, string | number> = { week };
      for (const team of TEAMS) {
        const vals = ed.weeklyTeam
          .filter((w) => w.week === week && w.team === team.key)
          .map((w) => w.avgUtilization);
        entry[team.key] = vals.length > 0 ? avg(vals) : 0;
      }
      return entry;
    });
  }, [ed]);

  const weeklyShiftChartData = useMemo(() => {
    if (!ed) return [];
    const weeks = Array.from(new Set(ed.weeklyShift.map((w) => w.week))).sort();
    return weeks.map((week) => {
      const entry: Record<string, string | number> = { week };
      for (const shift of ['白', '夜'] as const) {
        const vals = ed.weeklyShift
          .filter((w) => w.week === week && w.shift === shift)
          .map((w) => w.avgUtilization);
        entry[shiftLabel(shift)] = vals.length > 0 ? avg(vals) : 0;
      }
      return entry;
    });
  }, [ed]);

  const weeklySummary = useMemo(() => {
    if (!ed) return null;
    const allWeekUtils = ed.weeklyTeam.map((w) => w.avgUtilization);
    const avgUtil = allWeekUtils.length > 0 ? avg(allWeekUtils) : 0;
    const bestWeek = ed.weeklyTeam.reduce((best, cur) => cur.avgUtilization > best.avgUtilization ? cur : best, ed.weeklyTeam[0]);
    return { avgUtil, bestWeek };
  }, [ed]);

  /* ---- Monthly data ---------------------------------------------- */
  const monthlyTeamChartData = useMemo(() => {
    if (!ed) return [];
    const months = Array.from(new Set(ed.monthlyTeam.map((m) => m.month))).sort();
    return months.map((month) => {
      const entry: Record<string, string | number> = { month };
      for (const team of TEAMS) {
        const vals = ed.monthlyTeam
          .filter((m) => m.month === month && m.team === team.key)
          .map((m) => m.avgUtilization);
        entry[team.key] = vals.length > 0 ? avg(vals) : 0;
      }
      return entry;
    });
  }, [ed]);

  const monthlyShiftChartData = useMemo(() => {
    if (!ed) return [];
    const months = Array.from(new Set(ed.monthlyShift.map((m) => m.month))).sort();
    return months.map((month) => {
      const entry: Record<string, string | number> = { month };
      for (const shift of ['白', '夜'] as const) {
        const vals = ed.monthlyShift
          .filter((m) => m.month === month && m.shift === shift)
          .map((m) => m.avgUtilization);
        entry[shiftLabel(shift)] = vals.length > 0 ? avg(vals) : 0;
      }
      return entry;
    });
  }, [ed]);

  const monthlySummary = useMemo(() => {
    if (!ed) return null;
    const allMonthUtils = ed.monthlyTeam.map((m) => m.avgUtilization);
    const avgUtil = allMonthUtils.length > 0 ? avg(allMonthUtils) : 0;
    return { avgUtil };
  }, [ed]);

  /* ---- Heatmap drag scroll --------------------------------------- */
  const heatmapScrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = heatmapScrollRef.current;
    if (!el) return;
    setIsDragging(true);
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const el = heatmapScrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5;
    el.scrollLeft = dragScrollLeft.current - walk;
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  /* ---- Loading state --------------------------------------------- */
  if (loading || !data || !ed) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 pt-6 pb-10">
      {/* ============ Page Header ============ */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
      >
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#F1F5F9]" style={{ fontFamily: 'Inter, sans-serif' }}>
            效率对比分析
          </h1>
          <p className="mt-1 text-[14px] text-[#64748B]">设备利用率综合分析 · 日期选择 · 热力图 · 周月统计</p>
        </div>
      </motion.div>

      {/* ============ Section 1: Date Picker ============ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="mb-6 flex flex-wrap items-center gap-4 rounded-[10px] border border-[#1F2937] bg-[#111827] px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#64748B]" />
          <span className="text-[13px] text-[#94A3B8]">选择日期:</span>
          <input
            type="date"
            value={selectedDate}
            min={allDates[0]}
            max={allDates[allDates.length - 1]}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-[#374151] bg-[#0B0F19] px-3 py-1.5 text-[13px] text-[#F1F5F9] outline-none focus:border-[#3B82F6]"
            style={{ colorScheme: 'dark' }}
          />
          <span className="text-[13px] font-medium text-[#F1F5F9]">
            {selectedDate ? formatDateCN(selectedDate) : ''}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[#64748B]">数据范围: {allDates.length} 天</span>
        </div>
      </motion.div>

      {/* ============ Section 2: Daily Summary Cards ============ */}
      {dailyData.summary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1, ease: EASE }}
          className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          <SummaryCard
            title="平均利用率"
            value={`${dailyData.summary.avgUtil.toFixed(1)}%`}
            color={utilizationColor(dailyData.summary.avgUtil)}
          />
          <SummaryCard
            title="最高利用率"
            value={`${dailyData.summary.maxUtil.toFixed(1)}%`}
            color="#10B981"
            subtitle={`${dailyData.summary.bestEq}`}
          />
          <SummaryCard
            title="最低利用率"
            value={`${dailyData.summary.minUtil.toFixed(1)}%`}
            color="#EF4444"
            subtitle={`${dailyData.summary.worstEq}`}
          />
          <SummaryCard
            title="机台数量"
            value={`${dailyData.equipmentUtil.length}`}
            color="#3B82F6"
          />
          <SummaryCard
            title="数据记录"
            value={`${ed.heatmap.filter((h) => h.date === selectedDate).length}`}
            color="#8B5CF6"
          />
        </motion.div>
      )}

      {/* ============ Section 3: Daily Shift & Team Charts ============ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title={`${formatDateCN(selectedDate)} 白夜班对比`}
          subtitle="各机台白班/夜班利用率"
          exportData={dailyShiftChartData as unknown as Record<string, unknown>[]}
          exportFilename={`daily-shift-${selectedDate}`}
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={dailyShiftChartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal vertical={false} />
              <XAxis dataKey="equipment" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<RechartsTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} iconType="square" iconSize={10} />
              <Bar dataKey="白班" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500}>
                <LabelList dataKey="白班" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
              </Bar>
              <Bar dataKey="夜班" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500}>
                <LabelList dataKey="夜班" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={`${formatDateCN(selectedDate)} 班组对比`}
          subtitle="各机台各班组平均利用率"
          exportData={dailyTeamChartData as unknown as Record<string, unknown>[]}
          exportFilename={`daily-team-${selectedDate}`}
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={dailyTeamChartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal vertical={false} />
              <XAxis dataKey="equipment" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<RechartsTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} iconType="square" iconSize={10} />
              {TEAMS.map((team) => (
                <Bar key={team.key} dataKey={team.key} name={team.label} fill={team.color} radius={[4, 4, 0, 0]} barSize={20} animationDuration={500}>
                  <LabelList dataKey={team.key} position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ============ Section 4: Heatmap with Horizontal Drag Scroll ============ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
        className="mb-6 rounded-[14px] border border-[#1F2937] bg-[#111827] p-5 transition-all hover:border-[#374151]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#F1F5F9]">设备利用率热力图</h2>
            <p className="mt-0.5 text-[12px] text-[#64748B]">日期 × 机台 · 颜色深浅表示利用率高低</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(16,185,129,0.7)' }} />高(≥80%)</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(245,158,11,0.4)' }} />中(50-80%)</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(239,68,68,0.2)' }} />低(&lt;50%)</span>
          </div>
        </div>

        {/* Drag hint */}
        <div className="mb-2 flex items-center justify-center gap-1 text-[11px] text-[#64748B]">
          <ArrowLeftRight className="h-3 w-3" />
          <span>← 拖动查看 →</span>
        </div>

        {/* Heatmap container */}
        <div
          ref={heatmapScrollRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="overflow-x-auto pb-2"
          style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        >
          <div style={{ minWidth: Math.max(allDates.length * 72, 600) }}>
            {/* Header row */}
            <div className="mb-1 grid" style={{ gridTemplateColumns: `80px repeat(${allDates.length}, 1fr)` }}>
              <div className="text-[10px] text-[#64748B]"></div>
              {allDates.map((date) => (
                <div key={date} className="px-0.5 text-center text-[10px] text-[#64748B]">
                  {formatDateCN(date)}
                </div>
              ))}
            </div>

            {/* Equipment rows */}
            {heatmapMatrix.map((row) => (
              <div key={row.equipment} className="mb-1 grid" style={{ gridTemplateColumns: `80px repeat(${allDates.length}, 1fr)` }}>
                <div className="flex items-center gap-1.5 pr-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getEquipmentColor(row.equipment) }} />
                  <span className="text-[11px] font-medium text-[#94A3B8]">{row.equipment}</span>
                </div>
                {row.cells.map((cell, i) => (
                  <div key={i} className="group relative px-0.5">
                    <div
                      className="flex h-10 items-center justify-center rounded text-[10px] font-bold text-[#F1F5F9] transition-all hover:scale-110 hover:z-10"
                      style={{ backgroundColor: heatmapColor(cell.value) }}
                      title={`${cell.equipment} | ${cell.date} | ${cell.value.toFixed(1)}% | ${cell.shift}`}
                    >
                      {cell.value.toFixed(0)}
                    </div>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-[#374151] px-2 py-1 text-[10px] group-hover:block" style={{ background: 'rgba(26,35,50,0.95)' }}>
                      <span className="text-[#F1F5F9]">{cell.equipment} | {cell.date}</span><br />
                      <span className="text-[#94A3B8]">利用率: </span><span className="font-bold" style={{ color: utilizationColor(cell.value) }}>{cell.value.toFixed(1)}%</span><br />
                      <span className="text-[#94A3B8]">班次: {cell.shift} | 班组: {cell.team}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Visual scrollbar */}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#1F2937]">
          <div
            className="h-full rounded-full bg-[#374151] transition-all"
            style={{
              width: `${Math.min(100, (heatmapScrollRef.current ? (heatmapScrollRef.current.clientWidth / (allDates.length * 72)) : 0.3) * 100)}%`,
            }}
          />
        </div>
      </motion.div>

      {/* ============ Section 5: Weekly Summary ============ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
      >
        <SectionTitle title="周度统计" subtitle="按周汇总各班组与白夜班平均利用率" />

        {/* Weekly summary cards */}
        {weeklySummary && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryCard title="周均利用率" value={`${weeklySummary.avgUtil.toFixed(1)}%`} color={utilizationColor(weeklySummary.avgUtil)} />
            <SummaryCard title="最佳班组" value={getTeamLabel(weeklySummary.bestWeek.team)} color={getTeamColor(weeklySummary.bestWeek.team)} subtitle={`${weeklySummary.bestWeek.avgUtilization.toFixed(1)}%`} />
            <SummaryCard title="周数" value={`${weeklyTeamChartData.length}`} color="#3B82F6" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard
            title="周度班组对比"
            subtitle="每周各班组平均利用率"
            exportData={weeklyTeamChartData as unknown as Record<string, unknown>[]}
            exportFilename="weekly-team"
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyTeamChartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<RechartsTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} iconType="square" iconSize={10} />
                {TEAMS.map((team) => (
                  <Bar key={team.key} dataKey={team.key} name={team.label} fill={team.color} radius={[4, 4, 0, 0]} barSize={20} animationDuration={500}>
                    <LabelList dataKey={team.key} position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="周度白夜班对比"
            subtitle="每周白班/夜班平均利用率"
            exportData={weeklyShiftChartData as unknown as Record<string, unknown>[]}
            exportFilename="weekly-shift"
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyShiftChartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<RechartsTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} iconType="square" iconSize={10} />
                <Bar dataKey="白班" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500}>
                  <LabelList dataKey="白班" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                </Bar>
                <Bar dataKey="夜班" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500}>
                  <LabelList dataKey="夜班" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </motion.div>

      {/* ============ Section 6: Monthly Summary ============ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4, ease: EASE }}
        className="mt-6"
      >
        <SectionTitle title="月度统计" subtitle="按月汇总各班组与白夜班平均利用率" />

        {/* Monthly summary cards */}
        {monthlySummary && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryCard title="月均利用率" value={`${monthlySummary.avgUtil.toFixed(1)}%`} color={utilizationColor(monthlySummary.avgUtil)} />
            <SummaryCard title="月数" value={`${monthlyTeamChartData.length}`} color="#3B82F6" />
            <SummaryCard title="机台类型" value={`${EQUIPMENT.length}`} color="#8B5CF6" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard
            title="月度班组对比"
            subtitle="每月各班组平均利用率"
            exportData={monthlyTeamChartData as unknown as Record<string, unknown>[]}
            exportFilename="monthly-team"
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyTeamChartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<RechartsTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} iconType="square" iconSize={10} />
                {TEAMS.map((team) => (
                  <Bar key={team.key} dataKey={team.key} name={team.label} fill={team.color} radius={[4, 4, 0, 0]} barSize={20} animationDuration={500}>
                    <LabelList dataKey={team.key} position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="月度白夜班对比"
            subtitle="每月白班/夜班平均利用率"
            exportData={monthlyShiftChartData as unknown as Record<string, unknown>[]}
            exportFilename="monthly-shift"
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyShiftChartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<RechartsTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} iconType="square" iconSize={10} />
                <Bar dataKey="白班" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500}>
                  <LabelList dataKey="白班" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                </Bar>
                <Bar dataKey="夜班" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={24} animationDuration={500}>
                  <LabelList dataKey="夜班" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </motion.div>
    </div>
  );
}
