import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Header } from '@/components/Header';
import { Search, User, UserPlus, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/lib/themeStore';

interface Profile {
  id: number;
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
}

export default function UsersPage() {
  const { user, isAuthenticated } = useAuth();
  const { theme } = useThemeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  const currentUserId = isAuthenticated ? (user as any)?.id || (user as any)?.claims?.sub : null;

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    const abortController = new AbortController();
    const currentQuery = searchQuery;

    const doSearch = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(currentQuery)}`, {
          signal: abortController.signal
        });
        
        if (abortController.signal.aborted) return;
        
        if (res.ok) {
          const data = await res.json();
          
          if (abortController.signal.aborted) return;
          
          setResults(data);
          
          if (isAuthenticated && data.length > 0) {
            const followPromises = data
              .filter((profile: Profile) => profile.userId !== currentUserId)
              .map(async (profile: Profile) => {
                try {
                  const followRes = await fetch(`/api/users/${profile.userId}/profile`, {
                    signal: abortController.signal
                  });
                  if (followRes.ok) {
                    const profileData = await followRes.json();
                    return { userId: profile.userId, isFollowing: profileData.isFollowing || false };
                  }
                } catch {}
                return null;
              });
            
            const followResults = await Promise.all(followPromises);
            
            if (abortController.signal.aborted) return;
            
            const followStatus: Record<string, boolean> = {};
            for (const result of followResults) {
              if (result) {
                followStatus[result.userId] = result.isFollowing;
              }
            }
            setFollowingMap(followStatus);
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Search failed:', error);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(doSearch, 300);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [searchQuery, isAuthenticated, currentUserId]);

  const handleFollow = async (userId: string) => {
    if (!isAuthenticated) {
      window.location.href = '/api/login';
      return;
    }

    setFollowLoading(userId);
    try {
      if (followingMap[userId]) {
        await fetch(`/api/users/${userId}/follow`, { method: 'DELETE' });
        setFollowingMap(prev => ({ ...prev, [userId]: false }));
      } else {
        await fetch(`/api/users/${userId}/follow`, { method: 'POST' });
        setFollowingMap(prev => ({ ...prev, [userId]: true }));
      }
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
    } finally {
      setFollowLoading(null);
    }
  };

  function cleanUsername(username: string | undefined): string {
    if (!username) return 'user';
    if (username.includes('@')) {
      return username.split('@')[0];
    }
    return username;
  }

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <Header title="Discover Users" showSearch={false} />

      <div className="px-4 py-4">
        <div className="relative">
          <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name or username..."
            className={`w-full pl-12 pr-4 py-3 rounded-full focus:outline-none focus:ring-2 shadow-sm ${
              theme === 'dark'
                ? 'bg-gray-800 border border-white/10 text-white placeholder-gray-500 focus:border-rose-500 focus:ring-rose-500/30'
                : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-rose-500 focus:ring-rose-100'
            }`}
            data-testid="input-user-search"
          />
        </div>
      </div>

      <div className="flex-1 px-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full" />
          </div>
        ) : searchQuery.length < 2 ? (
          <div className="text-center py-12">
            <User className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>Enter at least 2 characters to search</p>
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-3">
            {results.map((profile) => (
              <div 
                key={profile.id} 
                className={`flex items-center justify-between p-4 rounded-xl shadow-sm ${
                  theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'bg-white border border-gray-200'
                }`}
                data-testid={`user-result-${profile.userId}`}
              >
                <Link href={`/user/${profile.userId}`} className="flex items-center gap-3 flex-1 min-w-0">
                  {profile.avatarUrl ? (
                    <img 
                      src={profile.avatarUrl} 
                      alt={profile.displayName || 'User'} 
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-rose-500 flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{profile.displayName || 'User'}</p>
                    <p className={`text-sm truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>@{cleanUsername(profile.username)}</p>
                    <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{profile.followersCount} followers</p>
                  </div>
                </Link>

                {profile.userId !== currentUserId && (
                  <button
                    onClick={() => handleFollow(profile.userId)}
                    disabled={followLoading === profile.userId}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1 ${
                      followingMap[profile.userId]
                        ? theme === 'dark'
                          ? 'bg-gray-700 text-gray-300 hover:bg-red-900/30 hover:text-red-400'
                          : 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-500'
                        : 'btn-primary text-white'
                    }`}
                    data-testid={`button-follow-${profile.userId}`}
                  >
                    {followLoading === profile.userId ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : followingMap[profile.userId] ? (
                      <>
                        <Check className="w-4 h-4" />
                        Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Follow
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <User className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>No users found</p>
            <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
}
