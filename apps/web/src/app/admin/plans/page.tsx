'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Pencil, Trash2, ClipboardList } from 'lucide-react';
import { UserRole } from '@xcrawl/shared';
import type { Plan } from '@xcrawl/shared';
import { apiClient, type CreatePlanRequest } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { getUser, getToken } from '@/lib/auth';

const LIMIT_FIELDS = [
  { key: 'dailyPageLimit', label: 'Daily Page Limit' },
  { key: 'weeklyPageLimit', label: 'Weekly Page Limit' },
  { key: 'dailySearchLimit', label: 'Daily Search Limit' },
  { key: 'weeklySearchLimit', label: 'Weekly Search Limit' },
  { key: 'dailyExtractLimit', label: 'Daily Extract Limit' },
  { key: 'weeklyExtractLimit', label: 'Weekly Extract Limit' },
] as const;

interface FormState {
  name: string;
  description: string;
  dailyPageLimit: string;
  weeklyPageLimit: string;
  dailySearchLimit: string;
  weeklySearchLimit: string;
  dailyExtractLimit: string;
  weeklyExtractLimit: string;
  canUseOwnLlm: boolean;
  isDefault: boolean;
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    dailyPageLimit: '',
    weeklyPageLimit: '',
    dailySearchLimit: '',
    weeklySearchLimit: '',
    dailyExtractLimit: '',
    weeklyExtractLimit: '',
    canUseOwnLlm: false,
    isDefault: false,
  };
}

function planToForm(p: Plan): FormState {
  return {
    name: p.name,
    description: p.description ?? '',
    dailyPageLimit: p.dailyPageLimit?.toString() ?? '',
    weeklyPageLimit: p.weeklyPageLimit?.toString() ?? '',
    dailySearchLimit: p.dailySearchLimit?.toString() ?? '',
    weeklySearchLimit: p.weeklySearchLimit?.toString() ?? '',
    dailyExtractLimit: p.dailyExtractLimit?.toString() ?? '',
    weeklyExtractLimit: p.weeklyExtractLimit?.toString() ?? '',
    canUseOwnLlm: p.canUseOwnLlm,
    isDefault: p.isDefault,
  };
}

function formToDto(f: FormState): CreatePlanRequest {
  const parse = (v: string): number | null => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };
  return {
    name: f.name,
    description: f.description || undefined,
    dailyPageLimit: parse(f.dailyPageLimit),
    weeklyPageLimit: parse(f.weeklyPageLimit),
    dailySearchLimit: parse(f.dailySearchLimit),
    weeklySearchLimit: parse(f.weeklySearchLimit),
    dailyExtractLimit: parse(f.dailyExtractLimit),
    weeklyExtractLimit: parse(f.weeklyExtractLimit),
    canUseOwnLlm: f.canUseOwnLlm,
    isDefault: f.isDefault,
  };
}

function limitDisplay(v: number | null): string {
  return v === null ? 'Unlimited' : v.toLocaleString();
}

export default function AdminPlansPage() {
  const toast = useToast();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [token] = useState<string | null>(() => getToken());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (getUser()?.role !== UserRole.ADMIN) {
      router.replace('/');
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthorized(true);
    }
  }, [router]);

  const loadPlans = useCallback(() => {
    if (!token) return;
    setLoading(true);
    apiClient
      .listPlans(token)
      .then((res) => setPlans(res.data))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, [token, toast]);

  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlans();
  }, [authorized, loadPlans]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditing(null);
  };

  const handleEdit = (p: Plan) => {
    setEditing(p);
    setForm(planToForm(p));
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (!form.name.trim()) {
      toast.error('Plan name is required');
      return;
    }
    setSaving(true);
    try {
      const dto = formToDto(form);
      if (editing) {
        await apiClient.updatePlan(token, editing.id, dto);
        toast.success('Plan updated');
      } else {
        await apiClient.createPlan(token, dto);
        toast.success('Plan created');
      }
      resetForm();
      loadPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save plan');
    }
    setSaving(false);
  };

  const handleDelete = async (p: Plan) => {
    if (!token) return;
    if (!window.confirm(`Delete plan "${p.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.deletePlan(token, p.id);
      toast.success('Plan deleted');
      loadPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete plan');
    }
  };

  if (!authorized) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
        <p className="text-muted-foreground mt-1">Manage usage plans and their limits.</p>
      </div>

      {/* Create / Edit form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{editing ? 'Edit Plan' : 'Create Plan'}</CardTitle>
          </div>
          <CardDescription>
            {editing
              ? 'Update plan fields. Empty limit fields mean unlimited.'
              : 'Define a new usage plan. Empty limit fields mean unlimited (null).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Free, Pro, etc."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {LIMIT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{f.label}</label>
                <Input
                  type="number"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.canUseOwnLlm}
                onChange={(e) => setForm({ ...form, canUseOwnLlm: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Allow own LLM (BYOK)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Make default plan
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editing ? (
                <><Pencil className="h-4 w-4" /> Update</>
              ) : (
                <><Plus className="h-4 w-4" /> Create</>
              )}
            </Button>
            {editing && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plans table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Plans</CardTitle>
          <CardDescription>Configured usage plans and their assignments.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Pages (D/W)</TableHead>
                <TableHead>Search (D/W)</TableHead>
                <TableHead>Extract (D/W)</TableHead>
                <TableHead>BYOK</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-16 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No plans yet. Create one above.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((p) => {
                  const disabled = (p.assignedUsers ?? 0) > 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {p.name}
                          {p.isDefault && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.description || '—'}</TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">
                          {limitDisplay(p.dailyPageLimit)} / {limitDisplay(p.weeklyPageLimit)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">
                          {limitDisplay(p.dailySearchLimit)} / {limitDisplay(p.weeklySearchLimit)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">
                          {limitDisplay(p.dailyExtractLimit)} / {limitDisplay(p.weeklyExtractLimit)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.canUseOwnLlm ? 'success' : 'outline'}>
                          {p.canUseOwnLlm ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{p.assignedUsers ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(p)}
                            title="Edit plan"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            onClick={() => handleDelete(p)}
                            title={disabled ? 'Reassign all users before deleting' : 'Delete plan'}
                            className={disabled ? '' : 'text-destructive hover:text-destructive'}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}