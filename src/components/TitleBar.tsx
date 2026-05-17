import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Square, Copy, Search, ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

const appWindow = getCurrentWindow();

interface TitleBarProps {
  onNavigate?: (url: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeSessionId: string | null;
}

export const TitleBar = ({ onNavigate, searchValue, onSearchChange, activeSessionId }: TitleBarProps) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const updateIsMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };
    updateIsMaximized();
    
    const unlisten = appWindow.onResized(() => {
      updateIsMaximized();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
    setIsMaximized(await appWindow.isMaximized());
  };

  const handleClose = async () => {
    await appWindow.close();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim() && onNavigate) {
      onNavigate(searchValue.trim());
    }
  };

  const handleGoBack = () => {
    if (activeSessionId) {
      invoke("go_back", { label: activeSessionId }).catch(() => {});
    }
  };

  const handleGoForward = () => {
    if (activeSessionId) {
      invoke("go_forward", { label: activeSessionId }).catch(() => {});
    }
  };

  const handleReload = () => {
    if (activeSessionId) {
      invoke("reload_webview", { label: activeSessionId }).catch(() => {});
    }
  };

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (!target.closest('button') && !target.closest('input')) {
        appWindow.startDragging();
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDownDrag}
      className="h-12 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between px-4 select-none cursor-default active:cursor-grabbing"
    >
      <div data-tauri-drag-region className="flex items-center gap-3 w-1/4 h-full pointer-events-none">
        <div className="w-2.5 h-2.5 bg-accent rounded-full shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]" />
        <span className="text-[10px] font-bold font-mono tracking-[0.2em] text-neutral-500">
          RCBROWSING <span className="text-neutral-700 font-normal">v0.1.0</span>
        </span>
      </div>

      <div className="flex-1 max-w-2xl flex items-center gap-2 h-full">
        {activeSessionId && (
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={handleGoBack}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-white/5 text-neutral-500 hover:text-white transition-colors rounded-md"
              title="Go Back"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleGoForward}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-white/5 text-neutral-500 hover:text-white transition-colors rounded-md"
              title="Go Forward"
            >
              <ArrowRight size={16} />
            </button>
            <button
              onClick={handleReload}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-white/5 text-neutral-500 hover:text-white transition-colors rounded-md ml-0.5"
              title="Reload"
            >
              <RotateCw size={14} />
            </button>
          </div>
        )}
        
        <form onSubmit={handleSearch} className="relative group flex-1">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search size={12} className="text-neutral-600 group-focus-within:text-accent transition-colors" />
          </div>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Search or enter URL..."
            className="w-full bg-neutral-900/50 border border-white/5 rounded-lg py-1.5 pl-9 pr-4 text-xs text-neutral-300 placeholder:text-neutral-600 focus:outline-none focus:border-accent/30 focus:bg-neutral-900/80 transition-all"
          />
        </form>
        <div data-tauri-drag-region className="w-4 h-full" />
      </div>

      <div className="flex items-center gap-1 w-1/4 justify-end h-full">
        <div data-tauri-drag-region className="flex-1 h-full" />
        <button
          onClick={handleMinimize}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-2 hover:bg-white/5 transition-colors rounded-md"
        >
          <Minus size={14} className="text-neutral-500" />
        </button>
        <button
          onClick={handleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-2 hover:bg-white/5 transition-colors rounded-md"
        >
          {isMaximized ? <Copy size={14} className="text-neutral-500" /> : <Square size={14} className="text-neutral-500" />}
        </button>
        <button
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-2 hover:bg-red-500/10 hover:text-red-500 transition-colors rounded-md group"
        >
          <X size={14} className="text-neutral-500 group-hover:text-red-500" />
        </button>
      </div>
    </header>
  );
};
