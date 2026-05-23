'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PlayCircle,
  ListTodo,
  Key,
  Globe,
  Webhook,
  Settings,
  Moon,
  Sun,
  Monitor,
  Bug,
  CalendarClock,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { getUser, clearAuth } from '@/lib/auth';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Playground', href: '/playground', icon: PlayCircle },
  { name: 'Jobs', href: '/jobs', icon: ListTodo },
  { name: 'API Keys', href: '/api-keys', icon: Key },
  { name: 'Proxies', href: '/proxies', icon: Globe },
  { name: 'Schedules', href: '/schedules', icon: CalendarClock },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [user] = useState<{ email: string; name?: string } | null>(() => getUser());

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  return (
    <aside className="flex flex-col w-64 border-r border-sidebar-border bg-sidebar h-screen sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Bug className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-sidebar-foreground tracking-tight">XCrawl</h1>
            <p className="text-[10px] text-muted-foreground leading-none">Open-Source Web Crawler</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {user && (
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{user.name || user.email}</p>
              {user.name && <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-7 w-7 shrink-0">
              <LogOut className="h-3 w-3" />
            </Button>
          </div>
        )}
        {!user && (
          <Link href="/login">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground text-xs">
              Sign in
            </Button>
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleTheme}
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="h-4 w-4" />
          ) : theme === 'system' ? (
            <Monitor className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          <span className="text-xs capitalize">{theme} mode</span>
        </Button>
      </div>
    </aside>
  );
}
