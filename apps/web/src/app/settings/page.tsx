'use client';

import { useState, useEffect } from 'react';
import { Check, ExternalLink, Key, BookOpen, Sparkles, Search, Loader2, Wifi, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UserSettings {
  proxyUrls: string[];
  llmProvider?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  searxngUrl?: string;
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Per-user settings
  const [settings, setSettings] = useState<UserSettings>({
    proxyUrls: [],
    llmProvider: 'openai',
    llmApiKey: '',
    llmModel: 'gpt-4o-mini',
    llmBaseUrl: '',
    searxngUrl: '',
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [llmTest, setLlmTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [llmTestMsg, setLlmTestMsg] = useState('');

  useEffect(() => {
    setApiKey(localStorage.getItem('xcrawl-api-key') || '');
    const t = getToken();
    setToken(t);
    if (t) loadSettings(t);
  }, []);

  const loadSettings = async (t: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/settings`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings({
          proxyUrls: data.proxyUrls || [],
          llmProvider: data.llmProvider || 'openai',
          llmApiKey: data.llmApiKey || '',
          llmModel: data.llmModel || 'gpt-4o-mini',
          llmBaseUrl: data.llmBaseUrl || '',
          searxngUrl: data.searxngUrl || '',
        });
      }
    } catch { /* not logged in */ }
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('xcrawl-api-key', apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testLlmConnection = async () => {
    setLlmTest('testing');
    setLlmTestMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/test-llm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          baseUrl: settings.llmBaseUrl,
          apiKey: settings.llmApiKey,
          model: settings.llmModel,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      const data = await res.json() as { success: boolean; message: string };
      if (data.success) {
        setLlmTest('ok');
        setLlmTestMsg(data.message);
      } else {
        setLlmTest('fail');
        setLlmTestMsg(data.message);
      }
    } catch (err) {
      setLlmTest('fail');
      setLlmTestMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleSaveSettings = async () => {
    if (!token) return;
    setSettingsLoading(true);
    try {
      await fetch(`${API_BASE}/api/v1/user/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch { /* error */ }
    setSettingsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your account and service integrations.</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* API Key (for non-JWT usage) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">API Key</CardTitle>
            </div>
            <CardDescription>
              For API access. If logged in, your Bearer token is used automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="xc_..." className="font-mono" onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()} />
              <Button onClick={handleSaveApiKey}>
                {saved ? <><Check className="h-4 w-4" /> Saved</> : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Per-user settings (only shown when logged in) */}
        {token && (
          <>
            {/* LLM Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">LLM Configuration</CardTitle>
                </div>
                <CardDescription>Configure your AI provider for extraction features.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Provider</label>
                    <select
                      value={settings.llmProvider}
                      onChange={(e) => setSettings({ ...settings, llmProvider: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="ollama">Ollama (Local)</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Model</label>
                    <Input
                      value={settings.llmModel}
                      onChange={(e) => setSettings({ ...settings, llmModel: e.target.value })}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">API Key</label>
                  <Input
                    type="password"
                    value={settings.llmApiKey}
                    onChange={(e) => setSettings({ ...settings, llmApiKey: e.target.value })}
                    placeholder="sk-..."
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Base URL <span className="text-muted-foreground/60">(optional, for Ollama/custom endpoints)</span>
                  </label>
                  <Input
                    value={settings.llmBaseUrl}
                    onChange={(e) => setSettings({ ...settings, llmBaseUrl: e.target.value })}
                    placeholder="http://localhost:11434/v1"
                  />
                </div>

                {/* Test connection */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testLlmConnection}
                    disabled={llmTest === 'testing'}
                  >
                    {llmTest === 'testing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                    {llmTest === 'testing' ? 'Testing...' : 'Test Connection'}
                  </Button>
                  {llmTest === 'ok' && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle className="h-3 w-3" /> {llmTestMsg}
                    </span>
                  )}
                  {llmTest === 'fail' && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <XCircle className="h-3 w-3" /> {llmTestMsg}
                    </span>
                  )}
                </div>

                {!settings.llmApiKey && (
                  <p className="text-[11px] text-muted-foreground">
                    Add your API key to enable AI extraction features.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Proxies — managed on dedicated page */}

            {/* SearXNG */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Search Engine</CardTitle>
                </div>
                <CardDescription>SearXNG instance URL for the /search endpoint.</CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  value={settings.searxngUrl}
                  onChange={(e) => setSettings({ ...settings, searxngUrl: e.target.value })}
                  placeholder="http://localhost:8888"
                />
              </CardContent>
            </Card>

            {/* Save all settings */}
            <Button onClick={handleSaveSettings} disabled={settingsLoading} className="w-full">
              {settingsLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : settingsSaved ? (
                <><Check className="h-4 w-4" /> Settings Saved</>
              ) : (
                'Save All Settings'
              )}
            </Button>
          </>
        )}

        {/* Resources */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Resources</CardTitle>
            </div>
            <CardDescription>Documentation and reference links.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a href="http://localhost:3001/api/docs" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
              <div>
                <p className="text-sm font-medium">Swagger API Docs</p>
                <p className="text-xs text-muted-foreground">Interactive API reference</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
