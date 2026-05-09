import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Command, ArrowRight } from "lucide-react";

export const CommandPalette = ({ 
  isOpen, 
  onClose, 
  onNavigate 
}: { 
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void 
}) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    let url = query.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    onNavigate(url);
    onClose();
    setQuery("");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl shadow-black/50 pointer-events-auto overflow-hidden"
        >
          <form onSubmit={handleSubmit} className="flex items-center px-4 border-b border-border bg-neutral-900/50">
            <Search size={18} className="text-neutral-500" />
            <input
              autoFocus
              className="flex-1 h-14 bg-transparent border-none outline-none px-4 text-sm placeholder:text-neutral-600"
              placeholder="Search tabs, enter URL, or run command..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-1 bg-neutral-800 px-2 py-1 rounded text-[10px] text-neutral-400 font-mono">
              <Command size={10} /> K
            </div>
          </form>

          <div className="p-2">
            <div className="px-3 py-2 text-[10px] font-bold text-neutral-600 tracking-widest">
              SUGGESTIONS
            </div>
            <div className="space-y-1">
              {["wikipedia.org", "google.com", "linear.app"].map((site) => (
                <button
                  key={site}
                  onClick={() => {
                    onNavigate(`https://${site}`);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-neutral-800 group transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-neutral-800 rounded flex items-center justify-center text-xs text-neutral-400">
                      {site[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-neutral-300">{site}</span>
                  </div>
                  <ArrowRight size={14} className="text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>
        
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm -z-10 pointer-events-auto"
          onClick={onClose}
        />
      </div>
    </AnimatePresence>
  );
};
