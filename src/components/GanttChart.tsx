import { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

const ORDER_COLORS = [
  '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6',
  '#EF4444', '#06B6D4', '#F97316', '#84CC16', '#D946EF',
  '#14B8A6', '#EAB308', '#6366F1', '#F43F5E', '#A855F7',
  '#22C55E', '#FB923C', '#60A5FA', '#F472B6', '#C084FC',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getWorkOrderColor(workOrder: string): string {
  const index = hashString(workOrder) % ORDER_COLORS.length;
  return ORDER_COLORS[index];
}

interface BarSegment {
  key: string;
  leftPct: number;
  widthPct: number;
  workOrder: string;
  station: string;
  startTime: string;
  endTime: string;
  duration: number;
  shift: string;
  isContinuation: boolean;
}

interface GanttRecord {
  station: string;
  startHour: number;
  endHour: number;
  duration: number;
  workOrder: string;
  shift: string;
  startTime: string;
  endTime: string;
}

interface GanttChartProps {
  data: GanttRecord[];
  date: string;
}

/** Split records crossing midnight into two visual segments */
function splitBars(records: GanttRecord[]): BarSegment[] {
  const segments: BarSegment[] = [];
  records.forEach((r, idx) => {
    const start = r.startHour;
    const end = r.endHour;
    const dur = r.duration;

    if (end <= 24) {
      // Normal: within single day
      const leftPct = (start / 24) * 100;
      const widthPct = Math.max((dur / 1440) * 100, 0.2);
      segments.push({
        key: `${idx}-a`, leftPct, widthPct,
        workOrder: r.workOrder, station: r.station,
        startTime: r.startTime, endTime: r.endTime,
        duration: dur, shift: r.shift, isContinuation: false,
      });
    } else {
      // Crosses midnight: split into two
      const durA = (24 - start) * 60;
      const leftPctA = (start / 24) * 100;
      const widthPctA = Math.max((durA / 1440) * 100, 0.2);
      segments.push({
        key: `${idx}-a`, leftPct: leftPctA, widthPct: widthPctA,
        workOrder: r.workOrder, station: r.station,
        startTime: r.startTime, endTime: '24:00',
        duration: Math.round(durA), shift: r.shift, isContinuation: false,
      });

      const durB = (end - 24) * 60;
      const widthPctB = Math.max((durB / 1440) * 100, 0.2);
      segments.push({
        key: `${idx}-b`, leftPct: 0, widthPct: widthPctB,
        workOrder: r.workOrder, station: r.station,
        startTime: '00:00', endTime: r.endTime,
        duration: Math.round(durB), shift: r.shift, isContinuation: true,
      });
    }
  });
  return segments;
}

export default function GanttChart({ data, date }: GanttChartProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [filterOpen]);

  const uniqueWorkOrders = useMemo(
    () => [...new Set(data.map((d) => d.workOrder))].sort(),
    [data],
  );

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedOrders(new Set(uniqueWorkOrders));
  }, [uniqueWorkOrders]);

  const filteredData = useMemo(
    () => data.filter((d) => selectedOrders.has(d.workOrder)),
    [data, selectedOrders],
  );

  const stations = useMemo(
    () => [...new Set(filteredData.map((d) => d.station))].sort(),
    [filteredData],
  );

  const allSegments = useMemo(() => splitBars(filteredData), [filteredData]);

  const toggleOrder = (order: string) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  };

  const selectAll = () => setSelectedOrders(new Set(uniqueWorkOrders));
  const clearAll = () => setSelectedOrders(new Set());

  const workOrderColorMap = useMemo(() => {
    const map = new Map<string, string>();
    uniqueWorkOrders.forEach((wo) => map.set(wo, getWorkOrderColor(wo)));
    return map;
  }, [uniqueWorkOrders]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[12px] text-[#64748B]">{date}</p>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-1.5 rounded-md border border-[#334155] bg-[#1E293B] px-3 py-1.5 text-[11px] text-[#CBD5E1] transition hover:bg-[#273548]"
          >
            <span>工单筛选</span>
            {selectedOrders.size < uniqueWorkOrders.length && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#3B82F6] px-1 text-[9px] text-white">{selectedOrders.size}</span>
            )}
            <ChevronDown size={12} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {filterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 z-50 mt-1 w-56 rounded-md border border-[#334155] bg-[#1E293B] shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-[#334155] px-3 py-2">
                  <span className="text-[10px] text-[#94A3B8]">{selectedOrders.size}/{uniqueWorkOrders.length} 已选</span>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-[10px] text-[#3B82F6]">全选</button>
                    <button onClick={clearAll} className="text-[10px] text-[#3B82F6]">清空</button>
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto py-1">
                  {uniqueWorkOrders.map((wo) => {
                    const isSelected = selectedOrders.has(wo);
                    const color = workOrderColorMap.get(wo) || '#64748B';
                    return (
                      <label key={wo} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 transition hover:bg-[#273548]">
                        <div className="relative flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleOrder(wo)}
                            className="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-[#475569] bg-[#0F172A] checked:border-[#3B82F6] checked:bg-[#3B82F6]" />
                          {isSelected && <Check size={10} className="pointer-events-none absolute text-white" strokeWidth={3} />}
                        </div>
                        <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <span className="truncate text-[11px] text-[#CBD5E1]">{wo}</span>
                      </label>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Gantt Body - wide for fine granularity */}
      <div className="relative overflow-x-auto" style={{ minWidth: '100%' }}>
        <div style={{ minWidth: 1200, marginLeft: 110 }}>
          {/* Time header: every 30 min (48 slots) */}
          <div className="flex border-b border-[#1F2937] pb-1">
            {Array.from({ length: 49 }, (_, i) => {
              const hour = Math.floor(i / 2);
              const min = (i % 2) * 30;
              const isHour = min === 0;
              return (
                <div key={i} className="flex-shrink-0 text-center select-none"
                  style={{ width: `${100 / 48}%`, color: isHour ? '#94A3B8' : '#475569', fontSize: isHour ? 10 : 9,
                    borderLeft: isHour ? '1px solid rgba(148,163,184,0.15)' : '1px solid rgba(71,85,105,0.08)' }}>
                  {isHour ? `${hour}:00` : `${min}`}
                </div>
              );
            })}
          </div>

          <div className="mt-1">
            {stations.length === 0 && <div className="py-8 text-center text-[13px] text-[#64748B]">当日无工艺数据</div>}
            {stations.map((station, sIdx) => {
              const segs = allSegments.filter((seg) => seg.station === station);
              return (
                <motion.div key={station} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: sIdx * 0.03 }}
                  className="flex items-center border-b border-[#1F2937]/50 py-[3px]">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#94A3B8]"
                    style={{ width: 100, position: 'absolute', left: 0, paddingLeft: 4 }}>{station}</div>
                  <div className="relative flex-1" style={{ height: 32 }}>
                    {Array.from({ length: 25 }, (_, i) => (
                      <div key={i} className="absolute top-0 bottom-0 border-l"
                        style={{ left: `${(i / 24) * 100}%`, borderColor: i % 2 === 0 ? 'rgba(148,163,184,0.12)' : 'rgba(71,85,105,0.06)' }} />
                    ))}
                    {Array.from({ length: 24 }, (_, i) => (
                      <div key={`h${i}`} className="absolute bottom-0 border-l"
                        style={{ left: `${((i + 0.5) / 24) * 100}%`, height: 4, borderColor: 'rgba(71,85,105,0.08)' }} />
                    ))}
                    {segs.map((seg) => {
                      const color = workOrderColorMap.get(seg.workOrder) || '#64748B';
                      return (
                        <motion.div key={seg.key} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: sIdx * 0.03, duration: 0.3 }}
                          className="absolute top-[3px] bottom-[3px] cursor-pointer overflow-hidden rounded-sm"
                          style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, backgroundColor: color, opacity: 0.85,
                            transformOrigin: 'left', borderLeft: seg.isContinuation ? '2px dashed rgba(255,255,255,0.4)' : 'none' }}
                          title={`${seg.workOrder}${seg.isContinuation ? ' (续)' : ''}\n${seg.station}\n${seg.startTime} - ${seg.endTime}\n${seg.duration}min\n${seg.shift}班`}>
                          {seg.widthPct > 4 && (
                            <span className="block truncate px-1 text-[9px] leading-[26px] text-white/95 font-medium">{seg.workOrder}</span>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-[#94A3B8]">
        {uniqueWorkOrders.filter((wo) => selectedOrders.has(wo)).map((wo) => (
          <div key={wo} className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm" style={{ backgroundColor: workOrderColorMap.get(wo) || '#64748B', opacity: 0.85 }} />
            <span className="max-w-[80px] truncate">{wo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
