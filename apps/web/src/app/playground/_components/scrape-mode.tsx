'use client';

import { useState } from 'react';
import {
  Globe, Loader2, Play, FileText, Code, Link2, Image as ImageIcon,
  Settings2, Plus, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { ExtractSettings, defaultExtractConfig, type ExtractConfig } from '@/components/playground/extract-settings';
import { formatOptions, type PlaygroundResult, type ScrapeSettings } from './types';

interface ScrapeModeProps {
  apiKey: string;
  url: string;
  setUrl: (url: string) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  setResult: (r: PlaygroundResult | null) => void;
  setError: (e: string) => void;
  scrapeSettings: ScrapeSettings;
  setScrapeSettings: React.Dispatch<React.SetStateAction<ScrapeSettings>>;
  resetResultState: () => void;
  toast: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void };
}

export function ScrapeMode({
  apiKey, url, setUrl, loading, setLoading, setResult, setError,
  scrapeSettings, setScrapeSettings, resetResultState, toast,
}: ScrapeModeProps) {
  const [showScrapeAdvanced, setShowScrapeAdvanced] = useState(false);
  const [newIncludeTag, setNewIncludeTag] = useState('');
  const [newExcludeTag, setNewExcludeTag] = useState('');
  const [scrapeExtract, setScrapeExtract] = useState<ExtractConfig>({ ...defaultExtractConfig });

  const toggleScrapeFormat = (f: string) => {
    setScrapeSettings((prev) => ({
      ...prev,
      formats: prev.formats.includes(f) ? prev.formats.filter((x) => x !== f) : [...prev.formats, f],
    }));
  };

  const updateScrapeSetting = <K extends keyof ScrapeSettings>(key: K, value: ScrapeSettings[K]) => {
    setScrapeSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!url || !apiKey) return;
    setLoading(true);
    setError('');
    setResult(null);
    resetResultState();

    try {
      const scrapeBody: Record<string, unknown> = {
        url,
        formats: scrapeSettings.formats,
        onlyMainContent: scrapeSettings.onlyMainContent,
        engine: scrapeSettings.engine,
      };
      if (scrapeSettings.timeout !== 30000) scrapeBody.timeout = scrapeSettings.timeout;
      if (scrapeSettings.waitFor > 0) scrapeBody.waitFor = scrapeSettings.waitFor;
      if (scrapeSettings.mobile) scrapeBody.mobile = true;
      if (scrapeSettings.includeTags.length > 0) scrapeBody.includeTags = scrapeSettings.includeTags;
      if (scrapeSettings.excludeTags.length > 0) scrapeBody.excludeTags = scrapeSettings.excludeTags;
      if (scrapeExtract.enabled) {
        if (scrapeExtract.prompt) scrapeBody.extractPrompt = scrapeExtract.prompt;
        if (scrapeExtract.schema) {
          try { scrapeBody.extractSchema = JSON.parse(scrapeExtract.schema); } catch { /* invalid schema, skip */ }
        }
      }
      const res = await apiClient.scrape(scrapeBody, apiKey);
      setResult(res);
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
            <><Play className="h-4 w-4" /> Scrape</>
          )}
        </Button>
      </div>

      <div className="space-y-4">
        {/* Output Formats */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Output Formats</label>
          <div className="flex gap-1.5 flex-wrap">
            {formatOptions.map((f) => (
              <button
                key={f}
                onClick={() => toggleScrapeFormat(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                  scrapeSettings.formats.includes(f)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {f === 'markdown' && <FileText className="h-3 w-3" />}
                {f === 'html' && <Code className="h-3 w-3" />}
                {f === 'links' && <Link2 className="h-3 w-3" />}
                {f === 'images' && <ImageIcon className="h-3 w-3" />}
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Basic settings row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Engine</label>
            <select
              value={scrapeSettings.engine}
              onChange={(e) => updateScrapeSetting('engine', e.target.value as ScrapeSettings['engine'])}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="auto">Auto</option>
              <option value="cheerio">Cheerio (Fast)</option>
              <option value="playwright">Playwright (JS)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Timeout (ms)</label>
            <Input
              type="number"
              min={1000}
              step={1000}
              value={scrapeSettings.timeout}
              onChange={(e) => updateScrapeSetting('timeout', parseInt(e.target.value) || 30000)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Wait For (ms)</label>
            <Input
              type="number"
              min={0}
              step={500}
              value={scrapeSettings.waitFor}
              onChange={(e) => updateScrapeSetting('waitFor', parseInt(e.target.value) || 0)}
              className="h-8 text-xs"
              placeholder="0"
            />
          </div>
          <div className="flex items-end gap-3 pb-0.5">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={scrapeSettings.mobile}
                onChange={(e) => updateScrapeSetting('mobile', e.target.checked)}
                className="rounded border-border"
              />
              Mobile
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={scrapeSettings.onlyMainContent}
                onChange={(e) => updateScrapeSetting('onlyMainContent', e.target.checked)}
                className="rounded border-border"
              />
              Main only
            </label>
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowScrapeAdvanced(!showScrapeAdvanced)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Settings2 className="h-3 w-3" />
          Tag Filters
          {showScrapeAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showScrapeAdvanced && (
          <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
            {/* Include Tags */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Include Tags <span className="text-muted-foreground/60">(only extract from these HTML tags)</span>
              </label>
              <div className="flex gap-2 mb-1.5">
                <Input
                  value={newIncludeTag}
                  onChange={(e) => setNewIncludeTag(e.target.value)}
                  placeholder="article, main, .content"
                  className="h-8 text-xs font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newIncludeTag) {
                      updateScrapeSetting('includeTags', [...scrapeSettings.includeTags, newIncludeTag]);
                      setNewIncludeTag('');
                    }
                  }}
                />
                <Button size="sm" variant="outline" onClick={() => {
                  if (newIncludeTag) {
                    updateScrapeSetting('includeTags', [...scrapeSettings.includeTags, newIncludeTag]);
                    setNewIncludeTag('');
                  }
                }} disabled={!newIncludeTag} className="h-8 px-2">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {scrapeSettings.includeTags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {scrapeSettings.includeTags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 text-[10px] font-mono">
                      {t}
                      <button onClick={() => updateScrapeSetting('includeTags', scrapeSettings.includeTags.filter((x) => x !== t))}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Exclude Tags */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Exclude Tags <span className="text-muted-foreground/60">(remove these HTML tags from output)</span>
              </label>
              <div className="flex gap-2 mb-1.5">
                <Input
                  value={newExcludeTag}
                  onChange={(e) => setNewExcludeTag(e.target.value)}
                  placeholder="nav, footer, .sidebar"
                  className="h-8 text-xs font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newExcludeTag) {
                      updateScrapeSetting('excludeTags', [...scrapeSettings.excludeTags, newExcludeTag]);
                      setNewExcludeTag('');
                    }
                  }}
                />
                <Button size="sm" variant="outline" onClick={() => {
                  if (newExcludeTag) {
                    updateScrapeSetting('excludeTags', [...scrapeSettings.excludeTags, newExcludeTag]);
                    setNewExcludeTag('');
                  }
                }} disabled={!newExcludeTag} className="h-8 px-2">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {scrapeSettings.excludeTags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {scrapeSettings.excludeTags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 text-[10px] font-mono">
                      {t}
                      <button onClick={() => updateScrapeSetting('excludeTags', scrapeSettings.excludeTags.filter((x) => x !== t))}>
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Extraction */}
        <ExtractSettings config={scrapeExtract} onChange={setScrapeExtract} compact />
      </div>
    </div>
  );
}
