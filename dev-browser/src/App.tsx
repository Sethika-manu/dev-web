import { useState, useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { Viewport } from "./components/Viewport";
import { motion, AnimatePresence } from "framer-motion";
import { listen } from "@tauri-apps/api/event";

interface Session {
  id: string;
  title: string;
  url: string;
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const activeSession = sessions.find(s => s.id === activeSessionId);

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
    // Sync search bar when active session changes
    if (activeSession) {
      setSearchValue(activeSession.url === "about:blank" ? "" : activeSession.url);
    } else {
      setSearchValue("");
    }
  }, [activeSessionId, activeSession?.url]);

  const handleNavigate = (url: string) => {
    if (!activeSessionId) {
      // If no active session, create one
      handleCreateSession(url);
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
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-foreground overflow-hidden font-sans">
      <TitleBar 
        onNavigate={handleNavigate} 
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        activeSessionId={activeSessionId}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={setActiveSessionId}
          onSessionClose={handleCloseSession}
          onNewSession={() => handleCreateSession()}
          onHomeClick={handleGoHome}
          onSearchClick={() => setIsPaletteOpen(true)}
        />
        
        <main className="flex-1 relative overflow-hidden bg-[#050505]">
          <AnimatePresence mode="wait">
            {(!activeSessionId || (activeSession && activeSession.url === "")) ? (
              <motion.div 
                key="home"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="absolute inset-0 flex items-center justify-center p-8 z-20 bg-[#050505]"
              >
                <div className="text-center space-y-6 max-w-md">
                  <div className="w-20 h-20 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center mx-auto shadow-2xl shadow-accent/5">
                    <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center text-white font-bold text-xl">
                      D
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">Ready for Exploration</h1>
                    <p className="text-neutral-500 text-sm leading-relaxed">
                      Create a new session or search to start browsing.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4">
                    <div 
                      onClick={() => handleNavigate("https://wikipedia.org")}
                      className="p-4 rounded-xl bg-neutral-900/50 border border-border text-left hover:border-accent/30 transition-colors cursor-pointer group"
                    >
                      <div className="text-[10px] font-bold text-accent mb-1 uppercase tracking-widest">Documentation</div>
                      <div className="text-sm font-medium text-neutral-300 group-hover:text-white">Wikipedia</div>
                    </div>
                    <div 
                      onClick={() => handleNavigate("https://youtube.com")}
                      className="p-4 rounded-xl bg-neutral-900/50 border border-border text-left hover:border-accent/30 transition-colors cursor-pointer group"
                    >
                      <div className="text-[10px] font-bold text-emerald-500 mb-1 uppercase tracking-widest">Multimedia</div>
                      <div className="text-sm font-medium text-neutral-300 group-hover:text-white">YouTube</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* The centralized WebviewManager handles all native instances */}
          <Viewport 
            sessions={sessions}
            activeSessionId={activeSessionId}
            isPaletteOpen={isPaletteOpen}
          />
          
          <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-border/50 pointer-events-none" />
        </main>
      </div>

      <StatusBar />
      <CommandPalette 
        isOpen={isPaletteOpen} 
        onClose={() => setIsPaletteOpen(false)} 
        onNavigate={handleNavigate} 
      />
    </div>
  );
}

export default App;
