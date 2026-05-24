import { useRef, useEffect, useState } from "react";
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(checkMobile);
  }, []);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const showLoading = activeSession && activeSession.url !== "" && !isMobile && !initializedWebviews.current.has(activeSessionId!);

  useEffect(() => {
    if (isMobile) return;
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          const theme = isDark ? 'dark' : 'light';
          sessions.forEach(session => {
            invoke('set_webview_theme', { label: session.id, theme })
              .catch((e) => console.warn("Theme Sync Error:", e));
          });
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [sessions, isMobile]);

  useEffect(() => {
    if (isMobile) return;
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
            const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            try {
              await invoke("open_webview", {
                label: session.id, url: targetUrl, x: rect.x, y: rect.y, width: rect.width, height: rect.height, theme: currentTheme,
              }).catch((e) => console.warn("Open Error:", e));
              initializedWebviews.current.add(session.id);
            } catch (e) { }
          }
        }
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
  }, [sessions, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    let frameId: number;
    let isSyncing = false;
    const syncBounds = async () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        if (!containerRef.current) { isSyncing = false; return; }
        const rect = containerRef.current.getBoundingClientRect();
        if (appView === 'settings' || appView === 'console' || appView === 'downloads' || appView === 'tabs') {
          for (const label of initializedWebviews.current) {
            await invoke("set_webview_bounds", { label, x: -10000, y: -10000, width: 100, height: 100 }).catch((e) => console.warn("Hide Error:", e));
          }
          isSyncing = false; return;
        }
        for (const session of sessions) {
          const isCurrentlyActive = session.id === activeSessionId && !isPaletteOpen && appView === 'browser';
          if (isCurrentlyActive) {
            if (rect.width === 0 || rect.height === 0) { isSyncing = false; frameId = requestAnimationFrame(syncBounds); return; }
            await invoke("set_webview_bounds", { label: session.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height }).catch((e) => console.warn("Bounds Sync Error:", e));
          } else {
            await invoke("set_webview_bounds", { label: session.id, x: -10000, y: -10000, width: 100, height: 100 }).catch((e) => console.warn("Background Hide Error:", e));
          }
        }
      } catch (err) { console.error("Critical Native Sync Error:", err); }
      isSyncing = false;
    };
    const observer = new ResizeObserver((entries) => { if (entries.length > 0) syncBounds(); });
    if (containerRef.current) observer.observe(containerRef.current);
    syncBounds();
    return () => { observer.disconnect(); if (frameId) cancelAnimationFrame(frameId); };
  }, [sessions, activeSessionId, isPaletteOpen, appView, isMobile]);

  // 🛑 MOBILE HACK: YouTube ලෝඩ් වෙන්න Proxy එකක් දාගත්තා
  const getFormattedUrl = (rawUrl: string) => {
    if (!rawUrl) return "";
    let targetUrl = rawUrl;
    const isUrl = targetUrl.includes(".") && !targetUrl.includes(" ");
    if (!targetUrl.startsWith("http") && isUrl) targetUrl = `https://${targetUrl}`;
    if (!isUrl) targetUrl = `https://google.com/search?igu=1&q=${encodeURIComponent(targetUrl)}`;

    // මේකෙන් YouTube වගේ බ්ලොක් වෙන සයිට්ස් ලෝඩ් වෙනවා
    if (isMobile && (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be"))) {
      return `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    }
    return targetUrl;
  };

  return (
    <div ref={containerRef} className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none z-0">
      {showLoading && (
        <div className="flex flex-col items-center gap-4 text-neutral-800 dark:text-neutral-200 pointer-events-auto">
          <div className="w-8 h-8 border-2 border-neutral-200 dark:border-white/5 border-t-accent rounded-full animate-spin" />
          <p className="text-[10px] font-mono uppercase tracking-[0.2em]">Initializing...</p>
        </div>
      )}
      {isMobile && appView === 'browser' && !isPaletteOpen && (
        <div className="absolute inset-0 w-full h-full pointer-events-auto">
          {sessions.filter(s => s.url).map(session => (
            <iframe
              key={session.id}
              src={getFormattedUrl(session.url)}
              className={cn("absolute inset-0 w-full h-full border-none bg-white dark:bg-black transition-opacity duration-200",
                session.id === activeSessionId ? "opacity-100 z-10" : "opacity-0 -z-10 pointer-events-none"
              )}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          ))}
        </div>
      )}
    </div>
  );
};