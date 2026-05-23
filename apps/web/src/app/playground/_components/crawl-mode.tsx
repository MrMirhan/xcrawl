'use client';

import { useState } from 'react';
import {
  Globe, Loader2, Play, Settings2, Plus, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { ExtractSettings, defaultExtractConfig, type ExtractConfig } from '@/components/playground/extract-settings';
import { formatOptions, defaultCrawlSettings, type CrawlSettings } from './types';

interface CrawlModeProps {
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

export function CrawlMode({
  apiKey, url, setUrl, loading, setLoading, setResult, setError,
  setPollingJobId, setPollStatus, resetResultState, toast,
}: CrawlModeProps) {
  const [crawlSettings, setCrawlSettings] = useState<CrawlSettings>({ ...defaultCrawlSettings });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newIncludePath, setNewIncludePath] = useState('');
  const [newExcludePath, setNewExcludePath] = useState('');
  const [crawlExtract, setCrawlExtract] = useState<ExtractConfig>({ ...defaultExtractConfig });

  const updateCrawlSetting = <K extends keyof CrawlSettings>(key: K, value: CrawlSettings[K]) => {
    setCrawlSettings((prev) => ({ ...prev, [key]: value }));
  };

  const addIncludePath = () => {
    if (newIncludePath && !crawlSettings.includePaths.includes(newIncludePath)) {
      updateCrawlSetting('includePaths', [...crawlSettings.includePaths, newIncludePath]);
      setNewIncludePath('');
    }
  };

  const addExcludePath = () => {
    if (newExcludePath && !crawlSettings.excludePaths.includes(newExcludePath)) {
      updateCrawlSetting('excludePaths', [...crawlSettings.excludePaths, newExcludePath]);
      setNewExcludePath('');
    }
  };

  const toggleCrawlFormat = (f: string) => {
    updateCrawlSetting(
      'formats',
      crawlSettings.formats.includes(f)
        ? crawlSettings.formats.filter((x) => x !== f)
        : [...crawlSettings.formats, f],
    );
  };

  const handleSubmit = async () => {
    if (!url || !apiKey) return;
    setLoading(true);
    setError('');
    setResult(null);
    resetResultState();

    try {
      const crawlBody: Record<string, unknown> = {
        url,
        maxPages: crawlSettings.maxPages,
        formats: crawlSettings.formats,
        onlyMainContent: crawlSettings.onlyMainContent,
        engine: crawlSettings.engine,
        allowExternalLinks: crawlSettings.allowExternalLinks,
        allowSubdomains: crawlSettings.allowSubdomains,
        sitemap: crawlSettings.sitemap,
        ignoreQueryParameters: crawlSettings.ignoreQueryParameters,
        regexOnFullUrl: crawlSettings.regexOnFullUrl,
        dismissPopups: crawlSettings.dismissPopups,
        skipPaywalls: crawlSettings.skipPaywalls,
      };
      if (crawlSettings.maxDepth !== null) crawlBody.maxDepth = crawlSettings.maxDepth;
      if (crawlSettings.includePaths.length > 0) crawlBody.includePaths = crawlSettings.includePaths;
      if (crawlSettings.excludePaths.length > 0) crawlBody.excludePaths = crawlSettings.excludePaths;
      if (crawlSettings.delay > 0) crawlBody.delay = crawlSettings.delay;
      if (crawlSettings.maxConcurrency !== 5) crawlBody.maxConcurrency = crawlSettings.maxConcurrency;
      if (crawlExtract.enabled) {
        if (crawlExtract.prompt) crawlBody.extractPrompt = crawlExtract.prompt;
        if (crawlExtract.schema) {
          try { crawlBody.extractSchema = JSON.parse(crawlExtract.schema); } catch { /* invalid schema */ }
        }
      }
      const res = await apiClient.startCrawl(crawlBody, apiKey) as Record<string, unknown>;
      const jobId = res.id as string;
      setPollingJobId(jobId);
      setPollStatus('PENDING — Starting crawl...');
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
            <><Play className="h-4 w-4" /> Crawl</>
          )}
        </Button>
      </div>

      <div className="space-y-4">
        {/* Basic Settings Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Max Pages</label>
            <Input
              type="number"
              min={1}
              value={crawlSettings.maxPages}
              onChange={(e) => updateCrawlSetting('maxPages', parseInt(e.target.value) || 10)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Max Depth</label>
            <Input
              type="number"
              min={1}
              placeholder="No limit"
              value={crawlSettings.maxDepth ?? ''}
              onChange={(e) => updateCrawlSetting('maxDepth', e.target.value ? parseInt(e.target.value) : null)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Engine</label>
            <select
              value={crawlSettings.engine}
              onChange={(e) => updateCrawlSetting('engine', e.target.value as CrawlSettings['engine'])}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="auto">Auto</option>
              <option value="cheerio">Cheerio (Fast)</option>
              <option value="playwright">Playwright (JS)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Sitemap</label>
            <select
              value={crawlSettings.sitemap}
              onChange={(e) => updateCrawlSetting('sitemap', e.target.value as CrawlSettings['sitemap'])}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="include">Include</option>
              <option value="skip">Skip</option>
              <option value="only">Only</option>
            </select>
          </div>
        </div>

        {/* Output Formats */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Output Formats</label>
          <div className="flex gap-1.5 flex-wrap">
            {formatOptions.map((f) => (
              <button
                key={f}
                onClick={() => toggleCrawlFormat(f)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                  crawlSettings.formats.includes(f)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Include Paths */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Include Paths <span className="text-muted-foreground/60">(regex patterns)</span>
          </label>
          <div className="flex gap-2 mb-1.5">
            <Input
              value={newIncludePath}
              onChange={(e) => setNewIncludePath(e.target.value)}
              placeholder="/blog/.*, /docs/.*"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => e.key === 'Enter' && addIncludePath()}
            />
            <Button size="sm" variant="outline" onClick={addIncludePath} disabled={!newIncludePath} className="h-8 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {crawlSettings.includePaths.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {crawlSettings.includePaths.map((p) => (
                <Badge key={p} variant="secondary" className="gap-1 text-[10px] font-mono">
                  {p}
                  <button onClick={() => updateCrawlSetting('includePaths', crawlSettings.includePaths.filter((x) => x !== p))}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Exclude Paths */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Exclude Paths <span className="text-muted-foreground/60">(regex patterns)</span>
          </label>
          <div className="flex gap-2 mb-1.5">
            <Input
              value={newExcludePath}
              onChange={(e) => setNewExcludePath(e.target.value)}
              placeholder="/admin/.*, /login"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => e.key === 'Enter' && addExcludePath()}
            />
            <Button size="sm" variant="outline" onClick={addExcludePath} disabled={!newExcludePath} className="h-8 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {crawlSettings.excludePaths.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {crawlSettings.excludePaths.map((p) => (
                <Badge key={p} variant="secondary" className="gap-1 text-[10px] font-mono">
                  {p}
                  <button onClick={() => updateCrawlSetting('excludePaths', crawlSettings.excludePaths.filter((x) => x !== p))}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Advanced Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Settings2 className="h-3 w-3" />
          Advanced Settings
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showAdvanced && (
          <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
            {/* Toggle Switches */}
            <div className="grid grid-cols-2 gap-2">
              {([
                ['onlyMainContent', 'Main content only'],
                ['allowExternalLinks', 'Allow external links'],
                ['allowSubdomains', 'Allow subdomains'],
                ['ignoreQueryParameters', 'Ignore query params'],
                ['regexOnFullUrl', 'Regex on full URL'],
                ['dismissPopups', 'Auto-dismiss popups'],
                ['skipPaywalls', 'Skip paywalled pages'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={crawlSettings[key] as boolean}
                    onChange={(e) => updateCrawlSetting(key, e.target.checked)}
                    className="rounded border-border"
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* Numeric Settings */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Delay (ms)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={crawlSettings.delay}
                  onChange={(e) => updateCrawlSetting('delay', parseInt(e.target.value) || 0)}
                  className="h-8 text-xs"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Max Concurrency
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={crawlSettings.maxConcurrency}
                  onChange={(e) => updateCrawlSetting('maxConcurrency', parseInt(e.target.value) || 5)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* AI Extraction */}
        <ExtractSettings config={crawlExtract} onChange={setCrawlExtract} compact />
      </div>
    </div>
  );
}
