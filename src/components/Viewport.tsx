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
  isPaletteOpen 
}: { 
  sessions: Session[], 
  activeSessionId: string | null,
  isPaletteOpen: boolean
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedWebviews = useRef<Set<string>>(new Set());

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const showLoading = activeSession && activeSession.url !== "" && !initializedWebviews.current.has(activeSessionId!);

  // 1. Manage Lifecycle & Visibility
  useEffect(() => {
    const syncWebviews = async () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      for (const session of sessions) {
        const isCurrentlyActive = session.id === activeSessionId && !isPaletteOpen;
        const hasBeenInitialized = initializedWebviews.current.has(session.id);

        if (session.url === "") {
          if (hasBeenInitialized) {
            await invoke("close_webview", { label: session.id });
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
            });
            initializedWebviews.current.add(session.id);
          } catch (e) {}
        }

        await invoke("set_webview_visibility", { 
          label: session.id, 
          visible: isCurrentlyActive 
        }).catch(() => {});

        if (isCurrentlyActive) {
          await invoke("set_webview_bounds", {
            label: session.id,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }).catch(() => {});
        }
      }

      const currentIds = new Set(sessions.map(s => s.id));
      for (const id of initializedWebviews.current) {
        if (!currentIds.has(id)) {
          await invoke("close_webview", { label: id });
          initializedWebviews.current.delete(id);
        }
      }
    };

    syncWebviews();
  }, [sessions, activeSessionId, isPaletteOpen]);

  // 2. Sync Bounds on Resize
  useEffect(() => {
    const syncBounds = async () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      for (const id of initializedWebviews.current) {
        await invoke("set_webview_bounds", {
          label: id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }).catch(() => {});
      }
    };

    window.addEventListener("resize", syncBounds);
    return () => window.removeEventListener("resize", syncBounds);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none -z-10"
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
