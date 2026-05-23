'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Clock, FileText, Download, XCircle,
  ExternalLink, Code, Link2, Image as ImageIcon, Eye,
} from 'lucide-react';
import JSZip from 'jszip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import type { JobDetails, JobResultRecord } from '@xcrawl/shared';

interface CrawlConfig {
  maxPages?: number;
  [key: string]: unknown;
}

const statusVariant: Record<string, BadgeProps['variant']> = {
  COMPLETED: 'success',
  RUNNING: 'default',
  FAILED: 'destructive',
  PENDING: 'warning',
  CANCELLED: 'secondary',
  PARTIAL: 'warning',
};

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const toast = useToast();
  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState('results');
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [resultViewMode, setResultViewMode] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState(false);

  const [storedApiKey] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('xcrawl-api-key') || '' : '',
  );

  const loadJob = useCallback(async (key: string) => {
    if (!key || !id) return;
    try {
      const res = await apiClient.getJob(id, key);
      setJob(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Async load on mount + dependency changes — not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedApiKey) loadJob(storedApiKey);
    else setLoading(false);
  }, [storedApiKey, loadJob]);

  // Live polling for running/pending jobs
  useEffect(() => {
    if (!job || !storedApiKey) return;
    if (!['RUNNING', 'PENDING'].includes(job.status)) return;

    const interval = setInterval(() => loadJob(storedApiKey), 2000);
    return () => clearInterval(interval);
  }, [job, storedApiKey, loadJob]);

  const handleCancel = async () => {
    if (!storedApiKey || !id) return;
    setCancelling(true);
    try {
      await apiClient.cancelCrawl(id, storedApiKey);
      await loadJob(storedApiKey);
      toast.success('Job cancelled');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to cancel job';
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  const [downloadMode, setDownloadMode] = useState<string | null>(null);

  const safeName = (url: string) =>
    url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 60);

  const handleDownloadAll = async (format: string) => {
    if (!job) return;
    const jobResults = job.results ?? [];
    setDownloadMode(null);

    if (format === 'zip') {
      const zip = new JSZip();

      // data.json — full job data
      zip.file('data.json', JSON.stringify({
        job: { id, type: job.type, status: job.status, url: job.url, createdAt: job.createdAt },
        results: jobResults,
      }, null, 2));

      // crawled_urls.txt
      zip.file('crawled_urls.txt', jobResults.map((r) => r.url).filter(Boolean).join('\n'));

      // all_links.txt (deduplicated)
      const allLinks = new Set<string>();
      jobResults.forEach((r) => {
        r.links?.forEach((l) => allLinks.add(l));
      });
      if (allLinks.size > 0) zip.file('all_links.txt', Array.from(allLinks).join('\n'));

      // all_images.txt (deduplicated)
      const allImages = new Set<string>();
      jobResults.forEach((r) => {
        r.images?.forEach((img) => allImages.add(img));
      });
      if (allImages.size > 0) zip.file('all_images.txt', Array.from(allImages).join('\n'));

      // Per-page folders
      const markdownFolder = zip.folder('markdown');
      const htmlFolder = zip.folder('html');
      const textFolder = zip.folder('text');
      const imagesFolder = zip.folder('images');

      jobResults.forEach((r, i) => {
        const name = safeName(r.url || `page_${i}`);
        if (r.markdown && r.markdown.length > 0) {
          markdownFolder?.file(`${name}.md`, r.markdown);
        }
        if (r.html && r.html.length > 0) {
          htmlFolder?.file(`${name}.html`, r.html);
        }
        if (r.text && r.text.length > 0) {
          textFolder?.file(`${name}.txt`, r.text);
        }
        if (r.images && r.images.length > 0) {
          imagesFolder?.file(`${name}.txt`, r.images.join('\n'));
        }
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xcrawl-${id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    switch (format) {
      case 'json':
        downloadJson({
          job: { id, type: job.type, status: job.status, url: job.url, createdAt: job.createdAt },
          results: jobResults,
        }, `xcrawl-${id}.json`);
        break;
      case 'markdown': {
        const allMd = jobResults
          .filter((r) => r.markdown !== null)
          .map((r) => `# ${r.url}\n\n${r.markdown}`)
          .join('\n\n---\n\n');
        downloadText(allMd || 'No markdown content', `xcrawl-${id}.md`);
        break;
      }
      case 'html': {
        const allHtml = jobResults
          .filter((r) => r.html !== null)
          .map((r) => `<!-- ${r.url} -->\n${r.html}`)
          .join('\n\n');
        downloadText(allHtml || 'No HTML content', `xcrawl-${id}.html`);
        break;
      }
      case 'text': {
        const allText = jobResults
          .filter((r) => r.text !== null)
          .map((r) => `=== ${r.url} ===\n\n${r.text}`)
          .join('\n\n---\n\n');
        downloadText(allText || 'No text content', `xcrawl-${id}.txt`);
        break;
      }
      case 'links': {
        const allLinks = new Set<string>();
        jobResults.forEach((r) => {
          r.links?.forEach((l) => allLinks.add(l));
        });
        downloadText(Array.from(allLinks).join('\n'), `xcrawl-${id}_links.txt`);
        break;
      }
      case 'images': {
        const allImages = new Set<string>();
        jobResults.forEach((r) => {
          r.images?.forEach((img) => allImages.add(img));
        });
        downloadText(Array.from(allImages).join('\n'), `xcrawl-${id}_images.txt`);
        break;
      }
      case 'urls': {
        const urls = jobResults.map((r) => r.url).filter(Boolean);
        downloadText(urls.join('\n'), `xcrawl-${id}_urls.txt`);
        break;
      }
    }
  };

  const handleDownloadResult = (result: JobResultRecord, format: string) => {
    const url = result.url || 'result';
    const safeName = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);

    switch (format) {
      case 'markdown':
        downloadText(result.markdown ?? '', `${safeName}.md`);
        break;
      case 'html':
        downloadText(result.html ?? '', `${safeName}.html`);
        break;
      case 'rawHtml':
        downloadText(result.rawHtml ?? '', `${safeName}.raw.html`);
        break;
      case 'text':
        downloadText(result.text ?? '', `${safeName}.txt`);
        break;
      case 'json':
        downloadJson(result, `${safeName}.json`);
        break;
      case 'links':
        downloadText((result.links ?? []).join('\n'), `${safeName}_links.txt`);
        break;
      case 'images':
        downloadText((result.images ?? []).join('\n'), `${safeName}_images.txt`);
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Job not found</p>
        <Link href="/jobs"><Button variant="outline" className="mt-4">Back to Jobs</Button></Link>
      </div>
    );
  }

  const status = job.status;
  const type = job.type;
  const results = job.results ?? [];
  const resultCount = job._count?.results ?? results.length;
  const isRunning = ['RUNNING', 'PENDING'].includes(status);
  const config = job.config as CrawlConfig | null | undefined;
  const maxPages = config?.maxPages ?? 0;

  // Detect available formats across all results
  const availableFormats = new Set<string>();
  for (const r of results) {
    if (r.markdown) availableFormats.add('markdown');
    if (r.html) availableFormats.add('html');
    if (r.rawHtml) availableFormats.add('rawHtml');
    if (r.text) availableFormats.add('text');
    if (r.links && r.links.length > 0) availableFormats.add('links');
    if (r.images && r.images.length > 0) availableFormats.add('images');
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-3 w-3" /> Back to Jobs
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono">{id.slice(0, 14)}</h1>
            <Badge variant={statusVariant[status] || 'outline'}>
              {isRunning && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {status}
            </Badge>
            <Badge variant="secondary">{type}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelling}>
                <XCircle className="h-3 w-3" /> {cancelling ? 'Cancelling...' : 'Cancel'}
              </Button>
            )}
            {results.length > 0 && (
              <div className="relative">
                <Button variant="outline" size="sm" onClick={() => setDownloadMode(downloadMode ? null : 'show')}>
                  <Download className="h-3 w-3" /> Download All
                </Button>
                {downloadMode === 'show' && (
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg p-1 z-50 min-w-40">
                    <button
                      onClick={() => handleDownloadAll('zip')}
                      className="block w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-muted rounded cursor-pointer"
                    >
                      All (ZIP)
                    </button>
                    <div className="border-t border-border my-1" />
                    {[
                      ['json', 'Full JSON'],
                      ['markdown', 'All Markdown (.md)'],
                      ['html', 'All HTML'],
                      ['text', 'All Text (.txt)'],
                      ['links', 'All Links'],
                      ['images', 'All Images'],
                      ['urls', 'Crawled URLs'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => handleDownloadAll(key)}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar for running jobs */}
        {isRunning && maxPages > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{resultCount} / {maxPages} pages crawled</span>
              <span>{Math.round((resultCount / maxPages) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, (resultCount / maxPages) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDate(job.createdAt)}</span>
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {resultCount} results</span>
          {availableFormats.size > 0 && (
            <span className="flex items-center gap-1">
              Formats: {Array.from(availableFormats).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <Tabs value={viewTab} onValueChange={setViewTab}>
        <TabsList>
          <TabsTrigger value="results">Results ({resultCount})</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <div className="space-y-3">
            {results.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  {isRunning ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <p>Crawling in progress... Results will appear here.</p>
                    </div>
                  ) : (
                    'No results.'
                  )}
                </CardContent>
              </Card>
            ) : (
              results.map((result, i) => {
                const resultId = result.id || String(i);
                const isExpanded = expandedResult === resultId;
                const currentView = resultViewMode[resultId] || 'markdown';

                // Determine what formats this result has
                const hasMarkdown = !!result.markdown && result.markdown.length > 0;
                const hasHtml = !!result.html && result.html.length > 0;
                const hasText = !!result.text && result.text.length > 0;
                const hasLinks = !!result.links && result.links.length > 0;
                const hasImages = !!result.images && result.images.length > 0;

                return (
                  <Card key={resultId}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CardTitle className="text-sm font-mono truncate">
                            {result.url}
                          </CardTitle>
                          <a href={result.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {typeof result.statusCode === 'number' && (
                            <Badge variant="outline" className="text-[10px]">{result.statusCode}</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedResult(isExpanded ? null : resultId)}
                            className="h-7 px-2"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadResult(result, currentView)}
                            className="h-7 px-2"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Format indicator badges */}
                      <div className="flex gap-1 mt-1">
                        {hasMarkdown && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">MD</Badge>}
                        {hasHtml && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">HTML</Badge>}
                        {hasText && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">TXT</Badge>}
                        {hasLinks && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{result.links?.length ?? 0} links</Badge>}
                        {hasImages && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{result.images?.length ?? 0} imgs</Badge>}
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent>
                        {/* Format switcher */}
                        <div className="flex gap-1 mb-3 flex-wrap">
                          {hasMarkdown && (
                            <button onClick={() => setResultViewMode({ ...resultViewMode, [resultId]: 'markdown' })}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer ${currentView === 'markdown' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                              <FileText className="h-3 w-3" /> Markdown
                            </button>
                          )}
                          {hasHtml && (
                            <button onClick={() => setResultViewMode({ ...resultViewMode, [resultId]: 'html' })}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer ${currentView === 'html' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                              <Code className="h-3 w-3" /> HTML
                            </button>
                          )}
                          {hasText && (
                            <button onClick={() => setResultViewMode({ ...resultViewMode, [resultId]: 'text' })}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer ${currentView === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                              Text
                            </button>
                          )}
                          {hasLinks && (
                            <button onClick={() => setResultViewMode({ ...resultViewMode, [resultId]: 'links' })}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer ${currentView === 'links' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                              <Link2 className="h-3 w-3" /> Links
                            </button>
                          )}
                          {hasImages && (
                            <button onClick={() => setResultViewMode({ ...resultViewMode, [resultId]: 'images' })}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer ${currentView === 'images' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                              <ImageIcon className="h-3 w-3" /> Images
                            </button>
                          )}
                          <button onClick={() => setResultViewMode({ ...resultViewMode, [resultId]: 'json' })}
                            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium cursor-pointer ${currentView === 'json' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                            JSON
                          </button>
                        </div>

                        {/* Content based on selected format */}
                        {currentView === 'markdown' && hasMarkdown && (
                          <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-auto max-h-80 whitespace-pre-wrap leading-relaxed">
                            {result.markdown}
                          </pre>
                        )}
                        {currentView === 'html' && hasHtml && (
                          <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-auto max-h-80 leading-relaxed">
                            {result.html}
                          </pre>
                        )}
                        {currentView === 'text' && hasText && (
                          <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-80 whitespace-pre-wrap leading-relaxed">
                            {result.text}
                          </pre>
                        )}
                        {currentView === 'links' && hasLinks && (
                          <div className="bg-muted p-3 rounded-lg max-h-80 overflow-auto space-y-0.5">
                            {result.links?.map((link) => (
                              <div key={link} className="text-xs font-mono">
                                <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                  {link}
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                        {currentView === 'images' && hasImages && (
                          <div className="bg-muted p-3 rounded-lg max-h-80 overflow-auto space-y-0.5">
                            {result.images?.map((img) => (
                              <div key={img} className="text-xs font-mono">
                                <a href={img} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                  {img}
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                        {currentView === 'json' && (
                          <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-auto max-h-80 leading-relaxed">
                            {JSON.stringify(result, null, 2)}
                          </pre>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardContent className="p-4">
              <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-auto max-h-96 leading-relaxed">
                {JSON.stringify(job.config, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}