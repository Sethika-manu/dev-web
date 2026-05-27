import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { Viewport } from "./components/Viewport";

// Components
import { Home } from "./components/Home"; 
import { Settings } from "./components/Settings";
import { Console } from "./components/Console";
import { Downloads } from "./components/Downloads";

// Lucide Icons
import { 
  Download, 
  RefreshCw, 
  Home as HomeIcon, 
  Terminal, 
  Settings as SettingsIcon,
  Layers 
} from "lucide-react";

import { logEvent } from "firebase/analytics";
import { analytics } from "./firebase";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";

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
  const [appView, setAppView] = useState<'browser' | 'settings' | 'console' | 'downloads' | 'tabs'>('browser');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string, desc: string} | null>(null);
  const [progressStates, setProgressStates] = useState<Record<string, number>>({});
  const [isUpdating, setIsUpdating] = useState(false);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(checkMobile);
  }, []);

  const sessionsRef = useRef(sessions);
  const activeSessionIdRef = useRef(activeSessionId);
  const lastLoadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    if (isMobile) {
      (window as any).onNativeUrlChanged = (url: string) => {
        const currentActiveId = activeSessionIdRef.current;
        if (currentActiveId) {
          lastLoadedUrlRef.current = url;
          setSessions(prev => prev.map(s => s.id === currentActiveId ? { ...s, url, title: (url === "about:blank" || url === "") ? "New Tab" : url } : s));
          setSearchValue(url === "about:blank" ? "" : url);
        }
      };
    }
    return () => {
      delete (window as any).onNativeUrlChanged;
    };
  }, [isMobile]);

  const lastActiveId = useRef<string | null>(null);
  useEffect(() => {
    const syncTabSwitch = async () => {
      if (isMobile && activeSessionId && activeSessionId !== lastActiveId.current) {
        lastActiveId.current = activeSessionId;
        const active = sessionsRef.current.find(s => s.id === activeSessionId);
        if (active && active.url && active.url !== "about:blank" && active.url !== "") {
          if (lastLoadedUrlRef.current !== active.url) {
            lastLoadedUrlRef.current = active.url;
            const win = window as any;
            if (win.NativeBridge || win.AndroidBridge) {
              (win.NativeBridge || win.AndroidBridge).loadNativeUrl(active.url);
            }
          }
        } else {
            const win = window as any;
            if (win.NativeBridge || win.AndroidBridge) {
              (win.NativeBridge || win.AndroidBridge).loadNativeUrl("");
            }
        }
      }
    };
    syncTabSwitch();
  }, [activeSessionId, isMobile]);

  useEffect(() => {
    try {
      if (analytics) {
        logEvent(analytics, 'app_open');
      }
    } catch (e) {
      console.warn("Analytics not configured yet");
    }

    const checkForUpdates = async () => {
      try {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobileDevice) {
          // --- MOBILE CUSTOM UPDATER ---
          const currentVer = await getVersion();
          
          // ඔයාගේ GitHub Raw Link එක මෙතන තියෙනවා
          const response = await fetch("https://raw.githubusercontent.com/Sethika-manu/dev-web/refs/heads/main/update.json");
          const updateData = await response.json();
          
          if (updateData.version !== currentVer) {
            const apkUrl = updateData.platforms?.android?.url;
            
            if (apkUrl) {
              const wantsUpdate = await ask(
                `A new mobile version v${updateData.version} is ready to install.\n\nUpdate now to get the latest features and security patches.`,
                {
                  title: 'Update Available',
                  kind: 'info',
                  okLabel: 'Update Now',
                  cancelLabel: 'Ignore'
                }
              );

              if (wantsUpdate) {
                setToastMessage({ title: 'Downloading Update...', desc: 'Please check your notification panel.' });
                
                const win = window as any;
                if (win.NativeBridge || win.AndroidBridge) {
                  (win.NativeBridge || win.AndroidBridge).updateApp(apkUrl);
                }
              }
            }
          }
        } else {
          // --- PC UPDATER ---
          const update = await check();
          if (update && update.available) {
            const isAutoUpdate = localStorage.getItem('rcbrowser_autoupdate') === 'true';
            if (isAutoUpdate) {
              await update.downloadAndInstall();
              await relaunch();
            } else {
              const wantsUpdate = await ask(
                `A new version v${update.version} is ready to install.\n\nUpdate now to get the latest features and security patches.`,
                {
                  title: 'Update Available',
                  kind: 'info',
                  okLabel: 'Update Now',
                  cancelLabel: 'Ignore'
                }
              );

              if (wantsUpdate) {
                setIsUpdating(true);
                setToastMessage({ title: 'Updating...', desc: 'Downloading and installing the update.' });
                try {
                  await update.downloadAndInstall();
                  await relaunch();
                } catch (e) {
                  console.error("Failed to download update:", e);
                  setIsUpdating(false);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    };
    
    checkForUpdates();
  }, []);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") setIsPaletteOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeSession) {
      setSearchValue((activeSession.url === "about:blank" || activeSession.url === "") ? "" : activeSession.url);
    } else {
      setSearchValue("");
    }
  }, [activeSessionId, activeSession?.url]);

  const handleNavigate = async (url: string) => {
    if (!activeSessionId) {
      handleCreateSession(url);
      setAppView('browser');
      return;
    }
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, url, title: (url === "about:blank" || url === "") ? "New Tab" : url } : s));
    setSearchValue(url);

    if (isMobile) {
      if (lastLoadedUrlRef.current !== url) {
        lastLoadedUrlRef.current = url;
        const win = window as any;
        if (win.NativeBridge || win.AndroidBridge) {
          (win.NativeBridge || win.AndroidBridge).loadNativeUrl(url);
        }
      }
    }
  };

  const handleCreateSession = async (url: string = "") => {
    const newSession: Session = {
      id: Math.random().toString(36).substring(7),
      title: (url === "" || url === "about:blank") ? "New Tab" : url,
      url: url
    };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    setAppView('browser');

    if (isMobile && url !== "") {
      if (lastLoadedUrlRef.current !== url) {
        lastLoadedUrlRef.current = url;
        const win = window as any;
        if (win.NativeBridge || win.AndroidBridge) {
          (win.NativeBridge || win.AndroidBridge).loadNativeUrl(url);
        }
      }
    }
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
    if (isMobile) {
      const win = window as any;
      if (win.NativeBridge || win.AndroidBridge) {
        (win.NativeBridge || win.AndroidBridge).loadNativeUrl("");
      }
    }
  };

  const handleNavClick = (view: 'settings' | 'console' | 'downloads' | 'tabs') => {
    setAppView(view);
    if (isMobile) {
      const win = window as any;
      if (win.NativeBridge || win.AndroidBridge) {
        (win.NativeBridge || win.AndroidBridge).loadNativeUrl("");
      }
    }
  };

  return (
    <motion.div 
      key="app"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className={`flex flex-col h-screen text-neutral-900 dark:text-white overflow-hidden font-sans transition-colors duration-200 ${appView === 'browser' && activeSessionId ? 'bg-transparent' : 'bg-white dark:bg-[#0a0a0a]'}`}
    >
      <div 
        id="top-bar-container"
        className="w-full bg-gray-900 dark:bg-gray-900 border-b border-white/5 flex-shrink-0 relative"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)"
        }}
      >
        <TitleBar 
          onNavigate={handleNavigate} 
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          activeSessionId={activeSessionId}
        />
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-transparent overflow-hidden z-50">
          <AnimatePresence>
            {(activeSessionId && (progressStates[activeSessionId] || 0) > 0) && (
              <motion.div 
                initial={{ width: '0%', opacity: 1 }}
                animate={{ width: `${progressStates[activeSessionId]}%`, opacity: progressStates[activeSessionId] === 100 ? 0 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute left-0 top-0 h-full bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.8)]"
              />
            )}
          </AnimatePresence>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden relative">
        <div className="relative z-[100] hidden md:block">
          <Sidebar 
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionSelect={(id) => { setActiveSessionId(id); setAppView('browser'); }}
            onSessionClose={handleCloseSession}
            onNewSession={() => handleCreateSession()}
            onHomeClick={handleGoHome}
            onSearchClick={() => setIsPaletteOpen(true)}
            onSettingsClick={() => handleNavClick('settings')}
            onConsoleClick={() => handleNavClick('console')}
            onDownloadsClick={() => handleNavClick('downloads')}
            activeView={appView}
            isDownloading={isDownloading}
          />
        </div>
        
        <main 
          className="flex-1 relative overflow-hidden bg-transparent z-0 transition-colors duration-200"
        >
          <div className={`absolute inset-0 z-0 ${appView === 'browser' ? 'visible' : 'invisible pointer-events-none'}`}>
            <Viewport sessions={sessions} activeSessionId={activeSessionId} isPaletteOpen={isPaletteOpen} appView={appView} />
          </div>

          <div className="absolute inset-0 z-10 pointer-events-none">
            {(() => {
              if (appView === 'settings') return <div className="absolute inset-0 z-20 bg-white dark:bg-[#0a0a0a] pointer-events-auto"><Settings /></div>;
              if (appView === 'console') return <div className="absolute inset-0 z-20 bg-white dark:bg-[#0a0a0a] pointer-events-auto"><Console /></div>;
              if (appView === 'downloads') return <div className="absolute inset-0 z-20 bg-white dark:bg-[#0a0a0a] pointer-events-auto"><Downloads /></div>;
              if (appView === 'browser') {
                const isHomeVisible = !activeSessionId || (activeSession && (activeSession.url === "" || activeSession.url === "about:blank"));
                if (isHomeVisible) return <div className="absolute inset-0 z-20 bg-white dark:bg-[#0a0a0a] pointer-events-auto"><Home onNavigate={handleNavigate} /></div>;
              }
              if (appView === 'tabs') {
                return (
                  <div className="absolute inset-0 z-20 bg-neutral-50 dark:bg-[#0a0a0a] overflow-y-auto p-4 pb-20 pointer-events-auto">
                    <div className="flex justify-between items-center mb-6 mt-2 px-1">
                      <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Open Tabs</h2>
                      <button onClick={() => handleCreateSession("")} className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg transition-all active:scale-95 pointer-events-auto">+ New Tab</button>
                    </div>
                    {sessions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-neutral-400 dark:text-neutral-500 pointer-events-auto">
                        <Layers size={40} className="mb-3 opacity-50" />
                        <p>No tabs open</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 pointer-events-auto">
                        {sessions.map(session => (
                          <div 
                            key={session.id} 
                            onClick={() => { setActiveSessionId(session.id); setAppView('browser'); }}
                            className={`relative p-4 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all ${activeSessionId === session.id ? 'bg-white dark:bg-neutral-900 border-2 border-accent shadow-md' : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm'} pointer-events-auto`}
                          >
                            <div className="flex justify-between items-start pointer-events-auto">
                              <span className="text-sm font-semibold text-neutral-900 dark:text-white truncate pr-6 pointer-events-auto">{session.title || 'New Tab'}</span>
                              <button onClick={(e) => { e.stopPropagation(); handleCloseSession(session.id); }} className="absolute top-3 right-3 text-neutral-400 hover:text-red-500 bg-neutral-100 dark:bg-neutral-800 rounded-full p-1 shadow-sm transition-colors pointer-events-auto">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-auto"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              </button>
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate pointer-events-auto">{session.url || 'about:blank'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}
          </div>
          
        </main>
      </div>

      <AnimatePresence>
        {toastMessage && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute bottom-24 md:bottom-16 right-4 z-[999] bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-white/10 shadow-lg rounded-xl p-4 flex items-center gap-4">
            <div className="p-2 bg-accent/10 text-accent rounded-lg"><Download size={16} /></div>
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">{toastMessage.title}</div>
              <div className="text-xs text-neutral-500 max-w-[200px] truncate">{toastMessage.desc}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Footer Section */}
      <div id="bottom-bar-container" className="flex-shrink-0 w-full z-[99999] relative bg-gray-900 dark:bg-gray-900">
        <nav 
          className="md:hidden w-full h-[calc(68px+env(safe-area-inset-bottom,0px))] bg-gray-900 dark:bg-gray-900 border-t border-neutral-200 dark:border-neutral-800/80 flex items-center justify-around px-2"
          style={{
            paddingBottom: "env(safe-area-inset-bottom, 0px)"
          }}
        >
          <button onClick={handleGoHome} className="flex flex-col items-center justify-center w-full h-full text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
            <HomeIcon size={20} className="mb-1" /><span>Home</span>
          </button>
          <button onClick={() => handleNavClick('tabs')} className="flex flex-col items-center justify-center w-full h-full text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors relative">
            <div className="relative mb-1">
              <Layers size={20} />
              {sessions.length > 0 && <span className="absolute -top-1.5 -right-2 bg-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-[#0c0c0c] dark:border-[#0c0c0c]">{sessions.length}</span>}
            </div>
            <span>Tabs</span>
          </button>
          <button onClick={() => handleNavClick('downloads')} className="flex flex-col items-center justify-center w-full h-full text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
            <Download size={20} className="mb-1" /><span>Downloads</span>
          </button>
          <button onClick={() => handleNavClick('console')} className="flex flex-col items-center justify-center w-full h-full text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors mobile-nav-console">
            <Terminal size={20} className="mb-1" /><span>Console</span>
          </button>
          <button onClick={() => handleNavClick('settings')} className="flex flex-col items-center justify-center w-full h-full text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
            <SettingsIcon size={20} className="mb-1" /><span>Settings</span>
          </button>
        </nav>
        <div className="hidden md:block">
          <StatusBar />
        </div>
      </div>
      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} onNavigate={handleNavigate} />
    </motion.div>
  );
}