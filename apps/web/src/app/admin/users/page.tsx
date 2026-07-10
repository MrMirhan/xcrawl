'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, ShieldX, UserCheck, SlidersHorizontal } from 'lucide-react';
import { UserRole } from '@xcrawl/shared';
import type { UserProfile, Plan } from '@xcrawl/shared';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiClient, type UpdateUserLimitsRequest } from '@/lib/api-client';
import { getUser, getToken } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

export default function AdminUsersPage() {
  const toast = useToast();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [token] = useState<string | null>(() => getToken());
  const [currentUserId] = useState<string | undefined>(() => getUser()?.id);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const [approveRoles, setApproveRoles] = useState<Record<string, UserRole>>({});

  const [plans, setPlans] = useState<Plan[]>([]);
  const [userPlanMap, setUserPlanMap] = useState<Record<string, string>>({});
  const [overridesUserId, setOverridesUserId] = useState<string | null>(null);
  const [overridesForm, setOverridesForm] = useState({
    dailyPageLimit: '',
    weeklyPageLimit: '',
    dailySearchLimit: '',
    weeklySearchLimit: '',
    dailyExtractLimit: '',
    weeklyExtractLimit: '',
    canUseOwnLlm: '',
  });
  const [savingOverrides, setSavingOverrides] = useState(false);

  // Client-side UX gate — the server enforces the real 403.
  useEffect(() => {
    if (getUser()?.role !== UserRole.ADMIN) {
      router.replace('/');
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthorized(true);
    }
  }, [router]);

  const loadPending = useCallback(() => {
    if (!token) return;
    setLoadingPending(true);
    apiClient
      .listUsers(token, { role: UserRole.PENDING })
      .then((res) => setPendingUsers(res.data))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load pending users'))
      .finally(() => setLoadingPending(false));
  }, [token, toast]);

  const loadAll = useCallback(() => {
    if (!token) return;
    setLoadingAll(true);
    apiClient
      .listUsers(token)
      .then((res) => {
        setAllUsers(res.data);
        setUserPlanMap((prev) => {
          const next = { ...prev };
          for (const u of res.data) {
            if (u.plan?.id) next[u.id] = u.plan.id;
          }
          return next;
        });
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load users'))
      .finally(() => setLoadingAll(false));
  }, [token, toast]);

  // Async load on mount once authorized — not derived state.
  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPending();
  }, [authorized, loadPending]);

  useEffect(() => {
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [authorized, loadAll]);

  const handleApprove = async (id: string) => {
    if (!token) return;
    const role = approveRoles[id] ?? UserRole.USER;
    try {
      await apiClient.approveUser(id, token, role);
      toast.success('User approved');
      loadPending();
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve user');
    }
  };

  const handleReject = async (id: string) => {
    if (!token) return;
    if (!window.confirm('Reject this signup request? This cannot be undone.')) return;
    try {
      await apiClient.rejectUser(id, token);
      toast.success('User rejected');
      loadPending();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject user');
    }
  };

  const handleRoleChange = async (id: string, role: UserRole) => {
    if (!token) return;
    try {
      await apiClient.updateUserRole(id, role, token);
      toast.success('Role updated');
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleStatusToggle = async (id: string, isActive: boolean) => {
    if (!token) return;
    try {
      await apiClient.updateUserStatus(id, !isActive, token);
      toast.success(isActive ? 'User disabled' : 'User enabled');
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const loadPlans = useCallback(() => {
    if (!token) return;
    apiClient
      .listPlans(token)
      .then((res) => setPlans(res.data))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load plans'));
  }, [token, toast]);

  useEffect(() => {
    if (!authorized) return;
    loadPlans();
  }, [authorized, loadPlans]);

  const handlePlanChange = async (userId: string, planId: string) => {
    if (!token) return;
    try {
      await apiClient.updateUserPlan(token, userId, planId);
      setUserPlanMap((prev) => ({ ...prev, [userId]: planId }));
      toast.success('Plan assigned');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign plan');
    }
  };

  const openOverrides = (userId: string) => {
    setOverridesUserId((prev) => (prev === userId ? null : userId));
    setOverridesForm({
      dailyPageLimit: '',
      weeklyPageLimit: '',
      dailySearchLimit: '',
      weeklySearchLimit: '',
      dailyExtractLimit: '',
      weeklyExtractLimit: '',
      canUseOwnLlm: '',
    });
  };

  const handleSaveOverrides = async (userId: string) => {
    if (!token) return;
    setSavingOverrides(true);
    const parse = (v: string): number | null => {
      if (v === '') return null;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? null : n;
    };
    const dto: UpdateUserLimitsRequest = {
      limitOverrides: {
        dailyPageLimit: parse(overridesForm.dailyPageLimit),
        weeklyPageLimit: parse(overridesForm.weeklyPageLimit),
        dailySearchLimit: parse(overridesForm.dailySearchLimit),
        weeklySearchLimit: parse(overridesForm.weeklySearchLimit),
        dailyExtractLimit: parse(overridesForm.dailyExtractLimit),
        weeklyExtractLimit: parse(overridesForm.weeklyExtractLimit),
      },
      canUseOwnLlmOverride: overridesForm.canUseOwnLlm === '' ? null : overridesForm.canUseOwnLlm === 'true',
    };
    try {
      await apiClient.updateUserLimits(token, userId, dto);
      toast.success('Overrides saved');
      setOverridesUserId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save overrides');
    }
    setSavingOverrides(false);
  };

  if (!authorized) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const nonPendingUsers = allUsers.filter((u) => u.role !== UserRole.PENDING);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-1">Approve signups and manage roles and access.</p>
      </div>

      {/* Pending approval */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Approval</CardTitle>
          <CardDescription>New signups awaiting admin approval.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingPending ? (
                <TableRow>
                  <TableCell colSpan={4} className="px-4 py-16 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : pendingUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No pending signups.
                  </TableCell>
                </TableRow>
              ) : (
                pendingUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>{u.name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={approveRoles[u.id] ?? UserRole.USER}
                          onChange={(e) =>
                            setApproveRoles((prev) => ({ ...prev, [u.id]: e.target.value as UserRole }))
                          }
                          className="h-8 w-24"
                        >
                          <option value={UserRole.USER}>USER</option>
                          <option value={UserRole.ADMIN}>ADMIN</option>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => handleApprove(u.id)}>
                          <UserCheck className="h-3 w-3" /> Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReject(u.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <ShieldX className="h-3 w-3" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* All users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Users</CardTitle>
          <CardDescription>Manage roles and access for existing users.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingAll ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-16 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : nonPendingUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No users yet.
                  </TableCell>
                </TableRow>
              ) : (
                nonPendingUsers.flatMap((u) => {
                  const isSelf = u.id === currentUserId;
                  const currentPlanId = userPlanMap[u.id] ?? '';
                  const currentPlan = plans.find((p) => p.id === currentPlanId);
                  const planName = currentPlan?.name ?? '—';
                  const overridesOpen = overridesUserId === u.id;
                  return [
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>{u.name || '—'}</TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="h-8 w-24"
                        >
                          <option value={UserRole.USER}>USER</option>
                          <option value={UserRole.ADMIN}>ADMIN</option>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? 'success' : 'destructive'}>
                          {u.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{planName}</span>
                          <Select
                            value={currentPlanId}
                            onChange={(e) => handlePlanChange(u.id, e.target.value)}
                            className="h-8 w-36"
                          >
                            <option value="">Assign plan…</option>
                            {plans.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openOverrides(u.id)}
                          >
                            <SlidersHorizontal className="h-3 w-3" /> Overrides
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            onClick={() => handleStatusToggle(u.id, u.isActive)}
                            className={u.isActive ? 'text-destructive hover:text-destructive' : ''}
                          >
                            {u.isActive ? (
                              <><ShieldX className="h-3 w-3" /> Disable</>
                            ) : (
                              <><ShieldCheck className="h-3 w-3" /> Enable</>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>,
                    overridesOpen ? (
                      <TableRow key={`${u.id}-overrides`}>
                        <TableCell colSpan={6} className="bg-muted/30 px-4 py-4">
                          <div className="space-y-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              Limit overrides for {u.email} — leave blank to use plan default.
                            </p>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                              {([
                                { key: 'dailyPageLimit', label: 'Daily Page' },
                                { key: 'weeklyPageLimit', label: 'Weekly Page' },
                                { key: 'dailySearchLimit', label: 'Daily Search' },
                                { key: 'weeklySearchLimit', label: 'Weekly Search' },
                                { key: 'dailyExtractLimit', label: 'Daily Extract' },
                                { key: 'weeklyExtractLimit', label: 'Weekly Extract' },
                              ] as const).map((f) => (
                                <div key={f.key}>
                                  <label className="text-xs font-medium text-muted-foreground block mb-1">{f.label}</label>
                                  <Input
                                    type="number"
                                    value={overridesForm[f.key]}
                                    onChange={(e) => setOverridesForm({ ...overridesForm, [f.key]: e.target.value })}
                                    placeholder="Default"
                                    className="h-8"
                                  />
                                </div>
                              ))}
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground block mb-1">BYOK Override</label>
                              <Select
                                value={overridesForm.canUseOwnLlm}
                                onChange={(e) => setOverridesForm({ ...overridesForm, canUseOwnLlm: e.target.value })}
                                className="h-8 w-48"
                              >
                                <option value="">Use plan default</option>
                                <option value="true">Force allow</option>
                                <option value="false">Force block</option>
                              </Select>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSaveOverrides(u.id)} disabled={savingOverrides}>
                                {savingOverrides ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save Overrides'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setOverridesUserId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null,
                  ];
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
