import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Globe, 
  Terminal, 
  Layout, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Search,
  X
} from "lucide-react";
import { cn } from "../lib/utils";

interface Session {
  id: string;
  title: string;
  url: string;
}

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onSessionClose: (id: string) => void;
  onNewSession: () => void;
  onHomeClick: () => void;
  onSearchClick: () => void;
}

export const Sidebar = ({ 
  sessions, 
  activeSessionId, 
  onSessionSelect, 
  onSessionClose, 
  onNewSession,
  onHomeClick,
  onSearchClick
}: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.div
      animate={{ width: isCollapsed ? 64 : 240 }}
      className="h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col relative z-20"
    >
      <div className="p-4 flex items-center justify-between">
        {!isCollapsed && (
          <span 
            className="text-[10px] font-bold text-neutral-600 tracking-[0.2em] cursor-pointer hover:text-white transition-colors"
            onClick={onHomeClick}
          >
            PROJECTS
          </span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 hover:bg-white/5 rounded-md transition-colors text-neutral-500"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div className="flex-1 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        <button 
          onClick={onNewSession}
          className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all mb-4 group border border-accent/20"
        >
          <Plus size={18} />
          {!isCollapsed && <span className="text-sm font-semibold">New Session</span>}
        </button>

        <div className="space-y-0.5">
          {sessions.map((session) => (
            <div key={session.id} className="relative group">
              <button
                onClick={() => onSessionSelect(session.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left",
                  activeSessionId === session.id 
                    ? "bg-white/5 text-white shadow-sm" 
                    : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]"
                )}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  activeSessionId === session.id ? "bg-accent animate-pulse" : "bg-neutral-800"
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all bg-[#0a0a0a] rounded-md"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {sessions.length > 0 && <div className="h-px bg-white/5 my-4 mx-2" />}

        <div className="space-y-0.5">
          {[
            { icon: Layout, label: "Split View" },
            { icon: Terminal, label: "Console" },
            { icon: Settings, label: "Config" },
          ].map((item, idx) => (
            <button
              key={idx}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02] transition-all"
            >
              <item.icon size={16} />
              {!isCollapsed && <span className="text-xs font-medium">{item.label}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 mt-auto border-t border-white/5">
        <button 
          onClick={onSearchClick}
          className="w-full flex items-center gap-3 p-2 text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          <Search size={16} />
          {!isCollapsed && <span className="text-xs font-medium">Cmd + K</span>}
        </button>
      </div>
    </motion.div>
  );
};
