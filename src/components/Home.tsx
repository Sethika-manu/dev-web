import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSettings } from "./SettingsContext";

const QUOTES = [
  "Talk is cheap. Show me the code. — Linus Torvalds",
  "Programs must be written for people to read. — Harold Abelson",
  "The best way to predict the future is to invent it. — Alan Kay",
  "Coding is the closest thing we have to a superpower. — Drew Houston",
  "Software is a great combination between artistry and engineering. — Bill Gates",
  "First, solve the problem. Then, write the code. — John Johnson",
  "Simplicity is the soul of efficiency. — Austin Freeman",
  "Make it work, make it right, make it fast. — Kent Beck"
];

interface HomeProps {
  onNavigate: (url: string) => void;
}

interface SiteVisit {
  url: string;
  name: string;
  visitCount: number;
}

export function recordSiteVisit(url: string, title?: string) {
  if (!url || url.startsWith('about:') || url.startsWith('chrome:')) return;
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    let name = title || parsed.hostname.replace('www.', '');
    if (name && name.includes('.') && !title) {
      const parts = name.split('.');
      name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    const rawHistory = localStorage.getItem('siteHistory');
    let history: SiteVisit[] = [];
    if (rawHistory) {
      try {
        history = JSON.parse(rawHistory);
      } catch (e) {
        history = [];
      }
    }
    if (!Array.isArray(history)) {
      history = [];
    }

    const existingIndex = history.findIndex(item => {
      try {
        return new URL(item.url).origin === origin;
      } catch (e) {
        return item.url === origin;
      }
    });

    if (existingIndex > -1) {
      history[existingIndex].visitCount += 1;
      if (title && title !== origin) {
        history[existingIndex].name = title;
      }
    } else {
      history.push({
        url: origin,
        name: name,
        visitCount: 1
      });
    }

    localStorage.setItem('siteHistory', JSON.stringify(history));
  } catch (e) {
    console.error("Failed to record site visit:", e);
  }
}

export const Home = ({ onNavigate }: HomeProps) => {
  const [quote, setQuote] = useState("");
  const { t } = useSettings();
  const [topSites, setTopSites] = useState<SiteVisit[]>([]);

  useEffect(() => {
    const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    setQuote(randomQuote);

    const rawHistory = localStorage.getItem('siteHistory');
    let history: SiteVisit[] = [];
    if (rawHistory) {
      try {
        history = JSON.parse(rawHistory);
      } catch (e) {
        console.error("Failed to parse siteHistory", e);
      }
    }
    if (!Array.isArray(history)) {
      history = [];
    }

    const sorted = [...history].sort((a, b) => b.visitCount - a.visitCount);

    const fallbackSites: SiteVisit[] = [
      { url: "https://wikipedia.org", name: "Wikipedia", visitCount: 0 },
      { url: "https://youtube.com", name: "YouTube", visitCount: 0 }
    ];

    const finalSites: SiteVisit[] = [];
    for (let i = 0; i < 2; i++) {
      if (sorted[i]) {
        finalSites.push(sorted[i]);
      } else {
        const fallback = fallbackSites.find(f => !finalSites.some(s => s.url === f.url));
        if (fallback) {
          finalSites.push(fallback);
        } else {
          finalSites.push(fallbackSites[i]);
        }
      }
    }

    setTopSites(finalSites);
  }, []);

  return (
    <motion.div 
      key="home"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="absolute inset-0 flex items-center justify-center p-8 z-20 bg-white dark:bg-[#050505] transition-colors duration-300"
    >
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{t('home_ready')}</h1>
          <p className="text-neutral-500 dark:text-neutral-500 text-sm leading-relaxed italic min-h-[40px]">
            {quote || "..."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4">
          {topSites.map((site, idx) => {
            const isWikipedia = site.url.includes("wikipedia.org");
            const isYouTube = site.url.includes("youtube.com");
            
            let label = "FREQUENT";
            let labelColor = idx === 0 ? "text-accent" : "text-emerald-600 dark:text-emerald-500";
            
            if (isWikipedia) {
              label = t('home_docs');
              labelColor = "text-accent";
            } else if (isYouTube) {
              label = t('home_media');
              labelColor = "text-emerald-600 dark:text-emerald-500";
            }

            return (
              <div 
                key={site.url}
                onClick={() => {
                  const targetUrl = site.url;
                  if ((window as any).NativeBridge) {
                    (window as any).NativeBridge.loadNativeUrl(targetUrl);
                  } else {
                    console.error("NativeBridge is not available");
                  }
                  onNavigate(targetUrl);
                }}
                className="p-4 rounded-xl bg-neutral-100/50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-border text-left hover:border-accent/30 dark:hover:border-accent/30 transition-colors cursor-pointer group shadow-sm dark:shadow-none"
              >
                <div className={`text-[10px] font-bold ${labelColor} mb-1 uppercase tracking-widest`}>
                  {label}
                </div>
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors truncate">
                  {site.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};
