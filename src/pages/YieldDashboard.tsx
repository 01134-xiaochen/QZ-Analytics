import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';
import { Download, Search, Award, Package, TrendingUp, CheckCircle2, XCircle } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { exportToExcel, exportChartToPng } from '@/lib/export';

/* ─────────────────────── types ─────────────────────── */

interface Batch {
  batchId: string;
  yield: number;
  bin12Ratio: number;
  waferCount: number;
  delivered: string;
  month: string;
  workOrder: string;
  pieces: number;
}

interface MonthlyStat {
  month: string;
  avgYield: number;
  avgBin12: number;
  totalWafers: number;
  batchCount: number;
  deliveredCount: number;
}

/* ─────────────────────── helpers ─────────────────────── */

const yieldColor = (v: number) => (v >= 80 ? '#10B981' : v >= 60 ? '#F59E0B' : '#EF4444');

const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

const cardStagger = { visible: { transition: { staggerChildren: 0.08 } } };
const cardItem = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

/* ─────────────────────── component ─────────────────────── */

export default function YieldDashboard() {
  const { data } = useData();
  const chartRef = useRef<HTMLDivElement>(null);

  const allBatches: Batch[] = useMemo(() => data?.yield?.allBatches || [], [data]);
  const recent10: Batch[] = useMemo(() => data?.yield?.recent10Batches || [], [data]);
  const monthlyStats: MonthlyStat[] = useMemo(() => data?.yield?.monthlyStats || [], [data]);

  const [chartMode, setChartMode] = useState<'recent' | 'all' | 'custom'>('recent');
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<keyof Batch>('batchId');
  const [sortAsc, setSortAsc] = useState(true);
  const [pageNum, setPageNum] = useState(1);
  const PAGE_SIZE = 10;

  /* ── Chart data ── */
  const chartData = useMemo(() => {
    let source = chartMode === 'recent' ? recent10 : allBatches;
    if (chartMode === 'custom') {
      if (selectedBatches.size === 0) return [];
      source = allBatches.filter((b) => selectedBatches.has(b.batchId));
    }
    return source.map((b) => ({
      name: b.batchId,
      yield: b.yield,
      bin12: b.bin12Ratio,
      waferCount: b.waferCount,
      delivered: b.delivered,
      workOrder: b.workOrder,
    }));
  }, [allBatches, recent10, chartMode, selectedBatches]);

  /* ── Table data ── */
  const filteredTable = useMemo(() => {
    let rows = [...allBatches];
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      rows = rows.filter((r) =>
        r.batchId.toLowerCase().includes(q) ||
        r.workOrder.toLowerCase().includes(q) ||
        (r.month && r.month.includes(q)) ||
        String(r.waferCount).includes(q)
      );
    }
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [allBatches, searchText, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredTable.length / PAGE_SIZE));
  const pagedTable = filteredTable.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);

  const handleSort = (key: keyof Batch) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
    setPageNum(1);
  };

  const toggleBatchSelection = (id: string) => {
    setSelectedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ── Export ── */
  const handleExportExcel = () => {
    exportToExcel(allBatches.map((b) => ({
      '批次号': b.batchId,
      '工单号': b.workOrder,
      '晶圆数': b.waferCount,
      '良率%': b.yield,
      'Bin1&2占比%': b.bin12Ratio,
      '交付状态': b.delivered === 'Y' ? '已交付' : '未交付',
      '月份': b.month,
    })), '良率数据');
  };

  const handleExportChart = () => {
    if (chartRef.current) exportChartToPng(chartRef.current, '批次良率趋势');
  };

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#F1F5F9]">出货及良率看板</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">Yield & Delivery Dashboard</p>
        </div>
        <button onClick={handleExportExcel} className="flex items-center gap-1.5 rounded-lg border border-[#1F2937] bg-[#1A2332] px-3 py-2 text-[12px] text-[#94A3B8] transition-colors hover:border-[#374151] hover:text-[#F1F5F9]">
          <Download className="h-3.5 w-3.5" />
          导出Excel
        </button>
      </div>

      {/* ── 1. Monthly Statistics ── */}
      <motion.div variants={cardStagger} initial="hidden" animate="visible" className="space-y-4">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[#F1F5F9]">
          <Award className="h-5 w-5 text-[#F59E0B]" />
          月度质量统计
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {monthlyStats.map((m) => (
            <MonthlyCard key={m.month} stat={m} />
          ))}
        </div>
      </motion.div>

      {/* ── 2. Batch Yield Trend Chart ── */}
      <motion.div variants={cardItem} initial="hidden" animate="visible" className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-[#F1F5F9]">批次良率趋势</h3>
            <p className="mt-0.5 text-[12px] text-[#64748B]">近10批 / 全部 / 自定义</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-[#1F2937] bg-[#0B0F19] p-0.5">
              {([['recent', '近10批'], ['all', '全部'], ['custom', '自定义']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setChartMode(mode)}
                  className="rounded-md px-3 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    background: chartMode === mode ? '#1A2332' : 'transparent',
                    color: chartMode === mode ? '#F1F5F9' : '#64748B',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={handleExportChart} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1F2937] text-[#64748B] transition-colors hover:text-[#F1F5F9]">
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Custom batch selector */}
        {chartMode === 'custom' && (
          <div className="mb-3 max-h-[120px] overflow-y-auto rounded-lg border border-[#1F2937] bg-[#0B0F19] p-2">
            <div className="mb-1 flex gap-3 text-[11px]">
              <button onClick={() => setSelectedBatches(new Set(allBatches.map((b) => b.batchId)))} className="text-[#3B82F6] hover:underline">全选</button>
              <button onClick={() => setSelectedBatches(new Set())} className="text-[#64748B] hover:underline">清空</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {allBatches.map((b) => (
                <label key={b.batchId} className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${selectedBatches.has(b.batchId) ? 'border-[#374151] bg-[#1A2332] text-[#F1F5F9]' : 'border-[#1F2937] text-[#64748B]'}`}>
                  <input type="checkbox" checked={selectedBatches.has(b.batchId)} onChange={() => toggleBatchSelection(b.batchId)} className="accent-[#3B82F6]" />
                  {b.batchId}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Chart */}
        <div ref={chartRef} className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
              <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} angle={-30} textAnchor="end" height={60} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(148,163,184,0.15)' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: 'rgba(26,35,50,0.95)', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#F1F5F9' }}
                itemStyle={{ fontSize: 12 }}
                formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'yield' ? '良率' : 'Bin1&2占比']}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94A3B8' }} formatter={(v) => v === 'yield' ? '良率' : 'Bin1&2占比'} />
              <ReferenceLine y={80} stroke="#10B981" strokeDasharray="4 4" label={{ value: '80%', fill: '#10B981', fontSize: 10, position: 'right' }} />
              <ReferenceLine y={60} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: '60%', fill: '#F59E0B', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="yield" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4, fill: '#111827', strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={800}>
                <LabelList dataKey="yield" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
              </Line>
              <Line type="monotone" dataKey="bin12" stroke="#10B981" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#111827', strokeWidth: 2 }} activeDot={{ r: 5 }} animationDuration={800}>
                <LabelList dataKey="bin12" position="top" fill="#94A3B8" fontSize={10} style={{fontFamily: 'Microsoft YaHei, sans-serif'}} formatter={(v: number) => (+v).toFixed(2)} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* ── 3. Batch Detail Table ── */}
      <motion.div variants={cardItem} initial="hidden" animate="visible" className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[16px] font-semibold text-[#F1F5F9]">批次详细数据</h3>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
            <input
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPageNum(1); }}
              placeholder="搜索批次号、工单号、月份..."
              className="rounded-lg border border-[#1F2937] bg-[#0B0F19] py-1.5 pl-8 pr-3 text-[12px] text-[#F1F5F9] outline-none transition-colors placeholder:text-[#64748B] focus:border-[#374151]"
              style={{ width: 240 }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1F2937] text-[#64748B]">
                <th className="cursor-pointer px-3 py-2 text-left font-medium hover:text-[#F1F5F9]" onClick={() => handleSort('batchId')}>批次号 {sortKey === 'batchId' && (sortAsc ? '▲' : '▼')}</th>
                <th className="cursor-pointer px-3 py-2 text-left font-medium hover:text-[#F1F5F9]" onClick={() => handleSort('workOrder')}>工单号 {sortKey === 'workOrder' && (sortAsc ? '▲' : '▼')}</th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium hover:text-[#F1F5F9]" onClick={() => handleSort('waferCount')}>晶圆数 {sortKey === 'waferCount' && (sortAsc ? '▲' : '▼')}</th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium hover:text-[#F1F5F9]" onClick={() => handleSort('yield')}>良率(%) {sortKey === 'yield' && (sortAsc ? '▲' : '▼')}</th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium hover:text-[#F1F5F9]" onClick={() => handleSort('bin12Ratio')}>Bin1&2占比(%) {sortKey === 'bin12Ratio' && (sortAsc ? '▲' : '▼')}</th>
                <th className="px-3 py-2 text-center font-medium">交付状态</th>
                <th className="cursor-pointer px-3 py-2 text-center font-medium hover:text-[#F1F5F9]" onClick={() => handleSort('month')}>月份 {sortKey === 'month' && (sortAsc ? '▲' : '▼')}</th>
              </tr>
            </thead>
            <tbody>
              {pagedTable.map((row, idx) => (
                <motion.tr
                  key={row.batchId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="border-b border-[#1F2937]/40 transition-colors hover:bg-[#1E2D42]/50"
                  style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                >
                  <td className="px-3 py-2 font-medium text-[#F1F5F9]">{row.batchId}</td>
                  <td className="px-3 py-2 text-[#94A3B8]">{row.workOrder}</td>
                  <td className="px-3 py-2 text-right text-[#94A3B8]">{row.waferCount}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-8 overflow-hidden rounded-full bg-[#1F2937]">
                        <div className="h-full rounded-full" style={{ width: `${row.yield}%`, backgroundColor: yieldColor(row.yield) }} />
                      </div>
                      <span style={{ color: yieldColor(row.yield) }}>{row.yield.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-[#94A3B8]">{row.bin12Ratio.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-center">
                    {row.delivered === 'Y' ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                        <CheckCircle2 className="h-3 w-3" />已交付
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                        <XCircle className="h-3 w-3" />未交付
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[#94A3B8]">{row.month || '-'}</td>
                </motion.tr>
              ))}
              {pagedTable.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[#64748B]">无匹配数据</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredTable.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between text-[12px] text-[#64748B]">
            <span>共 {filteredTable.length} 条，第 {pageNum}/{totalPages} 页</span>
            <div className="flex gap-1">
              <button onClick={() => setPageNum(1)} disabled={pageNum === 1} className="rounded-md border border-[#1F2937] px-2 py-1 text-[11px] disabled:opacity-30 hover:border-[#374151]">首页</button>
              <button onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum === 1} className="rounded-md border border-[#1F2937] px-2 py-1 text-[11px] disabled:opacity-30 hover:border-[#374151]">上一页</button>
              <button onClick={() => setPageNum((p) => Math.min(totalPages, p + 1))} disabled={pageNum === totalPages} className="rounded-md border border-[#1F2937] px-2 py-1 text-[11px] disabled:opacity-30 hover:border-[#374151]">下一页</button>
              <button onClick={() => setPageNum(totalPages)} disabled={pageNum === totalPages} className="rounded-md border border-[#1F2937] px-2 py-1 text-[11px] disabled:opacity-30 hover:border-[#374151]">末页</button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────── Monthly Card ─────────────────────── */

function MonthlyCard({ stat }: { stat: MonthlyStat }) {
  const monthLabel = stat.month ? `${stat.month.split('-')[0]}年${parseInt(stat.month.split('-')[1])}月` : '-';

  return (
    <motion.div variants={cardItem} className="rounded-[14px] border border-[#1F2937] bg-[#111827] p-5">
      <h4 className="mb-3 text-[14px] font-semibold text-[#F1F5F9]">{monthLabel}</h4>

      <div className="grid grid-cols-2 gap-4">
        {/* Yield ring */}
        <div className="flex flex-col items-center">
          <RingProgress value={stat.avgYield} color={yieldColor(stat.avgYield)} label={`${stat.avgYield.toFixed(1)}%`} sublabel="平均良率" />
        </div>
        {/* Bin12 ring */}
        <div className="flex flex-col items-center">
          <RingProgress value={stat.avgBin12} color="#3B82F6" label={`${stat.avgBin12.toFixed(1)}%`} sublabel="Bin1&2占比" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#1F2937] pt-3">
        <MiniKPI icon={<Package className="h-3.5 w-3.5" />} label="总晶圆" value={stat.totalWafers} />
        <MiniKPI icon={<TrendingUp className="h-3.5 w-3.5" />} label="批次" value={stat.batchCount} />
        <MiniKPI icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="已交付" value={stat.deliveredCount} color="#10B981" />
      </div>
    </motion.div>
  );
}

function RingProgress({ value, color, label, sublabel }: { value: number; color: string; label: string; sublabel: string }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="72" height="72" className="-rotate-90 flex-shrink-0">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#1F2937" strokeWidth="5" />
        <motion.circle
          cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ} initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }} transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="text-center">
        <div className="text-[14px] font-bold leading-tight" style={{ color }}>{label}</div>
        <div className="mt-0.5 text-[10px] text-[#64748B] leading-tight">{sublabel}</div>
      </div>
    </div>
  );
}

function MiniKPI({ icon, label, value, color = '#94A3B8' }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div className="mb-0.5 flex items-center justify-center gap-1 text-[10px]" style={{ color }}>{icon}<span className="text-[#64748B]">{label}</span></div>
      <div className="text-[16px] font-bold text-[#F1F5F9]">{value}</div>
    </div>
  );
}
