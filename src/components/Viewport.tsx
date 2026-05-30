import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "./SettingsContext";

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
  const { theme } = useSettings();
  const isDarkMode = theme === 'System'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme === 'Dark';

  const isMobileLayout = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

  // 1. Sync theme across all active webviews
  useEffect(() => {
    if (isMobileLayout) return;

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
  }, [sessions]);

  // 2. Lifecycle management and pixel-perfect physical bounds syncing (Universal - PC only)
  useEffect(() => {
    if (isMobileLayout) return;

    let isProcessing = false;

    const syncWebviews = async () => {
      if (isProcessing) return;
      isProcessing = true;
      try {
        if (!containerRef.current) {
          isProcessing = false;
          return;
        }

        const scale = window.devicePixelRatio || 1.0;
        const rect = containerRef.current.getBoundingClientRect();
        
        const physX = Math.round(rect.x * scale);
        const physY = Math.round(rect.y * scale);
        const physWidth = Math.round(rect.width * scale);
        const physHeight = Math.round(rect.height * scale);

        if (physWidth <= 0 || physHeight <= 0) {
          isProcessing = false;
          return;
        }

        // Manage Lifecycle (Open/Close)
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
            let targetUrl = session.url.trim();
            const isUrl = targetUrl.includes(".") && !targetUrl.includes(" ");
            if (!targetUrl.startsWith("http") && isUrl) targetUrl = `https://${targetUrl}`;
            if (!isUrl) targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
            const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

            try {
              await invoke("open_webview", {
                label: session.id,
                url: targetUrl,
                x: physX,
                y: physY,
                width: physWidth,
                height: physHeight,
                theme: currentTheme,
              });
              initializedWebviews.current.add(session.id);
            } catch (e) {
              console.warn("Open Error:", e);
            }
          }
        }

        // Cleanup orphaned sessions
        const currentIds = new Set(sessions.map(s => s.id));
        for (const id of Array.from(initializedWebviews.current)) {
          if (!currentIds.has(id)) {
            await invoke("close_webview", { label: id }).catch((e) => console.warn("Cleanup Error:", e));
            initializedWebviews.current.delete(id);
          }
        }

        // Sync Bounds & Visibility
        const isOverlayVisible = appView === 'settings' || appView === 'console' || appView === 'downloads' || appView === 'tabs';
        if (isOverlayVisible) {
          for (const label of initializedWebviews.current) {
            await invoke("set_webview_bounds", { 
              label, 
              x: -10000, 
              y: -10000, 
              width: 100, 
              height: 100 
            }).catch((e) => console.warn("Hide Error:", e));
          }
          isProcessing = false;
          return;
        }

        for (const session of sessions) {
          const isCurrentlyActive = session.id === activeSessionId && !isPaletteOpen && appView === 'browser';
          if (initializedWebviews.current.has(session.id)) {
            if (isCurrentlyActive) {
              await invoke("set_webview_bounds", {
                label: session.id,
                x: physX,
                y: physY,
                width: physWidth,
                height: physHeight,
              }).catch((e) => console.warn("Bounds Sync Error:", e));
            } else {
              // Hide inactive session webview
              await invoke("set_webview_bounds", {
                label: session.id,
                x: -10000,
                y: -10000,
                width: 100,
                height: 100,
              }).catch((e) => console.warn("Background Hide Error:", e));
            }
          }
        }
      } catch (err) {
        console.error("Critical Native Sync Error:", err);
      }
      isProcessing = false;
    };

    const observer = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        syncWebviews();
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    syncWebviews();

    return () => {
      observer.disconnect();
    };
  }, [sessions, activeSessionId, isPaletteOpen, appView]);



  // Clean up native webviews when component unmounts (PC only)
  useEffect(() => {
    return () => {
      if (!isMobileLayout) {
        initializedWebviews.current.forEach(label => {
          invoke("close_webview", { label }).catch((e) => console.warn("Unmount Close Error:", e));
        });
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none z-0" 
      style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
    />
  );
};