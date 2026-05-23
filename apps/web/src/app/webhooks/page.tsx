'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Webhook, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface WebhookData {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

const allEvents = ['job.completed', 'job.failed', 'crawl.page', 'crawl.started', 'crawl.completed'];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [events, setEvents] = useState(['job.completed']);
  const [apiKey] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('xcrawl-api-key') || '' : '',
  );

  const loadWebhooks = useCallback((key: string) => {
    if (key) {
      apiClient.listWebhooks(key).then((res) => setWebhooks(res as WebhookData[])).catch(console.error);
    }
  }, []);

  // Async load on mount — not derived state.
  useEffect(() => {
    loadWebhooks(apiKey);
  }, [apiKey, loadWebhooks]);

  const handleCreate = async () => {
    if (!newUrl || !apiKey) return;
    await apiClient.createWebhook({ url: newUrl, events }, apiKey);
    setNewUrl('');
    loadWebhooks(apiKey);
  };

  const handleDelete = async (id: string) => {
    await apiClient.deleteWebhook(id, apiKey);
    loadWebhooks(apiKey);
  };

  const toggleEvent = (e: string) => {
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
        <p className="text-muted-foreground mt-1">Receive real-time notifications for job events.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Webhook</CardTitle>
          <CardDescription>Configure an endpoint to receive POST notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={!newUrl || !apiKey}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {allEvents.map((e) => (
              <button
                key={e}
                onClick={() => toggleEvent(e)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                  events.includes(e)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Bell className="h-3 w-3" />
                {e}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">URL</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Events</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <Webhook className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No webhooks configured.</p>
                  </td>
                </tr>
              ) : (
                webhooks.map((wh) => (
                  <tr key={wh.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-muted-foreground">{wh.url}</code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {wh.events.map((e) => (
                          <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(wh.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(wh.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
