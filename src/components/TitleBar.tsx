import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Square, Copy, Search, ArrowLeft, ArrowRight, RotateCw, Home } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

const appWindow = getCurrentWindow();

export function recordSearchHistory(queryOrUrl: string) {
  if (!queryOrUrl || !queryOrUrl.trim()) return;
  try {
    const rawHistory = localStorage.getItem('app_browser_history');
    let history: { queryOrUrl: string; timestamp: number }[] = [];
    if (rawHistory) {
      try {
        history = JSON.parse(rawHistory);
      } catch (e) {
        history = [];
      }
    }
    if (!Array.isArray(history)) {
      history = [];
    }
    history.push({
      queryOrUrl: queryOrUrl.trim(),
      timestamp: Date.now()
    });
    if (history.length > 100) {
      history = history.slice(history.length - 100);
    }
    localStorage.setItem('app_browser_history', JSON.stringify(history));
  } catch (e) {
    console.error("Failed to record search history:", e);
  }
}

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
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<{ queryOrUrl: string; timestamp: number }[]>([]);

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

  interface HistoryState {
    stack: string[];
    index: number;
  }
  const sessionHistoryMapRef = useRef<Record<string, HistoryState>>({});
  const lastBackClickRef = useRef<number>(0);

  useEffect(() => {
    if (!activeSessionId) {
      setCanGoBack(false);
      setCanGoForward(false);
      return;
    }
    
    const state = sessionHistoryMapRef.current[activeSessionId] || { stack: [""], index: 0 };
    const currentUrl = searchValue.trim() === "about:blank" ? "" : searchValue.trim();
    
    const lastUrl = state.stack[state.index];
    if (lastUrl !== currentUrl) {
      // Check if we went back
      if (state.index > 0 && state.stack[state.index - 1] === currentUrl) {
        state.index--;
      } 
      // Check if we went forward
      else if (state.index < state.stack.length - 1 && state.stack[state.index + 1] === currentUrl) {
        state.index++;
      }
      // New navigation
      else {
        state.stack = state.stack.slice(0, state.index + 1);
        state.stack.push(currentUrl);
        state.index = state.stack.length - 1;
      }
      sessionHistoryMapRef.current[activeSessionId] = state;
    }
    
    setCanGoBack(state.index > 0);
    setCanGoForward(state.index < state.stack.length - 1);
  }, [activeSessionId, searchValue]);

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

  const handleFocus = () => {
    setShowSuggestions(true);
  };

  const handleSuggestionMouseDown = (e: React.MouseEvent, queryOrUrl: string) => {
    e.preventDefault();
    e.stopPropagation();
    onSearchChange(queryOrUrl);
    setShowSuggestions(false);
    
    recordSearchHistory(queryOrUrl);
    if (onNavigate) {
      onNavigate(queryOrUrl);
    }
  };

  const handleDeleteSuggestion = (e: React.MouseEvent, queryOrUrlToDelete: string, timestampToDelete: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const rawHistory = localStorage.getItem('app_browser_history');
      if (rawHistory) {
        const history = JSON.parse(rawHistory);
        if (Array.isArray(history)) {
          const updated = history.filter(item => !(item.queryOrUrl === queryOrUrlToDelete && item.timestamp === timestampToDelete));
          localStorage.setItem('app_browser_history', JSON.stringify(updated));
          
          let list = [...updated].reverse();
          const query = searchValue.trim().toLowerCase();
          if (query) {
            list = list.filter(item => item.queryOrUrl.toLowerCase().includes(query));
          }
          setSuggestions(list.slice(0, 5));
        }
      }
    } catch (err) {
      console.error("Failed to delete search history entry:", err);
    }
  };

  useEffect(() => {
    if (!showSuggestions) return;
    
    const rawHistory = localStorage.getItem('app_browser_history');
    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) {
          let list = [...parsed].reverse();
          const query = searchValue.trim().toLowerCase();
          if (query) {
            list = list.filter(item => item.queryOrUrl.toLowerCase().includes(query));
          }
          setSuggestions(list.slice(0, 5));
        }
      } catch (e) {
        console.error("Failed to parse app_browser_history", e);
      }
    } else {
      setSuggestions([]);
    }
  }, [searchValue, showSuggestions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (query) {
      recordSearchHistory(query);
      if (onNavigate) {
        onNavigate(query);
      }
    }
  };

  const handleGoBack = async () => {
    if (activeSessionId) {
      if (isMobile) {
        const win = window as any;
        if (win.NativeBridge || win.AndroidBridge) {
          (win.NativeBridge || win.AndroidBridge).goBack();
        }
      } else {
        await invoke("go_back", { label: activeSessionId }).catch((err) => {
          console.warn("Failed to go back on PC:", err);
        });
      }
    }
  };

  const handleGoForward = async () => {
    if (activeSessionId) {
      if (isMobile) {
        const win = window as any;
        if (win.NativeBridge || win.AndroidBridge) {
          (win.NativeBridge || win.AndroidBridge).goForward();
        }
      } else {
        await invoke("go_forward", { label: activeSessionId }).catch((err) => {
          console.warn("Failed to go forward on PC:", err);
        });
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

  const handleGoHomeSession = () => {
    if (onNavigate) {
      onNavigate("");
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
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-950 dark:hover:text-white transition-colors rounded-md cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleGoForward}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-950 dark:hover:text-white transition-colors rounded-md cursor-pointer"
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
            <button
              onClick={handleGoHomeSession}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-950 dark:hover:text-white transition-colors rounded-md ml-0.5"
              title="Home Start Page"
            >
              <Home size={15} />
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
            onFocus={handleFocus}
            onBlur={() => setShowSuggestions(false)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Search or enter URL..."
            className="w-full bg-neutral-100 dark:bg-neutral-900/50 border border-neutral-200 dark:border-white/5 rounded-lg py-1.5 pl-9 pr-4 text-xs text-neutral-800 dark:text-neutral-300 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-accent/30 focus:bg-white dark:focus:bg-neutral-900/80 transition-all"
          />

          {showSuggestions && suggestions.length > 0 && (
            <div 
              className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#0a0a0a] border border-neutral-200 dark:border-white/10 rounded-lg shadow-xl overflow-hidden z-[99999]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {suggestions.map((item, idx) => (
                <div
                  key={idx}
                  onMouseDown={(e) => handleSuggestionMouseDown(e, item.queryOrUrl)}
                  className="px-4 py-2 text-[11px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors flex items-center justify-between gap-2 group/row"
                >
                  <div className="flex items-center gap-2 truncate flex-1">
                    <Search size={10} className="text-neutral-400 dark:text-neutral-600 flex-shrink-0" />
                    <span className="truncate">{item.queryOrUrl}</span>
                  </div>
                  <button
                    onMouseDown={(e) => handleDeleteSuggestion(e, item.queryOrUrl, item.timestamp)}
                    className="p-1 hover:bg-neutral-200 dark:hover:bg-white/10 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors flex items-center justify-center flex-shrink-0"
                    title="Delete History Entry"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
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