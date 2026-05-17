import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { Viewport } from "./components/Viewport";
import { Home } from "./components/Home";
import { Settings } from "./components/Settings";
import { Console } from "./components/Console";
import { Downloads } from "./components/Downloads";
import { listen } from "@tauri-apps/api/event";
import { logEvent } from "firebase/analytics";
import { analytics } from "./firebase";
import { Download } from "lucide-react";

interface Session {
  id: string;
  title: string;
  url: string;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    if (localStorage.getItem('rc_restore_tabs') === 'true') {
      const saved = localStorage.getItem('rc_saved_sessions');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
          console.error("Failed to parse saved sessions");
        }
      }
    }
    return [];
  });
  
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    if (localStorage.getItem('rc_restore_tabs') === 'true') {
      const savedId = localStorage.getItem('rc_active_session');
      if (savedId) return savedId;
    }
    return null;
  });
  const [searchValue, setSearchValue] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [appView, setAppView] = useState<'browser' | 'settings' | 'console' | 'downloads'>('browser');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string, desc: string} | null>(null);
  const [progressStates, setProgressStates] = useState<Record<string, number>>({});

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // Log app_open when the app starts
  useEffect(() => {
    try {
      if (analytics) {
        logEvent(analytics, 'app_open');
      }
    } catch (e) {
      console.warn("Analytics not configured yet");
    }
  }, []);

  // Sync sessions to localStorage if restore tabs is enabled
  useEffect(() => {
    if (localStorage.getItem('rc_restore_tabs') === 'true') {
      localStorage.setItem('rc_saved_sessions', JSON.stringify(sessions));
      if (activeSessionId) {
        localStorage.setItem('rc_active_session', activeSessionId);
      } else {
        localStorage.removeItem('rc_active_session');
      }
    } else {
      localStorage.removeItem('rc_saved_sessions');
      localStorage.removeItem('rc_active_session');
    }
  }, [sessions, activeSessionId]);

  // Global Download Listener for Toast & Sidebar Animation
  useEffect(() => {
    const unlisten = listen<any>('download-event', (event) => {
      const payload = event.payload;
      if (payload.state === 'started') {
        setIsDownloading(true);
        setToastMessage({ title: 'Download Started', desc: payload.url.split('/').pop() || 'File downloading' });
        setTimeout(() => setToastMessage(null), 3000);
      } else if (payload.state === 'finished' || payload.state === 'failed') {
        setIsDownloading(false);
        setToastMessage({ title: payload.state === 'finished' ? 'Download Complete' : 'Download Failed', desc: payload.url.split('/').pop() || 'File' });
        setTimeout(() => setToastMessage(null), 3000);

        // Fetch existing history safely to avoid race conditions
        const saved = localStorage.getItem('rc_download_history');
        let currentHistory = [];
        if (saved) {
          try {
            currentHistory = JSON.parse(saved);
            if (!Array.isArray(currentHistory)) currentHistory = [];
          } catch (e) {
            currentHistory = [];
          }
        }

        const newItem = {
          id: Math.random().toString(36).substring(7) + '-' + Date.now(),
          url: payload.url,
          path: payload.path,
          timestamp: Date.now(),
          status: payload.state === 'finished' ? 'completed' : 'failed'
        };

        const updatedHistory = [newItem, ...currentHistory];
        localStorage.setItem('rc_download_history', JSON.stringify(updatedHistory));
        
        // Dispatch event for Downloads component to update its UI in real-time
        window.dispatchEvent(new CustomEvent('rc-download-finished', { detail: newItem }));
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // Global Loading Progress Bar Logic
  useEffect(() => {
    let timers: Record<string, NodeJS.Timeout> = {};
    let debounceTimers: Record<string, NodeJS.Timeout> = {};

    const handleNativeStart = (label: string) => {
      setProgressStates(prev => ({ ...prev, [label]: 10 }));
      if (timers[label]) clearInterval(timers[label]);
      timers[label] = setInterval(() => {
        setProgressStates(prev => {
          const current = prev[label] || 10;
          if (current >= 85) {
            clearInterval(timers[label]);
            return prev;
          }
          return { ...prev, [label]: current + (85 - current) * 0.1 };
        });
      }, 500);
    };

    const handleNativeEnd = (label: string) => {
      if (timers[label]) {
        clearInterval(timers[label]);
        delete timers[label];
      }
      setProgressStates(prev => ({ ...prev, [label]: 100 }));
      setTimeout(() => {
        setProgressStates(prev => {
          if (prev[label] === 100) return { ...prev, [label]: 0 };
          return prev;
        });
      }, 400);
    };

    const handleFakePulse = (label: string) => {
      if (debounceTimers[label]) return;
      setProgressStates(prev => ({ ...prev, [label]: 30 }));
      setTimeout(() => {
        setProgressStates(prev => ({ ...prev, [label]: 80 }));
        setTimeout(() => {
          setProgressStates(prev => ({ ...prev, [label]: 100 }));
          setTimeout(() => {
            setProgressStates(prev => {
              if (prev[label] === 100) return { ...prev, [label]: 0 };
              return prev;
            });
          }, 300);
        }, 500);
      }, 50);

      debounceTimers[label] = setTimeout(() => {
        delete debounceTimers[label];
      }, 1000);
    };

    // Custom Page Load Event (from our Rust backend)
    const unlisten1 = listen<any>('page-load-event', (event) => {
      const payload = event.payload;
      if (payload.state === 'started') handleNativeStart(payload.label);
      else handleNativeEnd(payload.label);
    });

    // Custom SPA Navigation (from our injected script)
    const unlisten2 = listen<any>('spa-navigation', (event) => {
      handleFakePulse(event.payload.label);
    });

    // Native Tauri v2 Loading Events (safeguard)
    const unlisten3 = listen<any>('tauri://load-start', (event) => {
       if ((event as any).windowLabel) handleNativeStart((event as any).windowLabel);
    });
    const unlisten4 = listen<any>('tauri://loading-progress', (event) => {
       // if we wanted to map the exact progress we could, but fake animation is smoother
    });
    const unlisten5 = listen<any>('tauri://load-finish', (event) => {
       if ((event as any).windowLabel) handleNativeEnd((event as any).windowLabel);
    });

    return () => {
      unlisten1.then(fn => fn());
      unlisten2.then(fn => fn());
      unlisten3.then(fn => fn());
      unlisten4.then(fn => fn());
      unlisten5.then(fn => fn());
      Object.values(timers).forEach(clearInterval);
      Object.values(debounceTimers).forEach(clearTimeout);
    };
  }, []);

  // UX Loading Pulse for Tab/Session Switching
  useEffect(() => {
    if (activeSessionId) {
      setProgressStates(prev => {
        // Do not interfere if a native load is already actively happening
        if (prev[activeSessionId] > 0 && prev[activeSessionId] < 100) return prev;
        return { ...prev, [activeSessionId]: 30 };
      });
      
      const t1 = setTimeout(() => {
        setProgressStates(prev => {
          if (prev[activeSessionId] > 30 && prev[activeSessionId] < 100) return prev;
          return { ...prev, [activeSessionId]: 100 };
        });
        
        setTimeout(() => {
          setProgressStates(prev => {
            if (prev[activeSessionId] === 100) return { ...prev, [activeSessionId]: 0 };
            return prev;
          });
        }, 400);
      }, 450);
      
      return () => clearTimeout(t1);
    }
  }, [activeSessionId]);

  useEffect(() => {
    const unlisten = listen("shortcut-event", (event: any) => {
      if (event.payload.key === "k") {
        setIsPaletteOpen(true);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeSession) {
      setSearchValue(activeSession.url === "about:blank" ? "" : activeSession.url);
    } else {
      setSearchValue("");
    }
  }, [activeSessionId, activeSession?.url]);

  const handleNavigate = (url: string) => {
    if (!activeSessionId) {
      handleCreateSession(url);
      setAppView('browser');
      return;
    }

    setSessions(prev => prev.map(s => 
      s.id === activeSessionId ? { ...s, url, title: url } : s
    ));
    setSearchValue(url);
  };

  const handleCreateSession = (url: string = "") => {
    const newSession: Session = {
      id: Math.random().toString(36).substring(7),
      title: url === "" ? "New Tab" : url,
      url: url
    };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    setAppView('browser');
  };

  const handleCloseSession = (id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
      }
      return filtered;
    });
  };

  const handleGoHome = () => {
    setActiveSessionId(null);
    setSearchValue("");
    setAppView('browser');
  };

  return (
    <motion.div 
      key="app"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden font-sans"
    >
      <div className="relative z-[100]">
        <TitleBar 
          onNavigate={handleNavigate} 
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          activeSessionId={activeSessionId}
        />
        {/* Chrome-like Loading Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-transparent overflow-hidden z-50">
          <AnimatePresence>
            {(activeSessionId && (progressStates[activeSessionId] || 0) > 0) && (
              <motion.div 
                initial={{ width: '0%', opacity: 1 }}
                animate={{ 
                  width: `${progressStates[activeSessionId]}%`, 
                  opacity: progressStates[activeSessionId] === 100 ? 0 : 1 
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute left-0 top-0 h-full bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]"
              />
            )}
          </AnimatePresence>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="relative z-[100]">
          <Sidebar 
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionSelect={(id) => {
              setActiveSessionId(id);
              setAppView('browser');
            }}
            onSessionClose={handleCloseSession}
            onNewSession={() => handleCreateSession()}
            onHomeClick={handleGoHome}
            onSearchClick={() => setIsPaletteOpen(true)}
            onSettingsClick={() => setAppView('settings')}
            onConsoleClick={() => setAppView('console')}
            onDownloadsClick={() => setAppView('downloads')}
            activeView={appView}
            isDownloading={isDownloading}
          />
        </div>
        
        <main className="flex-1 relative overflow-hidden bg-[#0a0a0a] z-0">
          
          {/* 1. Viewport: Native Webview container (Always mounted) */}
          <div className={`absolute inset-0 z-0 ${appView === 'browser' ? 'visible' : 'invisible pointer-events-none'}`}>
            <Viewport 
              sessions={sessions}
              activeSessionId={activeSessionId}
              isPaletteOpen={isPaletteOpen}
              appView={appView}
            />
          </div>

          {/* 2. OVERLAY LAYER: Strictly mutually exclusive rendering */}
          <div className="absolute inset-0 z-10">
            {(() => {
              if (appView === 'settings') {
                return (
                  <div className="absolute inset-0 z-20 bg-[#0a0a0a]">
                    <Settings />
                  </div>
                );
              }
              
              if (appView === 'console') {
                return (
                  <div className="absolute inset-0 z-20 bg-[#0a0a0a]">
                    <Console />
                  </div>
                );
              }

              if (appView === 'downloads') {
                return (
                  <div className="absolute inset-0 z-20 bg-[#0a0a0a]">
                    <Downloads />
                  </div>
                );
              }

              if (appView === 'browser') {
                const isHomeVisible = !activeSessionId || (activeSession && activeSession.url === "");
                if (isHomeVisible) {
                  return (
                    <div className="absolute inset-0 z-20 bg-[#0a0a0a]">
                      <Home onNavigate={handleNavigate} />
                    </div>
                  );
                }
              }

              return null;
            })()}
          </div>
        </main>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-16 right-4 z-[999] bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-white/10 shadow-lg rounded-xl p-4 flex items-center gap-4"
          >
            <div className="p-2 bg-accent/10 text-accent rounded-lg">
              <Download size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">{toastMessage.title}</div>
              <div className="text-xs text-neutral-500 max-w-[200px] truncate">{toastMessage.desc}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <StatusBar />
      <CommandPalette 
        isOpen={isPaletteOpen} 
        onClose={() => setIsPaletteOpen(false)} 
        onNavigate={handleNavigate} 
      />
    </motion.div>
  );
}