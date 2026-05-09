import { Cpu, MemoryStick, Wifi, Zap } from "lucide-react";

export const StatusBar = () => {
  return (
    <div className="h-6 bg-background border-t border-border flex items-center justify-between px-3 select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 group cursor-help">
          <Cpu size={12} className="text-accent" />
          <span className="text-[10px] font-mono text-neutral-400">CPU: <span className="text-neutral-200">2.4%</span></span>
        </div>
        <div className="flex items-center gap-1.5 group cursor-help">
          <MemoryStick size={12} className="text-emerald-500" />
          <span className="text-[10px] font-mono text-neutral-400">RAM: <span className="text-neutral-200">142MB</span></span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Wifi size={12} className="text-neutral-500" />
          <span className="text-[10px] font-mono text-neutral-400">ping: <span className="text-neutral-200">12ms</span></span>
        </div>
        <div className="flex items-center gap-1.5 bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
          <Zap size={10} className="text-accent fill-accent" />
          <span className="text-[10px] font-bold text-accent tracking-tighter">OPTIMIZED</span>
        </div>
      </div>
    </div>
  );
};
