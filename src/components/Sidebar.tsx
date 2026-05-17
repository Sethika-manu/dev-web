import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "./SettingsContext";
import { 
  Globe, 
  Terminal, 
  Layout, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Search,
  X,
  Download
} from "lucide-react";
import { cn } from "../lib/utils";

const appWindow = getCurrentWindow();


interface Session {
  id: string;
  title: string;
  url: string;
}

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  activeView: 'browser' | 'settings' | 'console' | 'downloads';
  onSessionSelect: (id: string) => void;
  onSessionClose: (id: string) => void;
  onNewSession: () => void;
  onHomeClick: () => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
  onConsoleClick: () => void;
  onDownloadsClick: () => void;
  isDownloading: boolean;
}

export const Sidebar = ({ 
  sessions, 
  activeSessionId, 
  activeView,
  onSessionSelect, 
  onSessionClose, 
  onNewSession,
  onHomeClick,
  onSearchClick,
  onSettingsClick,
  onConsoleClick,
  onDownloadsClick,
  isDownloading
}: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { t } = useSettings();

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (!target.closest('button')) {
        appWindow.startDragging();
      }
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div
      style={{ width: isCollapsed ? 64 : 240 }}
      className="h-full bg-white dark:bg-[#0a0a0a] border-r border-neutral-200 dark:border-white/5 flex flex-col relative z-20 flex-shrink-0"
    >
      <div 
        data-tauri-drag-region
        onMouseDown={handleMouseDownDrag}
        className="p-4 flex items-center justify-between cursor-default h-12"
      >
        {!isCollapsed && (
          <span 
            className="text-[10px] font-bold text-neutral-400 dark:text-neutral-600 tracking-[0.2em] cursor-pointer hover:text-neutral-900 dark:hover:text-white transition-colors relative z-50"
            onClick={onHomeClick}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {t('nav_projects')}
          </span>
        )}
        <button
          onClick={toggleCollapse}
          className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-md transition-colors text-neutral-400 dark:text-neutral-500"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div className="flex-1 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        <button 
          onClick={onNewSession}
          className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all mb-4 group border border-accent/20 shadow-sm shadow-accent/5"
        >
          <Plus size={18} />
          {!isCollapsed && <span className="text-sm font-semibold">{t('nav_new_session')}</span>}
        </button>

        <div className="space-y-0.5">
          {sessions.map((session) => (
            <div key={session.id} className="relative group">
              <button
                onClick={() => onSessionSelect(session.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left",
                  activeSessionId === session.id 
                    ? "bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white shadow-sm" 
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
                )}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  activeSessionId === session.id ? "bg-accent animate-pulse" : "bg-neutral-300 dark:bg-neutral-800"
                )} />
                {!isCollapsed && (
                  <span className="text-xs font-medium truncate flex-1">
                    {session.url === "about:blank" ? "New Tab" : session.url.replace("https://", "").replace("www.", "").split("/")[0]}
                  </span>
                )}
              </button>
              
              {!isCollapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSessionClose(session.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 dark:text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all bg-white dark:bg-[#0a0a0a] rounded-md shadow-sm border border-neutral-100 dark:border-white/10"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {sessions.length > 0 && <div className="h-px bg-neutral-100 dark:bg-white/5 my-4 mx-2" />}

        <div className="space-y-0.5">
          <button 
            onClick={onDownloadsClick}
            className={cn(
              "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all",
              activeView === 'downloads'
                ? "bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
            )}
          >
            <motion.div
              animate={{ y: isDownloading ? [0, -3, 0] : 0 }}
              transition={{ repeat: isDownloading ? Infinity : 0, duration: 0.6 }}
            >
              <Download size={16} className={cn(isDownloading && "text-accent")} />
            </motion.div>
            {!isCollapsed && <span className="text-xs font-medium">Downloads</span>}
          </button>

          <button 
            onClick={onConsoleClick}
            className={cn(
              "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all",
              activeView === 'console'
                ? "bg-blue-500/10 text-blue-500 shadow-sm shadow-blue-500/5 border border-blue-500/20"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
            )}
          >
            <Terminal size={16} className={cn(activeView === 'console' && "drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]")} />
            {!isCollapsed && <span className="text-xs font-medium">{t('nav_console')}</span>}
          </button>

          <button 
            onClick={onSettingsClick}
            className={cn(
              "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all",
              activeView === 'settings'
                ? "bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
            )}
          >
            <Settings size={16} />
            {!isCollapsed && <span className="text-xs font-medium">{t('nav_settings')}</span>}
          </button>
        </div>
      </div>

      <div className="p-4 mt-auto border-t border-neutral-100 dark:border-white/5">
        <button 
          onClick={onSearchClick}
          className="w-full flex items-center gap-3 p-2 text-neutral-400 dark:text-neutral-600 hover:text-neutral-900 dark:hover:text-neutral-400 transition-colors"
        >
          <Search size={16} />
          {!isCollapsed && <span className="text-xs font-medium">Cmd + K</span>}
        </button>
      </div>
    </div>
  );
};
