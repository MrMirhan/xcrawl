'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Copy, Check, Trash2, Key, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  active: boolean;
  lastUsed?: string;
  createdAt: string;
}

export default function ApiKeysPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState('');
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(() => {
    setLoading(true);
    apiClient
      .listApiKeys()
      .then((res) => setKeys(res as ApiKey[]))
      .catch((err) => console.error('Failed to load API keys:', err))
      .finally(() => setLoading(false));
  }, []);

  // Async load on mount — not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!newKeyName) return;
    try {
      const res = (await apiClient.createApiKey(newKeyName)) as { key: string };
      setCreatedKey(res.key);
      setNewKeyName('');
      loadKeys();
      toast.success('API key created');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create API key';
      toast.error(msg);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await apiClient.revokeApiKey(id);
      loadKeys();
      toast.success('API key revoked');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to revoke API key';
      toast.error(msg);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground mt-1">Manage your API keys for authentication.</p>
      </div>

      {/* Create */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create New Key</CardTitle>
          <CardDescription>Give your key a descriptive name to identify it later.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production, Development, CI/CD"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={!newKeyName}>
              <Plus className="h-4 w-4" /> Create
            </Button>
          </div>

          {createdKey && (
            <div className="mt-4 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Key created successfully!
                </p>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400/80 mb-2">
                Copy it now — you won{"'"}t see the full key again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-white dark:bg-black/30 px-3 py-2 rounded border">
                  {createdKey}
                </code>
                <Button variant="outline" size="icon" onClick={() => handleCopy(createdKey)}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Key</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Used</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No API keys yet. Create one above to get started.
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr key={key.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{key.name}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-muted-foreground">
                        {key.key}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={key.active ? 'success' : 'destructive'}>
                        {key.active ? 'Active' : 'Revoked'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {key.lastUsed ? formatDate(key.lastUsed) : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {key.active && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(key.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" /> Revoke
                        </Button>
                      )}
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
