'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Globe, Upload, CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<string[]>([]);
  const [newProxy, setNewProxy] = useState('');
  const [batchText, setBatchText] = useState('');
  const [showBatch, setShowBatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [proxyStatus, setProxyStatus] = useState<Record<string, 'testing' | 'ok' | 'fail'>>({});
  const [testingAll, setTestingAll] = useState(false);

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (t) loadProxies(t);
  }, []);

  const loadProxies = async (t: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/settings`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProxies(data.proxyUrls || []);
      }
    } catch { /* */ }
  };

  const saveProxies = async (newList: string[]) => {
    if (!token) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/v1/user/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proxyUrls: newList }),
      });
      setProxies(newList);
    } catch { /* */ }
    setSaving(false);
  };

  const handleAdd = () => {
    if (!newProxy || proxies.includes(newProxy)) return;
    saveProxies([...proxies, newProxy]);
    setNewProxy('');
  };

  const handleRemove = (url: string) => {
    saveProxies(proxies.filter((p) => p !== url));
  };

  const handleBatchAdd = () => {
    const urls = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && (l.startsWith('http://') || l.startsWith('https://') || l.startsWith('socks')));

    if (urls.length === 0) return;
    const merged = [...new Set([...proxies, ...urls])];
    saveProxies(merged);
    setBatchText('');
    setShowBatch(false);
  };

  const handleClearAll = () => {
    saveProxies([]);
    setProxyStatus({});
  };

  const testProxy = async (proxyUrl: string) => {
    if (!token) return;
    setProxyStatus((prev) => ({ ...prev, [proxyUrl]: 'testing' }));
    try {
      const res = await fetch(`${API_BASE}/api/v1/proxies/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: proxyUrl }),
      });
      const data = await res.json() as { success: boolean };
      setProxyStatus((prev) => ({ ...prev, [proxyUrl]: data.success ? 'ok' : 'fail' }));
    } catch {
      setProxyStatus((prev) => ({ ...prev, [proxyUrl]: 'fail' }));
    }
  };

  const testAllProxies = async () => {
    setTestingAll(true);
    for (const proxy of proxies) {
      await testProxy(proxy);
    }
    setTestingAll(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Proxies</h1>
        <p className="text-muted-foreground mt-1">
          Your personal proxy list for anti-blocking. These are used when scraping and crawling.
        </p>
      </div>

      {/* Add single proxy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Proxy</CardTitle>
          <CardDescription>HTTP, HTTPS, or SOCKS5 proxy URLs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newProxy}
              onChange={(e) => setNewProxy(e.target.value)}
              placeholder="http://user:pass@host:port"
              className="font-mono text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={!newProxy || saving}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowBatch(!showBatch)}>
              <Upload className="h-3 w-3" /> {showBatch ? 'Hide' : 'Batch Import'}
            </Button>
            {proxies.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleClearAll} className="text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3" /> Clear All
              </Button>
            )}
          </div>

          {/* Batch import textarea */}
          {showBatch && (
            <div className="space-y-2">
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={`Paste proxy URLs, one per line:\nhttp://user:pass@proxy1.com:8080\nhttp://user:pass@proxy2.com:8080\nsocks5://user:pass@proxy3.com:1080`}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-28"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleBatchAdd} disabled={!batchText.trim() || saving}>
                  Import {batchText.split('\n').filter((l) => l.trim()).length} proxies
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setBatchText(''); setShowBatch(false); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proxy list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Your Proxies</CardTitle>
            <div className="flex items-center gap-2">
              {proxies.length > 0 && (
                <Button variant="outline" size="sm" onClick={testAllProxies} disabled={testingAll} className="h-7">
                  {testingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                  {testingAll ? 'Testing...' : 'Test All'}
                </Button>
              )}
              <Badge variant="secondary">{proxies.length} total</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {proxies.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Globe className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No proxies configured.</p>
              <p className="text-xs text-muted-foreground mt-1">Add proxies above or use batch import for multiple at once.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {proxies.map((proxy, i) => {
                // Parse proxy for display
                let display = proxy;
                let protocol = 'HTTP';
                try {
                  if (proxy.startsWith('socks')) protocol = 'SOCKS5';
                  else if (proxy.startsWith('https')) protocol = 'HTTPS';
                  // Mask password if present
                  const url = new URL(proxy);
                  if (url.password) {
                    display = proxy.replace(`:${url.password}@`, ':***@');
                  }
                } catch { /* invalid URL, show as-is */ }

                return (
                  <div key={`${proxy}-${i}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary" className="text-[9px] shrink-0">{protocol}</Badge>
                      <code className="text-xs font-mono text-muted-foreground truncate">{display}</code>
                      {proxyStatus[proxy] === 'ok' && <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />}
                      {proxyStatus[proxy] === 'fail' && <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                      {proxyStatus[proxy] === 'testing' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testProxy(proxy)}
                        disabled={proxyStatus[proxy] === 'testing'}
                        className="h-7 px-2"
                      >
                        <Wifi className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(proxy)}
                        className="h-7 px-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
