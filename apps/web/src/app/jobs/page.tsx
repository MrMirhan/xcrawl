'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, ExternalLink, Loader2, Inbox, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { formatDate, truncateUrl } from '@/lib/utils';

interface Job {
  id: string;
  type: string;
  status: string;
  url?: string;
  resultCount: number;
  createdAt: string;
}

const statusVariant: Record<string, BadgeProps['variant']> = {
  COMPLETED: 'success',
  RUNNING: 'default',
  FAILED: 'destructive',
  PENDING: 'warning',
  CANCELLED: 'secondary',
  PARTIAL: 'outline',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const polling = jobs.some((j) => j.status === 'RUNNING' || j.status === 'PENDING');

  const loadJobs = useCallback(async (showSpinner = true) => {
    const apiKey = localStorage.getItem('xcrawl-api-key') || '';
    if (!apiKey) { setLoading(false); return; }

    if (showSpinner) setLoading(true);
    try {
      const res = await apiClient.listJobs('page=1&limit=50', apiKey);
      setJobs((res as { data: Job[] }).data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial async load on mount — not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJobs();
  }, [loadJobs]);

  // Auto-poll: refetch every 3s while running/pending jobs exist
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => loadJobs(false), 3000);
    return () => clearInterval(interval);
  }, [polling, loadJobs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-1">
            View all scrape, crawl, and extraction jobs.
            {polling && <span className="text-primary ml-2 text-xs">(Auto-refreshing...)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {jobs.some((j) => j.status === 'RUNNING' || j.status === 'PENDING') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                const apiKey = localStorage.getItem('xcrawl-api-key') || '';
                await apiClient.cancelAllJobs(apiKey);
                loadJobs();
              }}
            >
              <XCircle className="h-4 w-4" />
              Cancel All
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => loadJobs()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-16 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-16 text-center">
                    <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No jobs yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Try scraping something in the <Link href="/playground" className="text-primary hover:underline">Playground</Link>.</p>
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Link href={`/jobs/${job.id}`} className="text-primary hover:underline font-mono text-xs inline-flex items-center gap-1">
                        {job.id.slice(0, 10)}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{job.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[job.status] || 'outline'}>
                        {job.status === 'RUNNING' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="text-xs text-muted-foreground truncate block">{job.url ? truncateUrl(job.url) : '\u2014'}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{job.resultCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(job.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
