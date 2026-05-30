import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Square, Copy, Search, ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";

const appWindow = getCurrentWindow();

interface TitleBarProps {
  onNavigate?: (url: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeSessionId: string | null;
}

export const TitleBar = ({ onNavigate, searchValue, onSearchChange, activeSessionId }: TitleBarProps) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(checkMobile);
  }, []);

  useEffect(() => {
    getVersion().then(setAppVersion).catch((err) => {
      console.error("Failed to get app version:", err);
    });
  }, []);

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

  const handleGoBack = async () => {
    if (activeSessionId) {
      const win = window as any;
      if (isMobile && (win.NativeBridge || win.AndroidBridge)) {
         // Android Bridge එකට Back කමාන්ඩ් එක දෙනවා
        (win.NativeBridge || win.AndroidBridge).goBack();
      } else {
         console.warn("Native bridge not found for goBack");
      }
    }
  };

  const handleGoForward = async () => {
    if (activeSessionId) {
      const win = window as any;
      if (isMobile && (win.NativeBridge || win.AndroidBridge)) {
        // Android Bridge එකට Forward කමාන්ඩ් එක දෙනවා
        (win.NativeBridge || win.AndroidBridge).goForward();
      } else {
        console.warn("Native bridge not found for goForward");
      }
    }
  };

  const handleReload = async () => {
    if (activeSessionId) {
      const win = window as any;
      if (isMobile && (win.NativeBridge || win.AndroidBridge)) {
        // Android Bridge එකට Reload කමාන්ඩ් එක දෙනවා
        (win.NativeBridge || win.AndroidBridge).reload();
      } else {
        console.warn("Native bridge not found for reload");
      }
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
      data-tauri-drag-region={isMobile ? undefined : ""}
      onMouseDown={isMobile ? undefined : handleMouseDownDrag}
      className="bg-white dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-white/5 flex items-center justify-between px-4 select-none cursor-default active:cursor-grabbing h-12 w-full text-neutral-800 dark:text-neutral-100"
    >
      <div data-tauri-drag-region={isMobile ? undefined : ""} className="flex items-center gap-3 w-1/4 h-full pointer-events-none hidden md:flex">
          <div className="w-2.5 h-2.5 bg-accent rounded-full shadow-[0_0_10px_rgba(var(--accent-rgb),0.5)]" />
          <span className="text-[10px] font-bold font-mono tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
            RC BROWSER <span className="text-neutral-300 dark:text-neutral-700 font-normal">{appVersion}</span>
          </span>
        </div>

      <div className="flex-1 w-full max-w-md mx-auto flex items-center gap-2 h-full">
        {activeSessionId && (
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={handleGoBack}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-950 dark:hover:text-white transition-colors rounded-md"
              title="Go Back"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleGoForward}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-950 dark:hover:text-white transition-colors rounded-md"
              title="Go Forward"
            >
              <ArrowRight size={16} />
            </button>
            <button
              onClick={handleReload}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-950 dark:hover:text-white transition-colors rounded-md ml-0.5"
              title="Reload"
            >
              <RotateCw size={14} />
            </button>
          </div>
        )}
        
        <form onSubmit={handleSearch} className="relative group flex-1">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search size={12} className="text-neutral-400 dark:text-neutral-600 group-focus-within:text-accent transition-colors" />
          </div>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Search or enter URL..."
            className="w-full bg-neutral-100 dark:bg-neutral-900/50 border border-neutral-200 dark:border-white/5 rounded-lg py-1.5 pl-9 pr-4 text-xs text-neutral-800 dark:text-neutral-300 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-accent/30 focus:bg-white dark:focus:bg-neutral-900/80 transition-all"
          />
        </form>
        <div data-tauri-drag-region={isMobile ? undefined : ""} className="w-4 h-full" />
      </div>

      <div className="flex items-center gap-1 w-1/4 justify-end h-full hidden md:flex">
        <div data-tauri-drag-region={isMobile ? undefined : ""} className="flex-1 h-full" />
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