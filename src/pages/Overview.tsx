import { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Brush, LabelList,
} from 'recharts';
import {
  Zap, Cpu, Layers, Focus, Download, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { format, parseISO, subDays, isAfter } from 'date-fns';
import { exportOverviewExcel, exportChartToPng } from '@/lib/export';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EQUIPMENT = [
  { key: 'PECVD', label: 'PECVD', color: '#10B981', icon: Zap },
  { key: 'DRIE', label: 'DRIE', color: '#F59E0B', icon: Cpu },
  { key: 'ICP', label: 'ICP', color: '#3B82F6', icon: Layers },
  { key: '光刻机', label: '光刻机', color: '#EC4899', icon: Focus },
] as const;

const DATE_PRESETS = [
  { label: '全部', value: 'all' },
  { label: '近3天', value: '3d' },
  { label: '近7天', value: '7d' },
] as const;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DatePreset = (typeof DATE_PRESETS)[number]['value'];

interface MergedDay {
  date: string;
  [key: string]: string | number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getFilteredDates(allDates: string[], preset: DatePreset): string[] {
  if (preset === 'all') return allDates;
  const days = preset === '3d' ? 3 : 7;
  const cutoff = subDays(new Date(), days);
  return allDates.filter((d) => isAfter(parseISO(d), cutoff) || d === format(cutoff, 'yyyy-MM-dd'));
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 100;
  const height = 40;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const areaPath = `M0,${height} L${points.join(' L')} L${width},${height} Z`;
  const linePath = `M${points.join(' L')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-[50px] w-full" preserveAspectRatio="none">
      <path d={areaPath} fill={color} fillOpacity={0.12} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated counter for KPI values                                    */
/* ------------------------------------------------------------------ */

function AnimatedNumber({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState('0');

  useMemo(() => {
    const duration = 800;
    const start = performance.now();
    const from = 0;
    const to = value;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current.toFixed(decimals));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);

  return <span>{display}</span>;
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip for Recharts                                        */
/* ------------------------------------------------------------------ */

function CustomTooltip({ active, payload, label, unit = '片' }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string; unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg border border-[#374151] p-3"
      style={{ background: 'rgba(26,35,50,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
    >
      <p className="mb-2 text-[13px] font-bold text-[#F1F5F9]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="mb-1 flex items-center gap-2 text-[12px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-[#94A3B8]">{entry.name}</span>
          <span className="ml-auto font-bold text-[#F1F5F9]">
            {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function StackedTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
  return (
    <div
      className="rounded-lg border border-[#374151] p-3"
      style={{ background: 'rgba(26,35,50,0.95)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
    >
      <p className="mb-2 text-[13px] font-bold text-[#F1F5F9]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="mb-1 flex items-center gap-2 text-[12px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-[#94A3B8]">{entry.name}</span>
          <span className="ml-auto font-bold text-[#F1F5F9]">
            {typeof entry.value === 'number' ? entry.value.toFixed(0) : entry.value}分钟
          </span>
        </div>
      ))}
      <div className="mt-2 border-t border-[#374151] pt-1.5 text-[12px] font-bold text-[#F1F5F9]">
        合计 {total.toFixed(0)} 分钟
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI Card Component                                                 */
/* ------------------------------------------------------------------ */

function KPICard({
  eq,
  avgOutput,
  avgUtilization,
  avgIdleTime,
  sparklineData,
  index,
}: {
  eq: (typeof EQUIPMENT)[number];
  avgOutput: number;
  avgUtilization: number;
  avgIdleTime: number;
  sparklineData: number[];
  index: number;
}) {
  const Icon = eq.icon;
  const isGoodUtil = avgUtilization >= 80;
  const isWarnUtil = avgUtilization >= 50 && avgUtilization < 80;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="group relative min-w-[220px] rounded-xl border border-[#1F2937] bg-[#111827] p-5 transition-all hover:border-[#374151]"
      style={{
        boxShadow: `0 0 20px ${eq.color}08`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${eq.color}15`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${eq.color}08`;
      }}
    >
      {/* Top row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eq.color }} />
          <span className="text-[13px] font-semibold text-[#F1F5F9]">{eq.label}</span>
        </div>
        <Icon className="h-5 w-5" style={{ color: eq.color }} />
      </div>

      {/* Label */}
      <p className="mb-1 text-[12px] text-[#64748B]">平均日产出</p>

      {/* Value */}
      <div className="flex items-baseline gap-1">
        <span className="text-[32px] font-bold leading-none text-[#F1F5F9]">
          <AnimatedNumber value={avgOutput} decimals={1} />
        </span>
        <span className="text-[12px] text-[#94A3B8]">片/天</span>
      </div>

      {/* Util + Idle row */}
      <div className="mb-1 mt-2 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
          style={{ color: isGoodUtil ? '#10B981' : isWarnUtil ? '#F59E0B' : '#EF4444' }}
        >
          {isGoodUtil ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {avgUtilization.toFixed(1)}%
        </span>
        <span className="text-[11px] text-[#64748B]">利用率</span>
        <span className="mx-1 text-[#64748B]">|</span>
        <span className="text-[11px] text-[#94A3B8]">
          空闲 <span className="font-semibold text-[#F1F5F9]">{avgIdleTime.toFixed(0)}</span>分/天
        </span>
      </div>

      {/* Sparkline */}
      <Sparkline data={sparklineData} color={eq.color} />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart Card Wrapper                                                 */
/* ------------------------------------------------------------------ */

function ChartCard({ title, children, delay = 0, onExport }: { title: string; children: React.ReactNode; delay?: number; onExport?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
      className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5 transition-colors hover:border-[#374151]"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-[#F1F5F9]">{title}</h3>
        <button
          onClick={onExport}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#1A2332] hover:text-[#F1F5F9]"
          title="导出图表"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Overview Page                                                 */
/* ------------------------------------------------------------------ */

export default function Overview() {
  const { data, loading } = useData();
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [activeEquipments, setActiveEquipments] = useState<Set<string>>(new Set(EQUIPMENT.map((e) => e.key)));
  const [tableExpanded, setTableExpanded] = useState(false);
  const outputChartRef = useRef<HTMLDivElement>(null);
  const utilChartRef = useRef<HTMLDivElement>(null);
  const idleChartRef = useRef<HTMLDivElement>(null);

  /* ---- Date filtering ---- */
  const allDates = useMemo(() => data?.metadata.dates ?? [], [data]);

  const filteredDates = useMemo(() => {
    if (!allDates.length) return [];
    return getFilteredDates(allDates, datePreset);
  }, [allDates, datePreset]);

  /* ---- Filtered overview records ---- */
  const filteredOverview = useMemo(() => {
    if (!data?.overview) return [];
    return data.overview.filter((r) => filteredDates.includes(r.date));
  }, [data, filteredDates]);

  /* ---- KPI data ---- */
  const kpiData = useMemo(() => {
    return EQUIPMENT.map((eq) => {
      const records = filteredOverview.filter((r) => r.equipment === eq.key);
      const avgOutput = records.length ? records.reduce((s, r) => s + r.avgOutput, 0) / records.length : 0;
      const avgUtilization = records.length ? records.reduce((s, r) => s + r.avgUtilization, 0) / records.length : 0;
      const avgIdleTime = records.length ? records.reduce((s, r) => s + r.avgIdleTime, 0) / records.length : 0;
      const sparklineData = records.map((r) => r.avgOutput);
      return { eq, avgOutput, avgUtilization, avgIdleTime, sparklineData };
    });
  }, [filteredOverview]);

  /* ---- Chart data (merged by date) ---- */
  const chartData: MergedDay[] = useMemo(() => {
    const dateMap = new Map<string, MergedDay>();
    filteredOverview.forEach((r) => {
      if (!dateMap.has(r.date)) {
        dateMap.set(r.date, { date: r.date });
      }
      const day = dateMap.get(r.date)!;
      day[`${r.equipment}_totalPieces`] = r.avgOutput;
      day[`${r.equipment}_utilization`] = r.avgUtilization;
      day[`${r.equipment}_idleTime`] = r.avgIdleTime;
    });
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredOverview]);

  /* ---- Equipment toggle ---- */
  const toggleEquipment = useCallback((key: string) => {
    setActiveEquipments((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /* ---- Table data ---- */
  const tableRows = useMemo(() => {
    return chartData.map((day) => {
      let totalOutput = 0;
      let totalUtil = 0;
      let utilCount = 0;
      const row: Record<string, string | number> = { date: day.date };
      EQUIPMENT.forEach((eq) => {
        const output = Number(day[`${eq.key}_totalPieces`] ?? 0);
        const util = Number(day[`${eq.key}_utilization`] ?? 0);
        row[`${eq.key}_totalPieces`] = output;
        row[`${eq.key}_utilization`] = util;
        totalOutput += output;
        totalUtil += util;
        utilCount++;
      });
      row.totalOutput = totalOutput;
      row.avgUtilization = utilCount ? totalUtil / utilCount : 0;
      return row;
    });
  }, [chartData]);

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-[#94A3B8]">
        暂无数据
      </div>
    );
  }

  return (
    <div className="w-full px-6 pt-6 pb-10">
      {/* ======== Section 1: Page Header ======== */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
        >
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#F1F5F9]">
            设备运行总览
          </h1>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="mt-1 text-[14px] text-[#64748B]"
          >
            多机台运行数据分析与趋势监控
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="flex items-center gap-3"
        >
          <button
            onClick={() => {
              exportOverviewExcel(
                filteredOverview.map((r) => ({
                  设备: r.equipment,
                  日期: r.date,
                  平均产出: r.avgOutput,
                  平均利用率: r.avgUtilization,
                  平均空闲时间: r.avgIdleTime,
                  记录数: r.recordCount,
                })),
              );
            }}
            className="flex items-center gap-1.5 rounded-lg border border-[#1F2937] bg-[#111827] px-3 py-2 text-[13px] text-[#94A3B8] transition-colors hover:border-[#374151] hover:text-[#F1F5F9]"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
        </motion.div>
      </div>

      {/* ======== Section 2: Filter Bar ======== */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mb-6 flex flex-wrap items-center gap-3 rounded-[10px] border border-[#1F2937] bg-[#111827] px-4 py-3"
      >
        {/* Date Range Picker */}
        <div className="flex items-center gap-1.5 rounded-lg border border-[#1F2937] bg-[#0B0F19] p-1">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setDatePreset(preset.value)}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium transition-all"
              style={{
                background: datePreset === preset.value ? '#1A2332' : 'transparent',
                color: datePreset === preset.value ? '#F1F5F9' : '#64748B',
                border: datePreset === preset.value ? '1px solid #374151' : '1px solid transparent',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Equipment Quick Toggle */}
        <div className="flex items-center gap-2">
          {EQUIPMENT.map((eq) => {
            const active = activeEquipments.has(eq.key);
            return (
              <button
                key={eq.key}
                onClick={() => toggleEquipment(eq.key)}
                className="flex items-center gap-1.5 rounded-[16px] border px-3 py-1.5 text-[12px] font-medium transition-all"
                style={{
                  background: active ? `${eq.color}14` : '#1A2332',
                  borderColor: active ? eq.color : '#1F2937',
                  color: active ? '#F1F5F9' : '#64748B',
                  opacity: active ? 1 : 0.5,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: eq.color }} />
                {eq.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ======== Section 3: KPI Grid ======== */}
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi, index) => (
          <KPICard
            key={kpi.eq.key}
            eq={kpi.eq}
            avgOutput={kpi.avgOutput}
            avgUtilization={kpi.avgUtilization}
            avgIdleTime={kpi.avgIdleTime}
            sparklineData={kpi.sparklineData}
            index={index}
          />
        ))}
      </div>

      {/* ======== Section 4: Output Trend Chart ======== */}
      <div ref={outputChartRef}>
        <ChartCard title="各机台日产出趋势" delay={0.4} onExport={() => exportChartToPng(outputChartRef.current, '各机台日产出趋势')}>
          <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748B', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
              tickLine={false}
              tickFormatter={(v: string) => format(parseISO(v), 'MM/dd')}
            />
            <YAxis
              tick={{ fill: '#64748B', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
              tickLine={false}
              label={{ value: '片数', position: 'insideLeft', offset: -5, style: { fill: '#64748B', fontSize: 12 } }}
            />
            <Tooltip content={<CustomTooltip unit="片" />} />
            <Legend
              verticalAlign="bottom"
              iconType="square"
              iconSize={10}
              wrapperStyle={{ fontSize: 12, color: '#94A3B8', paddingTop: 16 }}
              formatter={(value: string) => <span style={{ color: '#94A3B8' }}>{value}</span>}
            />
            {EQUIPMENT.filter((eq) => activeEquipments.has(eq.key)).map((eq) => (
              <Line
                key={eq.key}
                type="monotone"
                dataKey={`${eq.key}_totalPieces`}
                name={eq.label}
                stroke={eq.color}
                strokeWidth={2.5}
                dot={{ r: 4, fill: eq.color, stroke: '#111827', strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                animationDuration={800}
                animationEasing="ease-out"
              >
                <LabelList dataKey={`${eq.key}_totalPieces`} position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => Math.round(v)} />
              </Line>
            ))}
            <Brush
              dataKey="date"
              height={30}
              stroke="#3B82F6"
              fill="rgba(59,130,246,0.08)"
              tickFormatter={(v: string) => format(parseISO(v), 'MM/dd')}
              travellerWidth={8}
            />
          </LineChart>
        </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ======== Section 5: Utilization Trend Chart ======== */}
      <div className="mt-6" ref={utilChartRef}>
        <ChartCard title="各机台日利用率趋势" delay={0.5} onExport={() => exportChartToPng(utilChartRef.current, '各机台日利用率趋势')}>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
                tickLine={false}
                tickFormatter={(v: string) => format(parseISO(v), 'MM/dd')}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
                label={{ value: '利用率', position: 'insideLeft', offset: -5, style: { fill: '#64748B', fontSize: 12 } }}
              />
              <Tooltip content={<CustomTooltip unit="%" />} />
              <Legend
                verticalAlign="bottom"
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 12, color: '#94A3B8', paddingTop: 16 }}
                formatter={(value: string) => <span style={{ color: '#94A3B8' }}>{value}</span>}
              />
              <ReferenceLine
                y={80}
                stroke="#10B981"
                strokeDasharray="6 4"
                strokeOpacity={0.4}
                label={{ value: '目标线 80%', position: 'right', fill: '#10B981', fontSize: 11 }}
              />
              <ReferenceLine
                y={50}
                stroke="#F59E0B"
                strokeDasharray="6 4"
                strokeOpacity={0.4}
                label={{ value: '警戒线 50%', position: 'right', fill: '#F59E0B', fontSize: 11 }}
              />
              {EQUIPMENT.filter((eq) => activeEquipments.has(eq.key)).map((eq) => (
                <Line
                  key={eq.key}
                  type="monotone"
                  dataKey={`${eq.key}_utilization`}
                  name={eq.label}
                  stroke={eq.color}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: eq.color, stroke: '#111827', strokeWidth: 2 }}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  <LabelList dataKey={`${eq.key}_utilization`} position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
                </Line>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ======== Section 6: Idle Time Stacked Bar Chart ======== */}
      <div className="mt-6" ref={idleChartRef}>
        <ChartCard title="各机台日空窗时间统计" delay={0.6} onExport={() => exportChartToPng(idleChartRef.current, '各机台日空窗时间统计')}>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
                tickLine={false}
                tickFormatter={(v: string) => format(parseISO(v), 'MM/dd')}
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
                tickLine={false}
                label={{ value: '分钟', position: 'insideLeft', offset: -5, style: { fill: '#64748B', fontSize: 12 } }}
              />
              <Tooltip content={<StackedTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 12, color: '#94A3B8', paddingTop: 16 }}
                formatter={(value: string) => <span style={{ color: '#94A3B8' }}>{value}</span>}
              />
              {EQUIPMENT.filter((eq) => activeEquipments.has(eq.key)).map((eq, i, arr) => (
                <Bar
                  key={eq.key}
                  dataKey={`${eq.key}_idleTime`}
                  name={eq.label}
                  stackId="idle"
                  fill={eq.color}
                  radius={i === arr.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  <LabelList dataKey={`${eq.key}_idleTime`} position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => Math.round(v)} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ======== Section 7: Daily Data Table ======== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-6"
      >
        <button
          onClick={() => setTableExpanded(!tableExpanded)}
          className="mb-3 flex items-center gap-1.5 text-[14px] font-medium text-[#3B82F6] transition-colors hover:text-[#60A5FA]"
        >
          {tableExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          查看每日详细数据
        </button>

        <AnimatePresence>
          {tableExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[16px] font-semibold text-[#F1F5F9]">每日详细数据</h3>
                  <button
                    onClick={() => {
                      exportOverviewExcel(
                        tableRows.map((row) => ({
                          日期: row.date,
                          PECVD产出: row.PECVD_output,
                          DRIE产出: row.DRIE_output,
                          ICP产出: row.ICP_output,
                          光刻机产出: row['光刻机_output'],
                          PECVD利用率: row.PECVD_utilization,
                          DRIE利用率: row.DRIE_utilization,
                          ICP利用率: row.ICP_utilization,
                          光刻机利用率: row['光刻机_utilization'],
                          合计产出: row.totalOutput,
                          平均利用率: row.avgUtilization,
                        })),
                      );
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-[#1F2937] px-3 py-1.5 text-[12px] text-[#64748B] transition-colors hover:border-[#374151] hover:text-[#F1F5F9]"
                  >
                    <Download className="h-3 w-3" />
                    导出表格数据
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#1F2937] bg-[#1A2332]">
                        <th className="sticky top-0 px-3 py-2.5 text-[13px] font-bold text-[#F1F5F9]">日期</th>
                        {EQUIPMENT.map((eq) => (
                          <th key={eq.key} className="sticky top-0 px-3 py-2.5 text-[13px] font-bold text-[#F1F5F9]">
                            {eq.label}产出
                          </th>
                        ))}
                        {EQUIPMENT.map((eq) => (
                          <th key={eq.key} className="sticky top-0 px-3 py-2.5 text-[13px] font-bold text-[#F1F5F9]">
                            {eq.label}利用率
                          </th>
                        ))}
                        <th className="sticky top-0 px-3 py-2.5 text-[13px] font-bold text-[#F1F5F9]">合计产出</th>
                        <th className="sticky top-0 px-3 py-2.5 text-[13px] font-bold text-[#F1F5F9]">平均利用率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, rowIndex) => (
                        <motion.tr
                          key={row.date}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: rowIndex * 0.03 }}
                          className="border-b border-[#1F2937] transition-colors hover:bg-[#1E2D42]"
                          style={{ background: rowIndex % 2 === 1 ? 'rgba(255,255,255,0.015)' : undefined }}
                        >
                          <td className="whitespace-nowrap px-3 py-2.5 text-[14px] text-[#F1F5F9]">
                            {row.date}
                          </td>
                          {EQUIPMENT.map((eq) => (
                            <td key={eq.key} className="whitespace-nowrap px-3 py-2.5 text-[14px] text-[#F1F5F9]">
                              {Number(row[`${eq.key}_totalPieces`]).toFixed(0)}片
                            </td>
                          ))}
                          {EQUIPMENT.map((eq) => {
                            const util = Number(row[`${eq.key}_utilization`]);
                            const isGood = util >= 80;
                            const isWarn = util >= 50 && util < 80;
                            return (
                              <td
                                key={eq.key}
                                className="whitespace-nowrap px-3 py-2.5 text-[14px] font-medium"
                                style={{ color: isGood ? '#10B981' : isWarn ? '#F59E0B' : '#EF4444' }}
                              >
                                {util.toFixed(1)}%
                              </td>
                            );
                          })}
                          <td className="whitespace-nowrap px-3 py-2.5 text-[14px] font-bold text-[#F1F5F9]">
                            {Number(row.totalOutput).toFixed(0)}片
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-[14px] text-[#F1F5F9]">
                            {Number(row.avgUtilization).toFixed(1)}%
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
