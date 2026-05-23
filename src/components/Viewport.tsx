import { useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../lib/utils";

interface Session {
  id: string;
  title: string;
  url: string;
}

export const Viewport = ({ 
  sessions, 
  activeSessionId, 
  isPaletteOpen,
  appView
}: { 
  sessions: Session[], 
  activeSessionId: string | null,
  isPaletteOpen: boolean,
  appView: 'browser' | 'settings' | 'console' | 'downloads' | 'tabs'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedWebviews = useRef<Set<string>>(new Set());

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const showLoading = activeSession && activeSession.url !== "" && !initializedWebviews.current.has(activeSessionId!);

  // NEW: Detect theme changes and push to Native Webviews
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          const theme = isDark ? 'dark' : 'light';
          
          // Inject the new theme into every open session immediately
          sessions.forEach(session => {
            invoke('set_webview_theme', { label: session.id, theme })
              .catch((e) => console.warn("Theme Sync Error:", e));
          });
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [sessions]);

  // 1. Manage Lifecycle (Open/Close only)
  useEffect(() => {
    const manageLifecycle = async () => {
      try {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();

        for (const session of sessions) {
          const hasBeenInitialized = initializedWebviews.current.has(session.id);

          if (session.url === "") {
            if (hasBeenInitialized) {
              await invoke("close_webview", { label: session.id }).catch((e) => console.warn("Close Error:", e));
              initializedWebviews.current.delete(session.id);
            }
            continue;
          }

          if (!hasBeenInitialized) {
            let targetUrl = session.url;
            const isUrl = targetUrl.includes(".") && !targetUrl.includes(" ");
            if (!targetUrl.startsWith("http") && isUrl) targetUrl = `https://${targetUrl}`;
            if (!isUrl) targetUrl = `https://google.com/search?q=${encodeURIComponent(targetUrl)}`;

            // Get current app theme for initial load
            const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

            try {
              await invoke("open_webview", {
                label: session.id,
                url: targetUrl,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                theme: currentTheme, // NEW: Send theme on startup
              }).catch((e) => console.warn("Open Error:", e));
              initializedWebviews.current.add(session.id);
            } catch (e) {}
          }
        }

        // CLEANUP: Close webviews for sessions that no longer exist
        const currentIds = new Set(sessions.map(s => s.id));
        for (const id of Array.from(initializedWebviews.current)) {
          if (!currentIds.has(id)) {
            await invoke("close_webview", { label: id }).catch((e) => console.warn("Cleanup Error:", e));
            initializedWebviews.current.delete(id);
          }
        }
      } catch (err) {
        console.error("Critical Native Lifecycle Error:", err);
      }
    };

    manageLifecycle();
  }, [sessions]);

  // 2. Absolute Failsafe Bounds Sync with ResizeObserver
  useEffect(() => {
    let frameId: number;
    let isSyncing = false;

    const syncBounds = async () => {
      if (isSyncing) return;
      isSyncing = true;
      
      try {
        if (!containerRef.current) {
          isSyncing = false;
          return;
        }
        
        const rect = containerRef.current.getBoundingClientRect();

        if (appView === 'settings' || appView === 'console' || appView === 'downloads' || appView === 'tabs') {
          for (const label of initializedWebviews.current) {
            await invoke("set_webview_bounds", { 
              label, 
              x: -10000, 
              y: -10000, 
              width: 100, 
              height: 100 
            }).catch((e) => console.warn("Hide Error:", e));
          }
          isSyncing = false;
          return;
        }

        for (const session of sessions) {
          const isCurrentlyActive = session.id === activeSessionId && !isPaletteOpen && appView === 'browser';
          
          if (isCurrentlyActive) {
            if (rect.width === 0 || rect.height === 0) {
              isSyncing = false;
              frameId = requestAnimationFrame(syncBounds);
              return;
            }

            await invoke("set_webview_bounds", {
              label: session.id,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }).catch((e) => console.warn("Bounds Sync Error:", e));
          } else {
            await invoke("set_webview_bounds", {
              label: session.id,
              x: -10000,
              y: -10000,
              width: 100,
              height: 100,
            }).catch((e) => console.warn("Background Hide Error:", e));
          }
        }
      } catch (err) {
        console.error("Critical Native Sync Error:", err);
      }
      
      isSyncing = false;
    };

    const observer = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        syncBounds();
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    syncBounds();

    return () => {
      observer.disconnect();
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [sessions, activeSessionId, isPaletteOpen, appView]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none z-0"
    >
      {showLoading && (
        <div className="flex flex-col items-center gap-4 text-neutral-800 dark:text-neutral-200 pointer-events-auto">
          <div className="w-8 h-8 border-2 border-neutral-200 dark:border-white/5 border-t-accent rounded-full animate-spin" />
          <p className="text-[10px] font-mono uppercase tracking-[0.2em]">
            Initializing...
          </p>
        </div>
      )}
    </div>
  );
};