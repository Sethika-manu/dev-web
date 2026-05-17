import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import { Download, CheckCircle, XCircle, Clock, Trash2, HardDrive } from 'lucide-react';

interface DownloadPayload {
  url: string;
  state: 'started' | 'finished' | 'failed';
  path: string;
}

interface DownloadHistoryItem {
  id: string;
  url: string;
  path: string;
  timestamp: number;
  status: 'completed' | 'failed';
}

export const Downloads = () => {
  const [activeDownloads, setActiveDownloads] = useState<DownloadPayload[]>([]);
  const [history, setHistory] = useState<DownloadHistoryItem[]>(() => {
    const saved = localStorage.getItem('rc_download_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    const unlisten = listen<DownloadPayload>('download-event', (event) => {
      const payload = event.payload;

      if (payload.state === 'started') {
        setActiveDownloads(prev => {
          if (!prev.find(d => d.url === payload.url)) {
            return [...prev, payload];
          }
          return prev;
        });
      } else if (payload.state === 'finished' || payload.state === 'failed') {
        // Remove from active
        setActiveDownloads(prev => prev.filter(d => d.url !== payload.url));
      }
    });

    const handleHistoryUpdate = (e: any) => {
      setHistory(prev => [e.detail, ...prev]);
    };

    window.addEventListener('rc-download-finished', handleHistoryUpdate);

    return () => {
      unlisten.then(fn => fn());
      window.removeEventListener('rc-download-finished', handleHistoryUpdate);
    };
  }, []);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('rc_download_history');
  };

  return (
    <div className="h-full bg-white dark:bg-[#050505] overflow-y-auto custom-scrollbar transition-colors duration-300">
      <div className="max-w-3xl mx-auto py-12 px-8">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent/10 rounded-xl border border-accent/20">
              <Download size={24} className="text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Downloads</h1>
              <p className="text-neutral-500 text-sm">Manage your downloaded files</p>
            </div>
          </div>
          {history.length > 0 && (
            <button 
              onClick={clearHistory}
              className="flex items-center gap-2 text-xs font-medium text-neutral-500 hover:text-red-500 transition-colors px-3 py-1.5 rounded-md hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
            >
              <Trash2 size={14} />
              Clear History
            </button>
          )}
        </div>

        {activeDownloads.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xs font-bold text-neutral-500 dark:text-neutral-600 uppercase tracking-widest px-1 mb-4">
              Active Downloads ({activeDownloads.length})
            </h2>
            <div className="space-y-3">
              {activeDownloads.map((download, i) => (
                <motion.div
                  key={download.url + i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-neutral-900/30 border border-accent/30 rounded-xl p-4 flex items-center justify-between shadow-sm relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-accent/5 animate-pulse" />
                  <div className="relative z-10 flex items-center gap-4 w-full">
                    <div className="p-2 bg-accent/10 rounded-lg text-accent">
                      <HardDrive size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                        {download.url.split('/').pop() || 'Unknown file'}
                      </div>
                      <div className="text-xs text-accent mt-1 flex items-center gap-1.5">
                        <Clock size={12} className="animate-spin-slow" />
                        Downloading...
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xs font-bold text-neutral-500 dark:text-neutral-600 uppercase tracking-widest px-1 mb-4">
            Download History
          </h2>
          {history.length === 0 ? (
            <div className="text-center py-12 bg-neutral-50 dark:bg-neutral-900/20 border border-neutral-100 dark:border-white/5 rounded-2xl">
              <Download size={32} className="mx-auto text-neutral-300 dark:text-neutral-700 mb-3" />
              <p className="text-sm text-neutral-500">No recent downloads</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900/30 border border-neutral-200 dark:border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm dark:shadow-none">
              {history.map((item, i) => (
                <div 
                  key={item.id}
                  className={`flex items-center justify-between p-4 ${
                    i !== history.length - 1 ? 'border-b border-neutral-100 dark:border-white/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`p-2 rounded-lg border ${
                      item.status === 'completed' 
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-500 border-red-500/20'
                    }`}>
                      {item.status === 'completed' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                        {item.url.split('/').pop() || 'Unknown file'}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-500 truncate mt-0.5" title={item.path}>
                        {item.path || item.url}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-[10px] text-neutral-400 font-mono whitespace-nowrap">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
