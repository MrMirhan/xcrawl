'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Bug, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signup, saveAuth } from '@/lib/auth';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signup(email, password, name || undefined);
      if (result.pending) {
        setPendingMessage(result.message || 'Signup successful. Your account is pending admin approval.');
      } else if (result.user && result.token) {
        saveAuth(result.user, result.token);
        router.push('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Bug className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Get started with XCrawl for free</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingMessage ? (
            <div className="flex flex-col items-center gap-3 text-center py-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm text-foreground">{pendingMessage}</p>
              <Link href="/login" className="text-sm text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Name (optional)</label>
                  <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Email</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Password</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</> : 'Create Account'}
                </Button>
              </form>
              <p className="text-sm text-center text-muted-foreground mt-4">
                Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
