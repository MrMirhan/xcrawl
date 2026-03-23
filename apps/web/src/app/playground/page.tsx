'use client';

import { useState, useEffect } from 'react';
import {
  Globe, Loader2, Play, AlertCircle, FileText, Code, Link2, Image,
  Settings2, Plus, X, ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { ExtractSettings, defaultExtractConfig, type ExtractConfig } from '@/components/playground/extract-settings';

type Mode = 'scrape' | 'crawl' | 'map' | 'extract' | 'search';

const formatOptions = ['markdown', 'html', 'links', 'images', 'screenshot', 'text', 'rawHtml'];

interface ScrapeSettings {
  formats: string[];
  engine: 'auto' | 'cheerio' | 'playwright';
  onlyMainContent: boolean;
  timeout: number;
  waitFor: number;
  mobile: boolean;
  includeTags: string[];
  excludeTags: string[];
}

const defaultScrapeSettings: ScrapeSettings = {
  formats: ['markdown'],
  engine: 'auto',
  onlyMainContent: true,
  timeout: 30000,
  waitFor: 0,
  mobile: false,
  includeTags: [],
  excludeTags: [],
};

interface CrawlSettings {
  maxPages: number;
  maxDepth: number | null;
  formats: string[];
  onlyMainContent: boolean;
  includePaths: string[];
  excludePaths: string[];
  regexOnFullUrl: boolean;
  allowExternalLinks: boolean;
  allowSubdomains: boolean;
  sitemap: 'include' | 'skip' | 'only';
  ignoreQueryParameters: boolean;
  delay: number;
  maxConcurrency: number;
  engine: 'auto' | 'cheerio' | 'playwright';
  dismissPopups: boolean;
  skipPaywalls: boolean;
}

const defaultCrawlSettings: CrawlSettings = {
  maxPages: 10,
  maxDepth: null,
  formats: ['markdown'],
  onlyMainContent: true,
  includePaths: [],
  excludePaths: [],
  regexOnFullUrl: false,
  allowExternalLinks: false,
  allowSubdomains: false,
  sitemap: 'include',
  ignoreQueryParameters: false,
  delay: 0,
  maxConcurrency: 5,
  engine: 'auto',
  dismissPopups: true,
  skipPaywalls: false,
};

export default function PlaygroundPage() {
  const [mode, setMode] = useState<Mode>('scrape');
  const [url, setUrl] = useState('');
  const [scrapeSettings, setScrapeSettings] = useState<ScrapeSettings>({ ...defaultScrapeSettings });
  const [showScrapeAdvanced, setShowScrapeAdvanced] = useState(false);
  const [newIncludeTag, setNewIncludeTag] = useState('');
  const [newExcludeTag, setNewExcludeTag] = useState('');

  // Extract config (shared between scrape and crawl)
  const [scrapeExtract, setScrapeExtract] = useState<ExtractConfig>({ ...defaultExtractConfig });
  const [crawlExtract, setCrawlExtract] = useState<ExtractConfig>({ ...defaultExtractConfig });
  const [extractConfig, setExtractConfig] = useState<ExtractConfig>({ enabled: true, schema: '', prompt: '' });

  // Map integration state
  const [selectedMapUrls, setSelectedMapUrls] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [resultTab, setResultTab] = useState('json');
  const [apiKey, setApiKey] = useState('');
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState('');
  const [crawledUrls, setCrawledUrls] = useState<string[]>([]);

  // Crawl-specific settings
  const [crawlSettings, setCrawlSettings] = useState<CrawlSettings>({ ...defaultCrawlSettings });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newIncludePath, setNewIncludePath] = useState('');
  const [newExcludePath, setNewExcludePath] = useState('');

  // Map-specific settings
  const [mapSearch, setMapSearch] = useState('');
  const [mapLimit, setMapLimit] = useState(500);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLimit, setSearchLimit] = useState(5);

  // Poll for async job results (crawl, batch, extract)
  useEffect(() => {
    if (!pollingJobId || !apiKey) return;

    const pollInterval = setInterval(async () => {
      try {
        const endpoint = mode === 'crawl' ? 'getCrawlStatus' : mode === 'extract' ? 'getExtractStatus' : 'getBatchStatus';
        const status = await apiClient[endpoint](pollingJobId, apiKey) as Record<string, unknown>;
        const jobStatus = status.status as string;

        // Extract progress info
        const progress = status.progress as Record<string, unknown> | undefined;
        const completed = Number(progress?.completed ?? status.completed ?? 0);
        const total = String(progress?.total ?? status.total ?? '?');
        setPollStatus(`${jobStatus} — ${completed}/${total} pages`);

        // Track crawled URLs from results
        const data = status.data as Array<Record<string, unknown>> | undefined;
        if (data && data.length > 0) {
          const urls = data.map((r) => r.url as string).filter(Boolean);
          setCrawledUrls(urls);
        }

        if (['COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL'].includes(jobStatus)) {
          clearInterval(pollInterval);
          setPollingJobId(null);
          setLoading(false);
          setResult(status);
          setResultTab('json');
          if (jobStatus === 'FAILED') {
            setError(`Crawl failed: ${status.error || 'Unknown error'}`);
          }
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [pollingJobId, apiKey, mode]);

  useEffect(() => {
    setApiKey(localStorage.getItem('xcrawl-api-key') || '');
  }, []);

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

  const handleSubmit = async () => {
    const hasInput = mode === 'search' ? !!searchQuery : !!url;
    if (!hasInput || !apiKey) return;
    setLoading(true);
    setError('');
    setResult(null);
    setPollingJobId(null);
    setPollStatus('');
    setCrawledUrls([]);

    try {
      let res: unknown;
      switch (mode) {
        case 'scrape': {
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
          res = await apiClient.scrape(scrapeBody, apiKey);
          setResult(res as Record<string, unknown>);
          setLoading(false);
          break;
        }
        case 'crawl': {
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
          res = await apiClient.startCrawl(crawlBody, apiKey) as Record<string, unknown>;
          // Start polling for results
          const jobId = (res as Record<string, unknown>).id as string;
          setPollingJobId(jobId);
          setPollStatus('PENDING — Starting crawl...');
          break;
        }
        case 'map':
          res = await apiClient.map({
            url,
            includeSitemap: true,
            search: mapSearch || undefined,
            limit: mapLimit,
          }, apiKey);
          setResult(res as Record<string, unknown>);
          setLoading(false);
          break;
        case 'extract': {
          const extractBody: Record<string, unknown> = { urls: [url] };
          if (extractConfig.prompt) extractBody.prompt = extractConfig.prompt;
          if (extractConfig.schema) {
            try { extractBody.schema = JSON.parse(extractConfig.schema); } catch { /* invalid schema */ }
          }
          res = await apiClient.startExtract(extractBody, apiKey) as Record<string, unknown>;
          setPollingJobId((res as Record<string, unknown>).id as string);
          setPollStatus('PENDING — Starting extraction...');
          break;
        }
        case 'search':
          res = await apiClient.search({
            query: searchQuery || url,
            limit: searchLimit,
            formats: scrapeSettings.formats,
          }, apiKey);
          setResult(res as Record<string, unknown>);
          setLoading(false);
          break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setLoading(false);
    }
  };

  const toggleScrapeFormat = (f: string) => {
    setScrapeSettings((prev) => ({
      ...prev,
      formats: prev.formats.includes(f) ? prev.formats.filter((x) => x !== f) : [...prev.formats, f],
    }));
  };

  const updateScrapeSetting = <K extends keyof ScrapeSettings>(key: K, value: ScrapeSettings[K]) => {
    setScrapeSettings((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCrawlFormat = (f: string) => {
    updateCrawlSetting(
      'formats',
      crawlSettings.formats.includes(f)
        ? crawlSettings.formats.filter((x) => x !== f)
        : [...crawlSettings.formats, f],
    );
  };

  const data = result?.data as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const singleData = data && !Array.isArray(data) ? data : undefined;
  const arrayData = Array.isArray(data) ? data as Record<string, unknown>[] : undefined;
  const markdown = singleData?.markdown as string | undefined;
  const html = singleData?.html as string | undefined;
  const links = (singleData?.links ?? (result?.links as string[] | undefined)) as string[] | undefined;
  // Collect extracted data from scrape (single) or crawl (array of results)
  const extractedData = singleData?.extractedData
    ?? (arrayData?.some(r => r.extractedData) ? arrayData.filter(r => r.extractedData).map(r => ({ url: r.url, extractedData: r.extractedData })) : undefined);
  const screenshotBase64 = singleData?.screenshot as string | undefined;
  // Strip screenshot from JSON display to keep it readable
  const displayResult = result && screenshotBase64
    ? { ...result, data: { ...(singleData ?? {}), screenshot: `[base64 image, ${Math.round((screenshotBase64.length * 3) / 4 / 1024)}KB]` } }
    : result;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Playground</h1>
        <p className="text-muted-foreground mt-1">Test scraping, crawling, and URL discovery.</p>
      </div>

      {/* Mode Selector */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="grid w-full grid-cols-5 max-w-xl">
          <TabsTrigger value="scrape">Scrape</TabsTrigger>
          <TabsTrigger value="crawl">Crawl</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="extract">Extract</TabsTrigger>
        </TabsList>

        {/* URL Input */}
        <Card className="mt-4">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                {mode === 'search' ? (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                ) : (
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  type={mode === 'search' ? 'text' : 'url'}
                  value={mode === 'search' ? searchQuery : url}
                  onChange={(e) => mode === 'search' ? setSearchQuery(e.target.value) : setUrl(e.target.value)}
                  placeholder={mode === 'search' ? 'Search the web...' : 'https://example.com'}
                  className="pl-10"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>
              <Button onClick={handleSubmit} disabled={loading || (mode === 'search' ? !searchQuery : !url) || !apiKey}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
                ) : (
                  <><Play className="h-4 w-4" /> {mode.charAt(0).toUpperCase() + mode.slice(1)}</>
                )}
              </Button>
            </div>

            {/* === SCRAPE OPTIONS === */}
            <TabsContent value="scrape">
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
                        {f === 'images' && <Image className="h-3 w-3" />}
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
            </TabsContent>

            {/* === CRAWL OPTIONS === */}
            <TabsContent value="crawl">
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
            </TabsContent>

            {/* === MAP OPTIONS === */}
            <TabsContent value="map">
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
            </TabsContent>

            {/* === SEARCH OPTIONS === */}
            <TabsContent value="search">
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
            </TabsContent>

            {/* === EXTRACT OPTIONS === */}
            <TabsContent value="extract">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Scrape the URL and extract structured data using your LLM. Configure your LLM API key in Settings.
                </p>
                <ExtractSettings
                  config={extractConfig}
                  onChange={setExtractConfig}
                />
              </div>
            </TabsContent>

            {!apiKey && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                Set your API key in Settings first.
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>

      {/* Polling Status */}
      {pollingJobId && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Crawling in progress...</p>
                <p className="text-xs text-muted-foreground">{pollStatus}</p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">{pollingJobId.slice(0, 10)}</Badge>
            </div>
            {crawledUrls.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Crawled URLs:</p>
                <div className="max-h-32 overflow-auto space-y-0.5">
                  {crawledUrls.map((u) => (
                    <div key={u} className="text-[11px] font-mono text-foreground/70 truncate">{u}</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Result</CardTitle>
              <div className="flex items-center gap-2">
                {typeof result.id === 'string' && (
                  <Badge variant="outline" className="font-mono text-[10px]">{result.id}</Badge>
                )}
                <Badge variant="success">
                  {result.success ? 'Success' : 'Done'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={resultTab} onValueChange={setResultTab}>
              <TabsList>
                <TabsTrigger value="json">JSON</TabsTrigger>
                {markdown && <TabsTrigger value="markdown">Markdown</TabsTrigger>}
                {html && <TabsTrigger value="html">HTML</TabsTrigger>}
                {links && links.length > 0 && <TabsTrigger value="links">Links ({links.length})</TabsTrigger>}
                {!!extractedData && <TabsTrigger value="extracted">Extracted</TabsTrigger>}
              </TabsList>

              <TabsContent value="json">
                <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-auto max-h-125 leading-relaxed">
                  {JSON.stringify(displayResult, null, 2)}
                </pre>
              </TabsContent>

              {markdown && (
                <TabsContent value="markdown">
                  <div className="bg-muted p-4 rounded-lg max-h-125 overflow-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">{markdown}</pre>
                  </div>
                </TabsContent>
              )}

              {html && (
                <TabsContent value="html">
                  <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-auto max-h-125 leading-relaxed">
                    {html}
                  </pre>
                </TabsContent>
              )}

              {links && links.length > 0 && (
                <TabsContent value="links">
                  {/* Action bar for map results */}
                  {(mode === 'map' || links.length > 1) && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedMapUrls(new Set(links))}
                        className="text-xs h-7"
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedMapUrls(new Set())}
                        className="text-xs h-7"
                      >
                        Deselect All
                      </Button>
                      {selectedMapUrls.size > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">{selectedMapUrls.size} selected</span>
                          <div className="flex-1" />
                          <Button
                            size="sm"
                            onClick={() => {
                              setUrl(Array.from(selectedMapUrls)[0]);
                              setMode('crawl');
                              setResult(null);
                            }}
                            className="text-xs h-7"
                          >
                            Crawl First URL
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              if (!apiKey) return;
                              setLoading(true);
                              setError('');
                              try {
                                const res = await apiClient.startBatch(
                                  { urls: Array.from(selectedMapUrls), formats: scrapeSettings.formats },
                                  apiKey,
                                ) as Record<string, unknown>;
                                setPollingJobId(res.id as string);
                                setPollStatus('PENDING — Starting batch scrape...');
                                setMode('scrape');
                              } catch (e) {
                                setError(e instanceof Error ? e.message : 'Batch scrape failed');
                                setLoading(false);
                              }
                            }}
                            className="text-xs h-7"
                          >
                            Batch Scrape ({selectedMapUrls.size})
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  <div className="bg-muted p-4 rounded-lg max-h-125 overflow-auto space-y-0.5">
                    {links.map((link) => (
                      <div key={link} className="flex items-center gap-2 text-xs font-mono">
                        {(mode === 'map' || links.length > 1) && (
                          <input
                            type="checkbox"
                            checked={selectedMapUrls.has(link)}
                            onChange={(e) => {
                              const next = new Set(selectedMapUrls);
                              if (e.target.checked) next.add(link);
                              else next.delete(link);
                              setSelectedMapUrls(next);
                            }}
                            className="rounded border-border shrink-0"
                          />
                        )}
                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                          {link}
                        </a>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}

              {/* Extracted data tab */}
              {!!extractedData && (
                <TabsContent value="extracted">
                  <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-auto max-h-125 leading-relaxed">
                    {JSON.stringify(extractedData, null, 2)}
                  </pre>
                </TabsContent>
              )}
            </Tabs>

            {/* Screenshot render */}
            {screenshotBase64 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Screenshot</p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <img
                    src={`data:image/png;base64,${screenshotBase64}`}
                    alt="Page screenshot"
                    className="w-full h-auto"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
