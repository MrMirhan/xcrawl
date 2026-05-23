'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { apiClient, type CrawlStatusResponse, type BatchStatusResponse, type ExtractStatusResponse } from '@/lib/api-client';
import type { ScrapeResult } from '@xcrawl/shared';
import { ScrapeMode } from './_components/scrape-mode';
import { CrawlMode } from './_components/crawl-mode';
import { MapMode } from './_components/map-mode';
import { ExtractMode } from './_components/extract-mode';
import { SearchMode } from './_components/search-mode';
import { defaultScrapeSettings, type PlaygroundMode, type PlaygroundResult, type ScrapeSettings } from './_components/types';

type JobLikeResponse = CrawlStatusResponse | BatchStatusResponse | ExtractStatusResponse;

export default function PlaygroundPage() {
  const toast = useToast();
  const [mode, setMode] = useState<PlaygroundMode>('scrape');
  const [url, setUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [scrapeSettings, setScrapeSettings] = useState<ScrapeSettings>({ ...defaultScrapeSettings });

  // Map integration state
  const [selectedMapUrls, setSelectedMapUrls] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState('');
  const [resultTab, setResultTab] = useState('json');
  const [apiKey] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('xcrawl-api-key') || '' : '',
  );
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState('');
  const [crawledUrls, setCrawledUrls] = useState<string[]>([]);

  const resetResultState = () => {
    setPollingJobId(null);
    setPollStatus('');
    setCrawledUrls([]);
  };

  // Poll for async job results (crawl, batch, extract)
  useEffect(() => {
    if (!pollingJobId || !apiKey) return;

    const pollInterval = setInterval(async () => {
      try {
        const status: JobLikeResponse =
          mode === 'crawl'
            ? await apiClient.getCrawlStatus(pollingJobId, apiKey)
            : mode === 'extract'
              ? await apiClient.getExtractStatus(pollingJobId, apiKey)
              : await apiClient.getBatchStatus(pollingJobId, apiKey);
        const jobStatus = status.status;

        // Extract progress info
        const completed = 'progress' in status
          ? status.progress.completed
          : status.completed;
        const total = 'progress' in status
          ? status.progress.total
          : status.total;
        setPollStatus(`${jobStatus} — ${completed}/${total} pages`);

        // Track crawled URLs from results
        if (status.data && status.data.length > 0) {
          const urls = status.data.map((r) => r.url).filter(Boolean);
          setCrawledUrls(urls);
        }

        if (['COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL'].includes(jobStatus)) {
          clearInterval(pollInterval);
          setPollingJobId(null);
          setLoading(false);
          setResult(status);
          setResultTab('json');
          if (jobStatus === 'FAILED') {
            const errMsg = `Crawl failed: ${'error' in status && typeof status.error === 'string' ? status.error : 'Unknown error'}`;
            setError(errMsg);
            toast.error(errMsg);
          } else if (jobStatus === 'COMPLETED') {
            toast.success(`${mode.charAt(0).toUpperCase() + mode.slice(1)} completed`);
          }
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [pollingJobId, apiKey, mode, toast]);

  // Narrow result to ScrapeResult-shaped single data (scrape mode)
  const singleData: ScrapeResult | undefined =
    result && 'data' in result && result.data && !Array.isArray(result.data)
      ? (result.data as ScrapeResult)
      : undefined;
  // Narrow to array-shaped data (search/crawl/batch/extract poll responses)
  const arrayData: ReadonlyArray<{ url: string; extractedData?: unknown }> | undefined =
    result && 'data' in result && Array.isArray(result.data)
      ? (result.data as ReadonlyArray<{ url: string; extractedData?: unknown }>)
      : undefined;
  const markdown = singleData?.markdown;
  const html = singleData?.html;
  // Map response carries top-level links; scrape carries them inside data
  const topLevelLinks: string[] | undefined =
    result && 'links' in result && Array.isArray((result as { links?: unknown }).links)
      ? (result as { links: string[] }).links
      : undefined;
  const links = singleData?.links ?? topLevelLinks;
  // Collect extracted data from scrape (single) or crawl (array of results)
  const extractedData =
    singleData?.extractedData
    ?? (arrayData?.some((r) => r.extractedData)
      ? arrayData.filter((r) => r.extractedData).map((r) => ({ url: r.url, extractedData: r.extractedData }))
      : undefined);
  const screenshotBase64 = singleData?.screenshot;
  // Strip screenshot from JSON display to keep it readable
  const displayResult = result && screenshotBase64 && singleData
    ? { ...result, data: { ...singleData, screenshot: `[base64 image, ${Math.round((screenshotBase64.length * 3) / 4 / 1024)}KB]` } }
    : result;

  const sharedModeProps = {
    apiKey,
    loading,
    setLoading,
    setResult,
    setError,
    resetResultState,
    toast,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Playground</h1>
        <p className="text-muted-foreground mt-1">Test scraping, crawling, and URL discovery.</p>
      </div>

      {/* Mode Selector */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as PlaygroundMode)}>
        <TabsList className="grid w-full grid-cols-5 max-w-xl">
          <TabsTrigger value="scrape">Scrape</TabsTrigger>
          <TabsTrigger value="crawl">Crawl</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="extract">Extract</TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="p-4 space-y-4">
            <TabsContent value="scrape">
              <ScrapeMode
                {...sharedModeProps}
                url={url}
                setUrl={setUrl}
                scrapeSettings={scrapeSettings}
                setScrapeSettings={setScrapeSettings}
              />
            </TabsContent>

            <TabsContent value="crawl">
              <CrawlMode
                {...sharedModeProps}
                url={url}
                setUrl={setUrl}
                setPollingJobId={setPollingJobId}
                setPollStatus={setPollStatus}
              />
            </TabsContent>

            <TabsContent value="map">
              <MapMode
                {...sharedModeProps}
                url={url}
                setUrl={setUrl}
              />
            </TabsContent>

            <TabsContent value="search">
              <SearchMode
                {...sharedModeProps}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                url={url}
                scrapeSettings={scrapeSettings}
                setScrapeSettings={setScrapeSettings}
              />
            </TabsContent>

            <TabsContent value="extract">
              <ExtractMode
                {...sharedModeProps}
                url={url}
                setUrl={setUrl}
                setPollingJobId={setPollingJobId}
                setPollStatus={setPollStatus}
              />
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
                {'id' in result && typeof result.id === 'string' && (
                  <Badge variant="outline" className="font-mono text-[10px]">{result.id}</Badge>
                )}
                <Badge variant="success">
                  {'success' in result && result.success ? 'Success' : 'Done'}
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
                                );
                                setPollingJobId(res.id);
                                setPollStatus('PENDING — Starting batch scrape...');
                                setMode('scrape');
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : 'Batch scrape failed';
                                setError(msg);
                                toast.error(msg);
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
                  {/* Data-URL screenshot with unknown dimensions; next/image needs static size. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
