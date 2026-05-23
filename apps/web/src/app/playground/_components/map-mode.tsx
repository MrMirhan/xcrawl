'use client';

import { useState } from 'react';
import { Globe, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';

interface MapModeProps {
  apiKey: string;
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setResult: (r: Record<string, unknown> | null) => void;
  setError: (e: string) => void;
  resetResultState: () => void;
  toast: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void };
}

export function MapMode({
  apiKey, url, setUrl, loading, setLoading, setResult, setError, resetResultState, toast,
}: MapModeProps) {
  const [mapSearch, setMapSearch] = useState('');
  const [mapLimit, setMapLimit] = useState(500);

  const handleSubmit = async () => {
    if (!url || !apiKey) return;
    setLoading(true);
    setError('');
    setResult(null);
    resetResultState();

    try {
      const res = await apiClient.map({
        url,
        includeSitemap: true,
        search: mapSearch || undefined,
        limit: mapLimit,
      }, apiKey);
      setResult(res as Record<string, unknown>);
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
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="pl-10"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        <Button onClick={handleSubmit} disabled={loading || !url || !apiKey}>
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
          ) : (
            <><Play className="h-4 w-4" /> Map</>
          )}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Search Filter</label>
            <Input
              value={mapSearch}
              onChange={(e) => setMapSearch(e.target.value)}
              placeholder="e.g. docs, blog, api"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Max URLs</label>
            <Input
              type="number"
              min={1}
              value={mapLimit}
              onChange={(e) => setMapLimit(parseInt(e.target.value) || 500)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Discovers URLs from sitemap and page links. Use search to filter results by keyword.
        </p>
      </div>
    </div>
  );
}
