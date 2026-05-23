'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, CalendarClock, Play, Pause, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface Schedule {
  id: string;
  name: string;
  type: string;
  cron: string;
  active: boolean;
  config: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  enableChangeDetection: boolean;
  createdAt: string;
}

const cronPresets = [
  { label: 'Every 15 min', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily (midnight)', value: '0 0 * * *' },
  { label: 'Weekly (Monday)', value: '0 0 * * 1' },
];

export default function SchedulesPage() {
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('xcrawl-api-key') || '' : '',
  );
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [type, setType] = useState<'SCRAPE' | 'CRAWL'>('CRAWL');
  const [cron, setCron] = useState('0 */6 * * *');
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(10);
  const [changeDetection, setChangeDetection] = useState(false);

  const loadSchedules = useCallback((key: string) => {
    setLoading(true);
    apiClient
      .listSchedules(key)
      .then((res) => setSchedules(res as Schedule[]))
      .catch((err) => console.error('Failed to load schedules:', err))
      .finally(() => setLoading(false));
  }, []);

  // Async load on mount when key present — not derived state.
  useEffect(() => {
    if (apiKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSchedules(apiKey);
    } else {
      setLoading(false);
    }
  }, [apiKey, loadSchedules]);

  const handleCreate = async () => {
    if (!name || !url || !apiKey) return;
    const config: Record<string, unknown> = { url, formats: ['markdown'] };
    if (type === 'CRAWL') config.maxPages = maxPages;

    try {
      await apiClient.createSchedule({
        name, type, cron, config,
        enableChangeDetection: changeDetection,
      }, apiKey);

      setName(''); setUrl(''); setShowCreate(false);
      loadSchedules(apiKey);
      toast.success('Schedule created');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create schedule';
      toast.error(msg);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await apiClient.toggleSchedule(id, apiKey);
      loadSchedules(apiKey);
      toast.success('Schedule updated');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update schedule';
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteSchedule(id, apiKey);
      loadSchedules(apiKey);
      toast.success('Schedule deleted');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete schedule';
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedules</h1>
          <p className="text-muted-foreground mt-1">Set up recurring crawl/scrape jobs with change detection.</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" /> New Schedule
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Schedule</CardTitle>
            <CardDescription>Configure a recurring crawl or scrape job.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily docs crawl" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">URL</label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="h-8 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
                <select value={type} onChange={(e) => setType(e.target.value as 'SCRAPE' | 'CRAWL')} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs">
                  <option value="CRAWL">Crawl</option>
                  <option value="SCRAPE">Scrape</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Frequency</label>
                <select value={cron} onChange={(e) => setCron(e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs">
                  {cronPresets.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              {type === 'CRAWL' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Max Pages</label>
                  <Input type="number" min={1} value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value) || 10)} className="h-8 text-xs" />
                </div>
              )}
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={changeDetection} onChange={(e) => setChangeDetection(e.target.checked)} className="rounded border-border" />
                  Change detection
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!name || !url}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedules List */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Frequency</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Run</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Runs</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No schedules yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Create one to run recurring crawls automatically.</p>
                  </td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-48">
                        {(s.config.url as string) || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-[10px]">{s.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-muted-foreground">{s.cron}</code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={s.active ? 'success' : 'secondary'}>
                          {s.active ? 'Active' : 'Paused'}
                        </Badge>
                        {s.enableChangeDetection && (
                          <Badge variant="outline" className="text-[9px]">
                            <RefreshCw className="h-2.5 w-2.5 mr-0.5" />CD
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.lastRunAt ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(s.lastRunAt)}
                        </div>
                      ) : 'Never'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-xs">{s.runCount}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleToggle(s.id)} className="h-7 px-2">
                          {s.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="h-7 px-2 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
