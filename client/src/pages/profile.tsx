import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/lib/themeStore';
import { Header } from '@/components/Header';
import { PostCard } from '@/components/PostCard';
import { PostComposer } from '@/components/PostComposer';
import { LogOut, User, Edit2, Camera, Loader2, Settings, X, Check, AlertCircle } from 'lucide-react';

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

export default function ProfilePage() {
  const { user, isAuthenticated } = useAuth();
  const { theme } = useThemeStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'likes'>('posts');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ displayName: '', bio: '' });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

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
    if (isAuthenticated) {
      fetchProfile();
      fetchPosts();
    }
  }, [isAuthenticated]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile/me');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setEditForm({ displayName: data.displayName || '', bio: data.bio || '' });
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    if (!user) return;
    try {
      const userId = (user as any).id || (user as any).claims?.sub;
      const res = await fetch(`/api/users/${userId}/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updatedProfile = await res.json();
        setProfile(updatedProfile);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        
        const profileRes = await fetch('/api/profile/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: url }),
        });

        if (profileRes.ok) {
          const updatedProfile = await profileRes.json();
          setProfile(updatedProfile);
        }
      }
    } catch (error) {
      console.error('Failed to upload avatar:', error);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingBanner(true);
    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        
        const profileRes = await fetch('/api/profile/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bannerUrl: url }),
        });

        if (profileRes.ok) {
          const updatedProfile = await profileRes.json();
          setProfile(updatedProfile);
        }
      }
    } catch (error) {
      console.error('Failed to upload banner:', error);
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleNewPost = (post: Post) => {
    setPosts([post, ...posts]);
    if (profile) {
      setProfile({ ...profile, postsCount: profile.postsCount + 1 });
    }
  };

  const getDisplayUsername = () => {
    if (!profile?.username) return '';
    if (profile.username.includes('@')) {
      return profile.username.split('@')[0];
    }
    return profile.username;
  };

  if (!isAuthenticated) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <Header title="Profile" showSearch={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
            }`}>
              <User className={`w-10 h-10 ${
                theme === 'dark' ? 'text-rose-400' : 'text-rose-300'
              }`} />
            </div>
            <h2 className={`text-xl font-bold mb-2 ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>Sign in to view your profile</h2>
            <p className={`mb-6 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>Create posts, follow friends, and build your music community</p>
            <a
              href="/api/login"
              className="inline-block px-6 py-3 btn-primary text-white rounded-full font-medium"
              data-testid="button-login-profile"
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <Header title="Profile" showSearch={false} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <Header title="Profile" showSearch={false} />

      <input
        type="file"
        ref={avatarInputRef}
        onChange={handleAvatarUpload}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={bannerInputRef}
        onChange={handleBannerUpload}
        accept="image/*"
        className="hidden"
      />

      <div className="relative">
        <div 
          className="h-32 bg-gradient-to-r from-rose-400 to-rose-500 relative"
          style={profile?.bannerUrl ? { backgroundImage: `url(${profile.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
        >
          {isUploadingBanner && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
            </div>
          )}
          <button 
            onClick={() => bannerInputRef.current?.click()}
            disabled={isUploadingBanner}
            className={`absolute top-2 right-2 p-2 rounded-full transition-colors disabled:opacity-50 shadow-sm ${
              theme === 'dark' ? 'bg-gray-800/80 hover:bg-gray-800' : 'bg-white/80 hover:bg-white'
            }`}
            data-testid="button-edit-banner"
          >
            <Camera className={`w-4 h-4 ${
              theme === 'dark' ? 'text-white' : 'text-gray-700'
            }`} />
          </button>
        </div>

        <div className="px-4 -mt-12 relative z-10">
          <div className="flex justify-between items-end">
            <div className="relative">
              {profile?.avatarUrl ? (
                <img 
                  src={profile.avatarUrl} 
                  alt={profile.displayName || 'Profile'} 
                  className={`w-24 h-24 rounded-full border-4 object-cover shadow-md ${
                    theme === 'dark' ? 'border-gray-900' : 'border-white'
                  }`}
                  data-testid="img-profile-avatar"
                />
              ) : (
                <div className={`w-24 h-24 rounded-full border-4 bg-gradient-to-br from-rose-400 to-rose-500 flex items-center justify-center shadow-md ${
                  theme === 'dark' ? 'border-gray-900' : 'border-white'
                }`}>
                  <User className="w-10 h-10 text-white" />
                </div>
              )}
              {isUploadingAvatar && (
                <div className="absolute inset-0 bg-white/50 rounded-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
                </div>
              )}
              <button 
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 p-1.5 bg-rose-500 rounded-full hover:bg-rose-600 transition-colors disabled:opacity-50 shadow-sm"
                data-testid="button-edit-avatar"
              >
                <Camera className="w-3 h-3 text-white" />
              </button>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setIsEditing(true)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1 border shadow-sm ${
                  theme === 'dark' 
                    ? 'bg-gray-800 text-white hover:bg-gray-700 border-white/10' 
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
                }`}
                data-testid="button-edit-profile"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className={`p-2 rounded-full transition-colors border shadow-sm ${
                  theme === 'dark' 
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border-white/10' 
                    : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 border-gray-200'
                }`}
                data-testid="button-settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <a
                href="/api/logout"
                className={`p-2 rounded-full transition-colors border shadow-sm ${
                  theme === 'dark' 
                    ? 'bg-gray-800 hover:bg-red-500/20 hover:text-red-400 border-white/10' 
                    : 'bg-white hover:bg-red-50 hover:text-red-500 border-gray-200'
                }`}
                data-testid="button-logout"
              >
                <LogOut className={`w-5 h-5 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`} />
              </a>
            </div>
          </div>

          <div className="mt-4">
            <h1 className={`text-xl font-bold ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`} data-testid="text-display-name">
              {profile?.displayName || 'User'}
            </h1>
            <p className={`text-sm ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`} data-testid="text-username">@{getDisplayUsername()}</p>
            {profile?.bio && (
              <p className={`mt-2 ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`} data-testid="text-bio">{profile.bio}</p>
            )}
          </div>

          <div className="flex gap-6 mt-4">
            <button className="group" data-testid="button-followers">
              <span className={`font-bold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>{profile?.followersCount || 0}</span>
              <span className={`ml-1 group-hover:text-rose-500 transition-colors ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>Followers</span>
            </button>
            <button className="group" data-testid="button-following">
              <span className={`font-bold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>{profile?.followingCount || 0}</span>
              <span className={`ml-1 group-hover:text-rose-500 transition-colors ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>Following</span>
            </button>
            <div>
              <span className={`font-bold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>{profile?.postsCount || 0}</span>
              <span className={`ml-1 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>Posts</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`flex border-b mt-6 ${
        theme === 'dark' ? 'bg-gray-800 border-white/10' : 'bg-white border-gray-200'
      }`}>
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'posts' 
              ? 'text-rose-500 border-b-2 border-rose-500' 
              : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
          }`}
          data-testid="tab-posts"
        >
          Posts
        </button>
        <button
          onClick={() => setActiveTab('likes')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'likes' 
              ? 'text-rose-500 border-b-2 border-rose-500' 
              : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
          }`}
          data-testid="tab-likes"
        >
          Likes
        </button>
      </div>

      <div className="px-4 py-4">
        <PostComposer onPost={handleNewPost} />

        <div className="mt-4 space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => (
              <PostCard 
                key={post.id} 
                post={post}
                onDelete={() => {
                  setPosts(posts.filter(p => p.id !== post.id));
                  if (profile) {
                    setProfile({ ...profile, postsCount: Math.max(0, profile.postsCount - 1) });
                  }
                }}
              />
            ))
          ) : (
            <div className={`text-center py-12 ${
              theme === 'dark' ? 'text-gray-400' : ''
            }`}>
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>No posts yet</p>
              <p className={`text-sm mt-1 ${
                theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
              }`}>Share your first post above!</p>
            </div>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl w-full max-w-md p-6 shadow-xl ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}>
            <h2 className={`text-xl font-bold mb-4 ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>Edit Profile</h2>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm mb-1 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>Display Name</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-white/10 text-white placeholder-gray-500' 
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  placeholder="Your name"
                  data-testid="input-display-name"
                />
              </div>
              <div>
                <label className={`block text-sm mb-1 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}>Bio</label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 resize-none ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-white/10 text-white placeholder-gray-500' 
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  placeholder="Tell us about yourself"
                  rows={3}
                  data-testid="input-bio"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsEditing(false)}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white hover:bg-gray-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid="button-cancel-edit"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProfile}
                className="flex-1 py-2 btn-primary text-white rounded-lg font-medium"
                data-testid="button-save-profile"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeSettings}>
          <div className={`rounded-xl w-full max-w-md shadow-xl ${theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'bg-white border border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Profile Settings</h3>
              <button onClick={closeSettings} className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Username</label>
                <p className={`text-xs mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Current: @{getDisplayUsername()}</p>
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
                          ? 'bg-gray-700 border-green-500 text-white placeholder-gray-500' 
                          : usernameStatus === 'taken' || usernameStatus === 'invalid'
                          ? 'bg-gray-700 border-red-500 text-white placeholder-gray-500'
                          : 'bg-gray-700 border-white/10 text-white placeholder-gray-500 focus:border-rose-500'
                        : usernameStatus === 'available' 
                          ? 'bg-gray-50 border-green-500 text-gray-900 placeholder-gray-400' 
                          : usernameStatus === 'taken' || usernameStatus === 'invalid'
                          ? 'bg-gray-50 border-red-500 text-gray-900 placeholder-gray-400'
                          : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-rose-500'
                    }`}
                    maxLength={20}
                    data-testid="input-username"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${theme === 'dark' ? 'border-gray-500' : 'border-gray-400'}`} />}
                    {usernameStatus === 'available' && <Check className="w-5 h-5 text-green-500" />}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <AlertCircle className="w-5 h-5 text-red-500" />}
                  </div>
                </div>
                {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
                {usernameStatus === 'available' && <p className="text-xs text-green-500 mt-1">Username is available!</p>}
                <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>3-20 characters. Letters, numbers, and underscores only. Must start with a letter.</p>
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
