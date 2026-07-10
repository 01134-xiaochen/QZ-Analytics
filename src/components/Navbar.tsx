import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { CircuitBoard, ChevronDown, Download, CalendarDays, Upload, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/context/DataContext';

const equipmentList = [
  { name: 'PECVD', color: '#10B981', path: '/equipment/PECVD' },
  { name: 'DRIE', color: '#F59E0B', path: '/equipment/DRIE' },
  { name: 'ICP', color: '#3B82F6', path: '/equipment/ICP' },
  { name: '光刻机', color: '#EC4899', path: '/equipment/光刻机' },
];

export default function Navbar() {
  const location = useLocation();
  const { uploadFiles, uploadLoading } = useData();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setDropdownOpen(false), 150);
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Inject keyframes for drag overlay pulse animation */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(59, 130, 246, 0.6); box-shadow: 0 0 40px rgba(59,130,246,0.15); }
          50% { border-color: rgba(59, 130, 246, 1); box-shadow: 0 0 50px rgba(59,130,246,0.3); }
        }
      `}</style>
      <nav
        className="fixed top-0 z-50 h-[56px] w-full border-b border-[#1F2937]"
        style={{ background: 'rgba(11,15,25,0.92)', backdropFilter: 'blur(12px)' }}
      >
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <CircuitBoard className="h-5 w-5 text-[#3B82F6]" />
            <span className="text-[18px] font-bold text-[#F1F5F9]" style={{ fontFamily: 'Inter, sans-serif' }}>
              QZ Analytics
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {/* 总览 */}
            <NavLink label="总览" path="/" isActive={isActive('/')} delay={0} />

            {/* 机台详情 dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              ref={dropdownRef}
              className="relative"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className="relative flex items-center gap-1 px-4 py-2 text-[14px] font-medium transition-colors"
                style={{ color: location.pathname.startsWith('/equipment') ? '#F1F5F9' : '#94A3B8' }}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                机台详情
                <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                {location.pathname.startsWith('/equipment') && (
                  <motion.div layoutId="nav-indicator" className="absolute bottom-0 left-4 right-4 h-[2px]" style={{ background: 'linear-gradient(90deg, #10B981, #3B82F6, #EC4899)' }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                )}
              </button>
              <AnimatePresence>
                {dropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-1 min-w-[160px] overflow-hidden rounded-lg border border-[#1F2937] py-1"
                    style={{ background: '#1A2332', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}
                  >
                    {equipmentList.map((eq) => (
                      <Link key={eq.name} to={eq.path} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#94A3B8] transition-all hover:border-l-[3px] hover:text-[#F1F5F9]" style={{ borderLeftColor: eq.color }} onClick={() => setDropdownOpen(false)}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eq.color }} />
                        {eq.name}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 效率对比 */}
            <NavLink label="效率对比" path="/efficiency" isActive={isActive('/efficiency')} delay={0.1} />

            {/* 良率看板 */}
            <NavLink label="良率看板" path="/yield" isActive={isActive('/yield')} delay={0.15} />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadLoading}
              title="上传Excel文件"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#1A2332] hover:text-[#F1F5F9] disabled:opacity-50"
            >
              {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#1A2332] hover:text-[#F1F5F9]">
              <CalendarDays className="h-4 w-4" />
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#1A2332] hover:text-[#F1F5F9]">
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

function NavLink({ label, path, isActive: active, delay }: { label: string; path: string; isActive: boolean; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }}>
      <Link
        to={path}
        className="relative px-4 py-2 text-[14px] font-medium transition-colors"
        style={{ color: active ? '#F1F5F9' : '#94A3B8' }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#F1F5F9'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#94A3B8'; }}
      >
        {label}
        {active && (
          <motion.div layoutId="nav-indicator" className="absolute bottom-0 left-4 right-4 h-[2px]" style={{ background: 'linear-gradient(90deg, #10B981, #3B82F6, #EC4899)' }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
        )}
      </Link>
    </motion.div>
  );
}
