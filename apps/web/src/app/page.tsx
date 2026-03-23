'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, CheckCircle, XCircle, Zap, ArrowRight, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

interface Stats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
}

const statCards = [
  { key: 'total' as const, label: 'Total Jobs', icon: Zap, color: 'text-primary' },
  { key: 'running' as const, label: 'Running', icon: Activity, color: 'text-blue-500' },
  { key: 'completed' as const, label: 'Completed', icon: CheckCircle, color: 'text-emerald-500' },
  { key: 'failed' as const, label: 'Failed', icon: XCircle, color: 'text-destructive' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const key = localStorage.getItem('xcrawl-api-key') || '';
    setApiKey(key);
    if (key) {
      apiClient.getJobStats(key).then((res) => setStats(res as Stats)).catch(console.error);
    }
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Monitor your crawling activity and performance.</p>
      </div>

      {/* No API Key Banner */}
      {!apiKey && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Get started with XCrawl</p>
                <p className="text-xs text-muted-foreground">Create an API key to start crawling.</p>
              </div>
            </div>
            <Link href="/api-keys">
              <Button size="sm">
                Create API Key <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold mt-1 tabular-nums">
                    {stats ? stats[key] : '\u2014'}
                  </p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Success Rate */}
      {stats && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Success Rate</p>
              <p className="text-2xl font-bold tabular-nums">{stats.successRate}%</p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${stats.successRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Start */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Start</CardTitle>
            <CardDescription>Get started with XCrawl in 3 steps</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
              <p className="text-sm">Create an API key in the <Link href="/api-keys" className="text-primary font-medium hover:underline">API Keys</Link> page</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</div>
              <p className="text-sm">Set it in <Link href="/settings" className="text-primary font-medium hover:underline">Settings</Link></p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</div>
              <p className="text-sm">Try scraping a URL in the <Link href="/playground" className="text-primary font-medium hover:underline">Playground</Link></p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">API Usage</CardTitle>
            <CardDescription>Scrape any URL with a single cURL command</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
{`curl -X POST http://localhost:3001/api/v1/scrape \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{
    "url": "https://example.com",
    "formats": ["markdown", "links"]
  }'`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
