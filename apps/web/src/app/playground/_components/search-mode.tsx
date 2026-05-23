'use client';

import { useState } from 'react';
import { Search, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import type { ScrapeSettings } from './types';

interface SearchModeProps {
  apiKey: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  url: string;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setResult: (r: Record<string, unknown> | null) => void;
  setError: (e: string) => void;
  scrapeSettings: ScrapeSettings;
  setScrapeSettings: React.Dispatch<React.SetStateAction<ScrapeSettings>>;
  resetResultState: () => void;
  toast: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void };
}

export function SearchMode({
  apiKey, searchQuery, setSearchQuery, url, loading, setLoading, setResult, setError,
  scrapeSettings, setScrapeSettings, resetResultState, toast,
}: SearchModeProps) {
  const [searchLimit, setSearchLimit] = useState(5);

  const toggleScrapeFormat = (f: string) => {
    setScrapeSettings((prev) => ({
      ...prev,
      formats: prev.formats.includes(f) ? prev.formats.filter((x) => x !== f) : [...prev.formats, f],
    }));
  };

  const handleSubmit = async () => {
    if (!searchQuery || !apiKey) return;
    setLoading(true);
    setError('');
    setResult(null);
    resetResultState();

    try {
      const res = await apiClient.search({
        query: searchQuery || url,
        limit: searchLimit,
        formats: scrapeSettings.formats,
      }, apiKey);
      setResult(res as unknown as Record<string, unknown>);
      setLoading(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search the web..."
            className="pl-10"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        <Button onClick={handleSubmit} disabled={loading || !searchQuery || !apiKey}>
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
          ) : (
            <><Play className="h-4 w-4" /> Search</>
          )}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Max Results</label>
            <Input
              type="number"
              min={1}
              max={20}
              value={searchLimit}
              onChange={(e) => setSearchLimit(parseInt(e.target.value) || 5)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Output Format</label>
            <div className="flex gap-1.5 flex-wrap pt-1">
              {['markdown', 'html', 'links'].map((f) => (
                <button
                  key={f}
                  onClick={() => toggleScrapeFormat(f)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                    scrapeSettings.formats.includes(f)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Searches the web and scrapes each result page. Uses SearXNG if configured, otherwise DuckDuckGo.
        </p>
      </div>
    </div>
  );
}
