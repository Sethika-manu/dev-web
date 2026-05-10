import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { Viewport } from "./components/Viewport";
import { Home } from "./components/Home";
import { Settings } from "./components/Settings";
import { Console } from "./components/Console";
import { listen } from "@tauri-apps/api/event";

interface Session {
  id: string;
  title: string;
  url: string;
}

const LAUNCH_DATE = new Date('2026-05-11T00:00:00').getTime();

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [appView, setAppView] = useState<'browser' | 'settings' | 'console'>('browser');
  
  // Lock screen state
  const [isLocked, setIsLocked] = useState(true);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  const activeSession = sessions.find(s => s.id === activeSessionId);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const distance = LAUNCH_DATE - now;

      if (distance <= 0) {
        setIsLocked(false);
        return null;
      }

      return {
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      };
    };

    // Initial check
    const initial = calculateTimeLeft();
    if (initial) {
      setTimeLeft(initial);
      setIsLocked(true);
    } else {
      setIsLocked(false);
    }

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      if (!remaining) {
        clearInterval(timer);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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
    <AnimatePresence mode="wait">
      {isLocked ? (
        <motion.div 
          key="lockscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: "blur(20px)" }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center text-white z-[9999] overflow-hidden"
        >
          {/* Background Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] blur-[120px] rounded-full pointer-events-none" />
          
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="flex flex-col items-center gap-12 relative z-10"
          >
            {/* Logo/Branding */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 flex items-center justify-center mb-4 shadow-2xl">
                <span className="text-4xl font-bold bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">RC</span>
              </div>
              <h1 className="text-5xl font-light tracking-[0.2em] uppercase text-white/90">Royal Codex</h1>
              <p className="text-white/40 tracking-[0.4em] uppercase text-xs">Genesis Protocol 2.0</p>
            </div>

            {/* Countdown Grid */}
            <div className="flex gap-8 md:gap-16">
              {[
                { label: 'Days', value: timeLeft.days },
                { label: 'Hours', value: timeLeft.hours },
                { label: 'Minutes', value: timeLeft.minutes },
                { label: 'Seconds', value: timeLeft.seconds },
              ].map((item, index) => (
                <div key={item.label} className="flex flex-col items-center gap-2">
                  <div className="relative overflow-hidden w-20 md:w-28 h-24 md:h-32 flex items-center justify-center bg-[#111] border border-white/5 rounded-xl shadow-inner">
                    <motion.span 
                      key={item.value}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-4xl md:text-6xl font-mono font-medium tracking-tighter"
                    >
                      {String(item.value).padStart(2, '0')}
                    </motion.span>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-semibold">{item.label}</span>
                </div>
              ))}
            </div>

            <motion.div 
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="mt-8 flex flex-col items-center gap-2"
            >
              <div className="w-1 h-1 rounded-full bg-white/40" />
              <p className="text-[10px] uppercase tracking-[0.5em] text-white/20">System Locked until Deployment</p>
            </motion.div>
          </motion.div>

          {/* Bottom Badge */}
          <div className="absolute bottom-12 text-[10px] uppercase tracking-[0.2em] text-white/10 font-medium">
            © 2026 Royal Codex Laboratory
          </div>
        </motion.div>
      ) : (
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
                activeView={appView}
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

          <StatusBar />
          <CommandPalette 
            isOpen={isPaletteOpen} 
            onClose={() => setIsPaletteOpen(false)} 
            onNavigate={handleNavigate} 
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
