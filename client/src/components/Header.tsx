import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, User, Sun, Moon, Bell, CheckCheck } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/lib/themeStore';
import { apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

interface HeaderProps {
  title?: string;
  showSearch?: boolean;
}

interface UserData {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}

interface Notification {
  id: number;
  userId: string;
  type: string;
  actorId?: string;
  targetId?: number;
  targetType?: string;
  message?: string;
  isRead: number;
  createdAt: string;
}

export function Header({ title = "ScrapPlayer", showSearch = true }: HeaderProps) {
  const { user: rawUser, isAuthenticated } = useAuth();
  const user = rawUser as UserData | undefined;
  const { theme, toggleTheme } = useThemeStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [isAuthenticated]);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(parseInt(data.count) || 0);
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      fetchUnreadCount();
      intervalRef.current = setInterval(fetchUnreadCount, 30000);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: number) => {
    try {
      await apiRequest('PUT', `/api/notifications/${id}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, isRead: 1 } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiRequest('PUT', '/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleBellClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'follow':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <User className="w-4 h-4 text-blue-400" />
          </div>
        );
      case 'like':
        return (
          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-rose-400 fill-current" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-gray-500/20 flex items-center justify-center">
            <Bell className="w-4 h-4 text-gray-400" />
          </div>
        );
    }
  };

  return (
    <header className={`sticky top-0 z-40 ${
      theme === 'dark' 
        ? 'bg-gray-900/95 backdrop-blur-lg border-b border-white/10' 
        : 'header-clean'
    }`}>
      <div className="flex items-center justify-between px-4 h-16">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </div>
          <div>
            <span className={`text-xl font-bold tracking-tight ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              {title}
            </span>
            <div className={`flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase ${
              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
            }`}>
              <span>Music Player</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl transition-all duration-200 ${
              theme === 'dark' 
                ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            data-testid="button-theme-toggle"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {showSearch && (
            <Link href="/explore">
              <button 
                className={`p-2.5 rounded-xl transition-all duration-200 ${
                  theme === 'dark' 
                    ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                data-testid="button-search"
              >
                <Search className="w-5 h-5" />
              </button>
            </Link>
          )}

          {isAuthenticated && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={handleBellClick}
                className={`relative p-2.5 rounded-xl transition-all duration-200 ${
                  theme === 'dark' 
                    ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                data-testid="button-notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className={`absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-xl border z-50 ${
                  theme === 'dark' 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200'
                }`}>
                  <div className={`sticky top-0 flex items-center justify-between px-4 py-3 border-b ${
                    theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}>
                    <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className={`text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
                          theme === 'dark'
                            ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                        data-testid="button-mark-all-read"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className={`p-8 text-center ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No notifications yet</p>
                    </div>
                  ) : (
                    <div className={`divide-y ${theme === 'dark' ? 'divide-gray-700/50' : 'divide-gray-100'}`}>
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`flex items-start gap-3 p-4 transition-colors cursor-pointer ${
                            notification.isRead === 0
                              ? theme === 'dark'
                                ? 'bg-gray-700/30 hover:bg-gray-700/50'
                                : 'bg-rose-50/50 hover:bg-rose-50'
                              : theme === 'dark'
                                ? 'hover:bg-gray-700/30'
                                : 'hover:bg-gray-50'
                          }`}
                          onClick={() => {
                            if (notification.isRead === 0) {
                              markAsRead(notification.id);
                            }
                          }}
                          data-testid={`notification-item-${notification.id}`}
                        >
                          {getNotificationIcon(notification.type)}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${
                              theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
                            }`}>
                              {notification.message}
                            </p>
                            <p className={`text-xs mt-1 ${
                              theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                            }`}>
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          {notification.isRead === 0 && (
                            <div className="w-2 h-2 rounded-full bg-rose-500 mt-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {isAuthenticated && user ? (
            <Link href="/profile" className="flex items-center">
              {user.profileImageUrl ? (
                <img 
                  src={user.profileImageUrl} 
                  alt="Profile" 
                  className={`w-9 h-9 rounded-full object-cover ring-2 hover:ring-rose-300 transition-all duration-200 ${
                    theme === 'dark' ? 'ring-gray-700' : 'ring-gray-200'
                  }`}
                  data-testid="user-avatar"
                />
              ) : (
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center ring-2 hover:ring-rose-300 transition-all ${
                  theme === 'dark' ? 'ring-gray-700' : 'ring-gray-200'
                }`}>
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </Link>
          ) : (
            <a 
              href="/api/login"
              className="btn-primary px-5 py-2 text-white rounded-full text-sm font-semibold"
              data-testid="button-login"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
