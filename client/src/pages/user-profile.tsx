import { useState, useEffect, useCallback } from 'react';
import { useRoute } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { PostCard } from '@/components/PostCard';
import { User, ArrowLeft, Settings, X, Check, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { useThemeStore } from '@/lib/themeStore';

interface Profile {
  id: number;
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing?: boolean;
}

interface Post {
  id: number;
  authorId: string;
  content: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt: string;
  author: Profile | null;
  userReaction: string | null;
}

export default function UserProfilePage() {
  const [, params] = useRoute('/user/:userId');
  const userId = params?.userId;
  const { user, isAuthenticated } = useAuth();
  const { theme } = useThemeStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  const currentUserId = isAuthenticated ? (user as any)?.id || (user as any)?.claims?.sub : null;
  const isOwnProfile = currentUserId === userId;

  const checkUsername = useCallback(async (username: string) => {
    if (username.length < 3) {
      setUsernameStatus('invalid');
      setUsernameError('Username must be at least 3 characters');
      return;
    }
    
    setUsernameStatus('checking');
    try {
      const res = await fetch(`/api/username/check?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      
      if (data.error) {
        setUsernameStatus('invalid');
        setUsernameError(data.error);
      } else if (data.available) {
        setUsernameStatus('available');
        setUsernameError('');
      } else {
        setUsernameStatus('taken');
        setUsernameError('This username is already taken');
      }
    } catch {
      setUsernameStatus('idle');
    }
  }, []);

  useEffect(() => {
    if (!newUsername) {
      setUsernameStatus('idle');
      setUsernameError('');
      return;
    }
    
    const timer = setTimeout(() => {
      checkUsername(newUsername);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [newUsername, checkUsername]);

  const handleSaveUsername = async () => {
    if (usernameStatus !== 'available' || savingUsername) return;
    
    setSavingUsername(true);
    try {
      const res = await fetch('/api/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername }),
      });
      
      if (res.ok) {
        await fetchProfile();
        closeSettings();
      } else {
        const data = await res.json();
        setUsernameError(data.error || 'Failed to update username');
        setUsernameStatus('invalid');
      }
    } catch {
      setUsernameError('Failed to update username');
      setUsernameStatus('invalid');
    } finally {
      setSavingUsername(false);
    }
  };

  const closeSettings = useCallback(() => {
    setShowSettings(false);
    setNewUsername('');
    setUsernameStatus('idle');
    setUsernameError('');
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings();
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showSettings, closeSettings]);

  useEffect(() => {
    if (userId) {
      fetchProfile();
      fetchPosts();
    }
  }, [userId]);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/users/${userId}/profile`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setIsFollowing(data.isFollowing || false);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const res = await fetch(`/api/users/${userId}/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      window.location.href = '/api/login';
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        await fetch(`/api/users/${userId}/follow`, { method: 'DELETE' });
        setIsFollowing(false);
        if (profile) {
          setProfile({ ...profile, followersCount: profile.followersCount - 1 });
        }
      } else {
        await fetch(`/api/users/${userId}/follow`, { method: 'POST' });
        setIsFollowing(true);
        if (profile) {
          setProfile({ ...profile, followersCount: profile.followersCount + 1 });
        }
      }
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <Header title="Profile" showSearch={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <Header title="Profile" showSearch={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <User className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>User not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`sticky top-0 z-40 ${theme === 'dark' ? 'bg-gray-900/95 backdrop-blur-lg border-b border-white/10' : 'header-clean'}`}>
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/" className={`p-2 rounded-full transition-colors block ${theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <ArrowLeft className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`} />
          </Link>
          <div>
            <h1 className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{profile.displayName || 'User'}</h1>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{profile.postsCount} posts</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <div 
          className="h-32 bg-gradient-to-r from-rose-400 to-rose-500"
          style={profile.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})`, backgroundSize: 'cover' } : {}}
        />

        <div className="px-4 -mt-12 relative z-10">
          <div className="flex justify-between items-end">
            <div className="relative">
              {profile.avatarUrl ? (
                <img 
                  src={profile.avatarUrl} 
                  alt={profile.displayName || 'Profile'} 
                  className={`w-24 h-24 rounded-full border-4 object-cover shadow-md ${theme === 'dark' ? 'border-gray-900' : 'border-white'}`}
                />
              ) : (
                <div className={`w-24 h-24 rounded-full border-4 bg-gradient-to-br from-rose-400 to-rose-500 flex items-center justify-center shadow-md ${theme === 'dark' ? 'border-gray-900' : 'border-white'}`}>
                  <User className="w-10 h-10 text-white" />
                </div>
              )}
            </div>

            {isOwnProfile ? (
              <button
                onClick={() => setShowSettings(true)}
                className={`px-6 py-2 rounded-full font-medium transition-colors flex items-center gap-2 shadow-sm ${
                  theme === 'dark' 
                    ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border border-white/10' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            ) : (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`px-6 py-2 rounded-full font-medium transition-colors shadow-sm ${
                  isFollowing 
                    ? theme === 'dark'
                      ? 'bg-gray-800 text-gray-200 border border-white/10 hover:bg-red-900/30 hover:text-red-400 hover:border-red-500/30'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                    : 'btn-primary text-white'
                }`}
                data-testid="button-follow"
              >
                {followLoading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>

          <div className="mt-4">
            <h1 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{profile.displayName || 'User'}</h1>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>@{profile.username}</p>
            {profile.bio && (
              <p className={`mt-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{profile.bio}</p>
            )}
          </div>

          <div className="flex gap-6 mt-4">
            <div>
              <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{profile.followersCount}</span>
              <span className={`ml-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Followers</span>
            </div>
            <div>
              <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{profile.followingCount}</span>
              <span className={`ml-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Following</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`flex mt-6 ${theme === 'dark' ? 'bg-gray-800 border-b border-white/10' : 'bg-white border-b border-gray-200'}`}>
        <button className="flex-1 py-3 text-sm font-medium text-rose-500 border-b-2 border-rose-500">
          Posts
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {posts.length > 0 ? (
          posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))
        ) : (
          <div className="text-center py-12">
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>No posts yet</p>
          </div>
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeSettings}>
          <div className={`rounded-xl w-full max-w-md shadow-xl ${theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Profile Settings</h3>
              <button
                onClick={closeSettings}
                className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                  Username
                </label>
                <p className={`text-xs mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Current: @{profile?.username}
                </p>
                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>@</span>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="new_username"
                    className={`w-full pl-8 pr-10 py-3 border rounded-lg focus:outline-none transition-colors ${
                      theme === 'dark'
                        ? usernameStatus === 'available' 
                          ? 'bg-gray-700 border-green-500 text-white placeholder-gray-500 focus:ring-2 focus:ring-green-500/30' 
                          : usernameStatus === 'taken' || usernameStatus === 'invalid'
                          ? 'bg-gray-700 border-red-500 text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500/30'
                          : 'bg-gray-700 border-white/10 text-white placeholder-gray-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30'
                        : usernameStatus === 'available' 
                          ? 'bg-gray-50 border-green-500 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-100' 
                          : usernameStatus === 'taken' || usernameStatus === 'invalid'
                          ? 'bg-gray-50 border-red-500 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-red-100'
                          : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
                    }`}
                    maxLength={20}
                    data-testid="input-username"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && (
                      <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${theme === 'dark' ? 'border-gray-500' : 'border-gray-400'}`} />
                    )}
                    {usernameStatus === 'available' && (
                      <Check className="w-5 h-5 text-green-500" />
                    )}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                </div>
                {usernameError && (
                  <p className="text-xs text-red-500 mt-1">{usernameError}</p>
                )}
                {usernameStatus === 'available' && (
                  <p className="text-xs text-green-500 mt-1">Username is available!</p>
                )}
                <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  3-20 characters. Letters, numbers, and underscores only. Must start with a letter.
                </p>
              </div>
              
              <button
                onClick={handleSaveUsername}
                disabled={usernameStatus !== 'available' || savingUsername}
                className="w-full py-3 btn-primary text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-save-username"
              >
                {savingUsername ? 'Saving...' : 'Save Username'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
