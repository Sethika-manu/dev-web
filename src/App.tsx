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
  Home as HomeIcon, 
  Terminal, 
  Settings as SettingsIcon,
  Layers,
  Copy,
  ExternalLink,
  Image as ImageIcon
} from "lucide-react";

import { logEvent } from "firebase/analytics";
import { analytics } from "./firebase";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell"; 
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface Session {
  id: string;
  title: string;
  url: string;
}

const getFileName = (path: string, url: string) => {
  if (path && path.trim() !== '') {
    const parts = path.split(/[/\\]/);
    const name = parts[parts.length - 1];
    if (name) return name;
  }
  if (url && url.trim() !== '') {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/');
      const name = parts[parts.length - 1];
      if (name) return name;
    } catch(e) {
      const parts = url.split('/');
      const name = parts[parts.length - 1];
      if (name) return name;
    }
  }
  return 'RC_Image.jpg';
};

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
  
  const [toastMessage, setToastMessage] = useState<{title: string, desc: string} | null>(null);
  const [progressStates, setProgressStates] = useState<Record<string, number>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  
  const [fallbackUpdateUrl, setFallbackUpdateUrl] = useState<string | null>(null);

  const [contextMenuData, setContextMenuData] = useState<{type: 'link' | 'image', url: string} | null>(null);

  const [activeDownloads, setActiveDownloads] = useState<any[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('rc_download_history');
    return saved ? JSON.parse(saved) : [];
  });

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
    const handleNativeContextMenu = (e: any) => {
      setContextMenuData(e.detail);
    };
    window.addEventListener('rc-native-context-menu', handleNativeContextMenu);

    const unlistenPromise = listen('download-event', (event: any) => {
      const payload = event.payload;
      const fileName = getFileName(payload.path, payload.url);

      if (payload.state === 'started') {
        setActiveDownloads(prev => {
          if (!prev.find(d => d.url === payload.url)) {
            return [...prev, payload];
          }
          return prev;
        });
        setToastMessage({ title: 'Download Started', desc: `Downloading ${fileName}...` });
      } else if (payload.state === 'finished' || payload.state === 'failed') {
        setActiveDownloads(prev => prev.filter(d => d.url !== payload.url));
      }
    });

    const handleHistoryUpdate = (e: any) => {
      const fileName = getFileName(e.detail.path, e.detail.url);
      setDownloadHistory(prev => {
        const newHistory = [e.detail, ...prev];
        localStorage.setItem('rc_download_history', JSON.stringify(newHistory));
        return newHistory;
      });
      if (e.detail.status === 'completed') {
         setToastMessage({ title: 'Success!', desc: `Image saved to Gallery!` });
      } else {
         setToastMessage({ title: 'Failed', desc: `Could not save image.` });
      }
    };

    window.addEventListener('rc-download-finished', handleHistoryUpdate);

    return () => {
      window.removeEventListener('rc-native-context-menu', handleNativeContextMenu);
      unlistenPromise.then(unlisten => unlisten());
      window.removeEventListener('rc-download-finished', handleHistoryUpdate);
    };
  }, []);

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
    const checkForUpdates = async () => {
      try {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        const isNewerVersion = (remote: string, local: string) => {
          const rParts = remote.split('.').map(Number);
          const lParts = local.split('.').map(Number);
          
          for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
            const r = rParts[i] || 0;
            const l = lParts[i] || 0;
            if (r > l) return true;
            if (r < l) return false;
          }
          return false;
        };

        if (isMobileDevice) {
          const currentVer = await getVersion();
          const response = await fetch("https://raw.githubusercontent.com/Sethika-manu/dev-web/refs/heads/main/update.json");
          const updateData = await response.json();
          
          if (isNewerVersion(updateData.version, currentVer)) {
            const apkUrl = updateData.platforms?.android?.url;
            
            if (apkUrl) {
              const wantsUpdate = await ask(
                `A new mobile version v${updateData.version} is ready to install.\n\nUpdate now to get the latest features and security patches.`,
                { title: 'Update Available', kind: 'info', okLabel: 'Update Now', cancelLabel: 'Ignore' }
              );

              if (wantsUpdate) {
                setToastMessage({ title: 'Opening Download...', desc: 'Please check your browser to download the APK.' });
                try {
                  await open(apkUrl);
                } catch (err) {
                  // 🚨 මෙන්න ඊයේ අපි හදපු ලස්සන Fallback UI එකට Data පාස් කරන තැන 🚨
                  setFallbackUpdateUrl(apkUrl);
                }
              }
            }
          }
        } else {
          const update = await check();
          if (update && update.available) {
            const isAutoUpdate = localStorage.getItem('rcbrowser_autoupdate') === 'true';
            if (isAutoUpdate) {
              await update.downloadAndInstall();
              await relaunch();
            } else {
              const wantsUpdate = await ask(
                `A new version v${update.version} is ready to install.\n\nUpdate now to get the latest features and security patches.`,
                { title: 'Update Available', kind: 'info', okLabel: 'Update Now', cancelLabel: 'Ignore' }
              );

              if (wantsUpdate) {
                setIsUpdating(true);
                setToastMessage({ title: 'Updating...', desc: 'Downloading and installing the update.' });
                try {
                  await update.downloadAndInstall();
                  await relaunch();
                } catch (e) {
                  setIsUpdating(false);
                }
              }
            }
          }
        }
      } catch (error) {}
    };
    
    checkForUpdates();
  }, []);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

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

  const closeContextMenu = () => {
    setContextMenuData(null);
    if (isMobile) {
      const win = window as any;
      if (win.NativeBridge) {
        win.NativeBridge.hideContextMenu();
      } else if (win.AndroidBridge) {
        win.AndroidBridge.hideContextMenu();
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
        className="w-full bg-white dark:bg-gray-900 border-b border-neutral-200 dark:border-white/5 flex-shrink-0 relative flex flex-col z-[50]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <TitleBar 
          onNavigate={handleNavigate} 
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          activeSessionId={activeSessionId}
        />

        <AnimatePresence>
          {(toastMessage && !isMobile) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              onUpdate={() => window.dispatchEvent(new Event('resize'))}
              onAnimationComplete={() => window.dispatchEvent(new Event('resize'))}
              className="w-full overflow-hidden flex-shrink-0 pointer-events-auto"
            >
              <div className="relative z-[99999] flex items-center justify-between w-full py-2.5 px-4 bg-accent text-white shadow-md">
                <div className="flex items-center gap-2 md:gap-3 overflow-hidden w-full mr-2">
                  {(() => {
                    const title = toastMessage.title.toLowerCase();
                    if (title.includes('success')) {
                      return (
                        <div className="bg-emerald-500/20 text-emerald-300 p-1 md:p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center border border-emerald-500/30">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </div>
                      );
                    }
                    if (title.includes('fail') || title.includes('error')) {
                      return (
                        <div className="bg-rose-500/20 text-rose-300 p-1 md:p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center border border-rose-500/30">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        </div>
                      );
                    }
                    if (title.includes('copy')) {
                      return (
                        <div className="bg-amber-500/20 text-amber-300 p-1 md:p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center border border-amber-500/30">
                          <Copy size={14} />
                        </div>
                      );
                    }
                    return (
                      <div className="bg-blue-500/20 text-blue-300 p-1 md:p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center border border-blue-500/30">
                        <Download size={14} className="animate-bounce" />
                      </div>
                    );
                  })()}
                  <div className="flex flex-col md:flex-row md:items-baseline gap-0.5 md:gap-2 overflow-hidden text-[11px] md:text-sm">
                    <span className="font-bold text-white tracking-wide flex-shrink-0">{toastMessage.title}</span>
                    <span className="text-white/80 truncate font-medium text-[10px] md:text-xs">{toastMessage.desc}</span>
                  </div>
                </div>

                <button 
                  onClick={() => setToastMessage(null)}
                  className="p-1 rounded-lg text-white/85 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer pointer-events-auto"
                  aria-label="Close notification"
                >
                  <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            isDownloading={activeDownloads.length > 0} 
          />
        </div>
        
        <main className="flex-1 relative overflow-hidden bg-transparent z-0 transition-colors duration-200">
          <div className={`absolute inset-0 z-0 ${appView === 'browser' ? 'visible' : 'invisible pointer-events-none'}`}>
            <Viewport sessions={sessions} activeSessionId={activeSessionId} isPaletteOpen={isPaletteOpen} appView={appView} />
          </div>

          <div className="absolute inset-0 z-10 pointer-events-none">
            {(() => {
              if (appView === 'settings') return <div className="absolute inset-0 z-20 bg-white dark:bg-[#0a0a0a] pointer-events-auto"><Settings /></div>;
              if (appView === 'console') return <div className="absolute inset-0 z-20 bg-white dark:bg-[#0a0a0a] pointer-events-auto"><Console /></div>;
              if (appView === 'downloads') return (
                <div className="absolute inset-0 z-20 bg-white dark:bg-[#0a0a0a] pointer-events-auto">
                  <Downloads activeDownloads={activeDownloads} history={downloadHistory} clearHistory={() => { setDownloadHistory([]); localStorage.removeItem('rc_download_history'); }} />
                </div>
              );
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
                          <div key={session.id} onClick={() => { setActiveSessionId(session.id); setAppView('browser'); }} className={`relative p-4 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all ${activeSessionId === session.id ? 'bg-white dark:bg-neutral-900 border-2 border-accent shadow-md' : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm'} pointer-events-auto`}>
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
        {contextMenuData && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="absolute inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto p-4"
            onClick={closeContextMenu} 
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-[#121212] rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-neutral-200 dark:border-neutral-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6 bg-neutral-50 dark:bg-neutral-900 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <div className="p-2 bg-accent/10 rounded-lg text-accent flex-shrink-0">
                  {contextMenuData.type === 'image' ? <ImageIcon size={20} /> : <ExternalLink size={20} />}
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 w-full break-all line-clamp-3">
                  {contextMenuData.url}
                </p>
              </div>
              
              <div className="flex flex-col gap-3">
                {contextMenuData.type === 'link' && (
                  <button 
                    onClick={() => {
                      handleCreateSession(contextMenuData.url);
                      closeContextMenu(); 
                    }} 
                    className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-accent hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={16} /> Open in New Tab
                  </button>
                )}
                
                {contextMenuData.type === 'image' && (
                  <button 
                    onClick={async () => {
                      setToastMessage({ title: 'Downloading...', desc: 'Please wait...' });
                      const win = window as any;
                      if (win.NativeBridge) {
                        win.NativeBridge.downloadImage(contextMenuData.url);
                      } else if (win.AndroidBridge) {
                        win.AndroidBridge.downloadImage(contextMenuData.url);
                      } else {
                        try { await invoke("trigger_download", { label: activeSessionId || "main", url: contextMenuData.url }); } catch(e){}
                      }
                      closeContextMenu(); 
                    }} 
                    className="w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-accent hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
                  >
                    <Download size={16} /> Download Image
                  </button>
                )}
                
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenuData.url);
                    setToastMessage({ title: 'Copied!', desc: 'Link copied to clipboard.' });
                    closeContextMenu(); 
                  }} 
                  className="w-full py-3.5 rounded-xl text-sm font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 border border-transparent dark:border-white/5"
                >
                  <Copy size={16} /> Copy {contextMenuData.type === 'image' ? 'Image ' : ''}Link
                </button>
                
                <button 
                  onClick={closeContextMenu} 
                  className="w-full py-3.5 rounded-xl text-sm font-bold text-red-500 hover:text-white bg-red-500/10 hover:bg-red-500 transition-colors mt-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fallbackUpdateUrl && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="absolute inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-neutral-200 dark:border-neutral-800"
            >
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">Update Required</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Auto-download blocked by device. Copy the link below and open it in Chrome to install the update.
              </p>
              <div className="bg-neutral-100 dark:bg-neutral-900 p-3 rounded-xl flex items-center gap-2 mb-6 border border-neutral-200 dark:border-neutral-800">
                <input 
                  type="text" 
                  readOnly 
                  value={fallbackUpdateUrl} 
                  className="bg-transparent border-none outline-none text-xs text-neutral-700 dark:text-neutral-300 w-full"
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setFallbackUpdateUrl(null)} 
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(fallbackUpdateUrl);
                    setToastMessage({ title: 'Copied!', desc: 'Link copied to clipboard.' });
                  }} 
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-accent hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                >
                  Copy Link
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Footer Section */}
      <div id="bottom-bar-container" className="flex-shrink-0 w-full z-[99999] relative bg-white dark:bg-gray-900 border-t border-neutral-200 dark:border-neutral-800/80">
        <AnimatePresence>
          {(toastMessage && isMobile) && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute inset-0 z-[999999] flex items-center justify-between px-4 bg-[#2563eb] text-white pointer-events-auto"
            >
              <div className="flex items-center gap-2 overflow-hidden w-full mr-2">
                {(() => {
                  const title = toastMessage.title.toLowerCase();
                  if (title.includes('success')) {
                    return (
                      <div className="bg-emerald-500/20 text-emerald-300 p-1 rounded-lg flex-shrink-0 flex items-center justify-center border border-emerald-500/30">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                      </div>
                    );
                  }
                  if (title.includes('fail') || title.includes('error')) {
                    return (
                      <div className="bg-rose-500/20 text-rose-300 p-1 rounded-lg flex-shrink-0 flex items-center justify-center border border-rose-500/30">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      </div>
                    );
                  }
                  if (title.includes('copy')) {
                    return (
                      <div className="bg-amber-500/20 text-amber-300 p-1 rounded-lg flex-shrink-0 flex items-center justify-center border border-amber-500/30">
                        <Copy size={14} />
                      </div>
                    );
                  }
                  return (
                    <div className="bg-blue-500/20 text-blue-300 p-1 rounded-lg flex-shrink-0 flex items-center justify-center border border-blue-500/30">
                      <Download size={14} className="animate-bounce" />
                    </div>
                  );
                })()}
                <div className="flex flex-col gap-0.5 overflow-hidden text-[11px]">
                  <span className="font-bold text-white tracking-wide flex-shrink-0">{toastMessage.title}</span>
                  <span className="text-white/80 truncate font-medium text-[10px]">{toastMessage.desc}</span>
                </div>
              </div>

              <button 
                onClick={() => setToastMessage(null)}
                className="p-1 rounded-lg text-white/85 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 cursor-pointer pointer-events-auto"
                aria-label="Close notification"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <nav 
          className="md:hidden w-full h-[110px] bg-white dark:bg-gray-900 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom,0px)]"
        >
          <button onClick={handleGoHome} className="flex flex-col items-center justify-center w-full h-full text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
            <HomeIcon size={20} className="mb-1" /><span>Home</span>
          </button>
          <button onClick={() => handleNavClick('tabs')} className="flex flex-col items-center justify-center w-full h-full text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors relative">
            <div className="relative mb-1">
              <Layers size={20} />
              {sessions.length > 0 && <span className="absolute -top-1.5 -right-2 bg-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white dark:border-[#0c0c0c]">{sessions.length}</span>}
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