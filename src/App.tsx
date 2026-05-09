import { useState, useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { Viewport } from "./components/Viewport";
import { Home } from "./components/Home";
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
              <Home onNavigate={handleNavigate} />
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
