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
  appView: 'browser' | 'settings' | 'console' | 'downloads'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedWebviews = useRef<Set<string>>(new Set());

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const showLoading = activeSession && activeSession.url !== "" && !initializedWebviews.current.has(activeSessionId!);

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

            try {
              await invoke("open_webview", {
                label: session.id,
                url: targetUrl,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
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
        
        // Use getBoundingClientRect for absolute window coordinates
        const rect = containerRef.current.getBoundingClientRect();

        // IF APP IS IN SETTINGS/CONSOLE/DOWNLOADS: Move webviews off-screen immediately
        if (appView === 'settings' || appView === 'console' || appView === 'downloads') {
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

        // IF IN BROWSER MODE: Sync active session or move off-screen
        for (const session of sessions) {
          const isCurrentlyActive = session.id === activeSessionId && !isPaletteOpen && appView === 'browser';
          
          if (isCurrentlyActive) {
            // FAILSAFE: If dimensions are 0, retry in next frame to handle React transitions
            if (rect.width === 0 || rect.height === 0) {
              isSyncing = false;
              frameId = requestAnimationFrame(syncBounds);
              return;
            }

            // Await is REQUIRED here to prevent flooding the Tauri IPC channel (which causes black screens/crashes)
            await invoke("set_webview_bounds", {
              label: session.id,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }).catch((e) => console.warn("Bounds Sync Error:", e));
          } else {
            // Off-screen for non-active sessions
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
      // Trigger sync whenever the container size changes
      if (entries.length > 0) {
        syncBounds();
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Trigger initial sync for view state changes
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
        <div className="flex flex-col items-center gap-4 text-neutral-800 pointer-events-auto">
          <div className="w-8 h-8 border-2 border-white/5 border-t-accent/20 rounded-full animate-spin" />
          <p className="text-[10px] font-mono uppercase tracking-[0.2em]">
            Initializing...
          </p>
        </div>
      )}
    </div>
  );
};
