'use client';

import { useState } from 'react';
import { Globe, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { ExtractSettings, type ExtractConfig } from '@/components/playground/extract-settings';

interface ExtractModeProps {
  apiKey: string;
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setResult: (r: Record<string, unknown> | null) => void;
  setError: (e: string) => void;
  setPollingJobId: (id: string | null) => void;
  setPollStatus: (s: string) => void;
  resetResultState: () => void;
  toast: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void };
}

export function ExtractMode({
  apiKey, url, setUrl, loading, setLoading, setResult, setError,
  setPollingJobId, setPollStatus, resetResultState, toast,
}: ExtractModeProps) {
  const [extractConfig, setExtractConfig] = useState<ExtractConfig>({ enabled: true, schema: '', prompt: '' });

  const handleSubmit = async () => {
    if (!url || !apiKey) return;
    setLoading(true);
    setError('');
    setResult(null);
    resetResultState();

    try {
      const extractBody: Record<string, unknown> = { urls: [url] };
      if (extractConfig.prompt) extractBody.prompt = extractConfig.prompt;
      if (extractConfig.schema) {
        try { extractBody.schema = JSON.parse(extractConfig.schema); } catch { /* invalid schema */ }
      }
      const res = await apiClient.startExtract(extractBody, apiKey) as Record<string, unknown>;
      setPollingJobId(res.id as string);
      setPollStatus('PENDING — Starting extraction...');
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
            <><Play className="h-4 w-4" /> Extract</>
          )}
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Scrape the URL and extract structured data using your LLM. Configure your LLM API key in Settings.
        </p>
        <ExtractSettings
          config={extractConfig}
          onChange={setExtractConfig}
        />
      </div>
    </div>
  );
}
