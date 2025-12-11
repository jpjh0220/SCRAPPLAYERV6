import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { Heart, ThumbsDown, MessageCircle, Share2, MoreVertical, Trash2, User, X, Play, Pause, Music } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { useThemeStore } from '@/lib/themeStore';
import { useMusicStore, type Track } from '@/lib/store';
import { cleanTitle, normalizeArtist } from '@/lib/titleUtils';
import { useQueryClient } from '@tanstack/react-query';

function cleanUsername(username: string | undefined): string {
  if (!username) return 'user';
  if (username.includes('@')) {
    return username.split('@')[0];
  }
  return username;
}

interface Profile {
  id: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Post {
  id: number;
  authorId: string;
  content: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  trackId: number | null;
  track?: Track | null;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt: string;
  author: Profile | null;
  userReaction: string | null;
}

interface PostCardProps {
  post: Post;
  onDelete?: () => void;
  onShare?: () => void;
}

export function PostCard({ post, onDelete, onShare }: PostCardProps) {
  const { user, isAuthenticated } = useAuth();
  const { theme } = useThemeStore();
  const { playTrack, currentTrack, isPlaying, togglePlay } = useMusicStore();
  const queryClient = useQueryClient();
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [dislikesCount, setDislikesCount] = useState(post.dislikesCount);
  const [sharesCount, setSharesCount] = useState(post.sharesCount);
  const [userReaction, setUserReaction] = useState<string | null>(post.userReaction);
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareText, setShareText] = useState('');
  const [hasShared, setHasShared] = useState(false);
  const [sharedTrack, setSharedTrack] = useState<Track | null>(post.track || null);

  const closeShareModal = useCallback(() => {
    setShowShareModal(false);
    setShareText('');
  }, []);

  useEffect(() => {
    if (post.trackId && !sharedTrack) {
      fetch(`/api/tracks/${post.trackId}`)
        .then(res => res.ok ? res.json() : null)
        .then(track => {
          if (track) setSharedTrack(track);
        })
        .catch(err => console.error('Failed to fetch shared track:', err));
    }
  }, [post.trackId, sharedTrack]);

  useEffect(() => {
    if (!showShareModal) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeShareModal();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showShareModal, closeShareModal]);

  const currentUserId = isAuthenticated ? (user as any)?.id || (user as any)?.claims?.sub : null;
  const isOwner = currentUserId === post.authorId;

  const handleReaction = async (type: 'like' | 'dislike') => {
    if (!isAuthenticated) {
      window.location.href = '/api/login';
      return;
    }

    try {
      if (userReaction === type) {
        await fetch(`/api/posts/${post.id}/reactions`, { method: 'DELETE' });
        setUserReaction(null);
        if (type === 'like') setLikesCount(likesCount - 1);
        else setDislikesCount(dislikesCount - 1);
      } else {
        const res = await fetch(`/api/posts/${post.id}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
        if (res.ok) {
          const data = await res.json();
          setLikesCount(data.likesCount);
          setDislikesCount(data.dislikesCount);
          setUserReaction(type);
        }
      }
    } catch (error) {
      console.error('Failed to react:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      if (res.ok && onDelete) {
        onDelete();
      }
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
    setShowMenu(false);
  };

  const loadComments = async () => {
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  };

  const handleComment = async () => {
    if (!newComment.trim() || isSubmittingComment) return;
    
    setIsSubmittingComment(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments([comment, ...comments]);
        setNewComment('');
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const toggleComments = () => {
    if (!showComments) {
      loadComments();
    }
    setShowComments(!showComments);
  };

  const openShareModal = () => {
    if (!isAuthenticated) {
      window.location.href = '/api/login';
      return;
    }
    if (hasShared) return;
    setShowShareModal(true);
  };

  const handleShare = async () => {
    if (!isAuthenticated || isSharing || hasShared) return;
    
    setIsSharing(true);
    
    try {
      const res = await fetch(`/api/posts/${post.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: shareText }),
      });
      if (res.ok) {
        setSharesCount(sharesCount + 1);
        setHasShared(true);
        closeShareModal();
        queryClient.invalidateQueries({ queryKey: ['/api/feed'] });
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        if (onShare) onShare();
      } else {
        const data = await res.json();
        if (data.error === 'Already shared') {
          setHasShared(true);
        }
      }
    } catch (error) {
      console.error('Failed to share:', error);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className={`overflow-hidden animate-slide-up rounded-xl shadow-sm ${theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'card-elevated'}`} data-testid={`post-card-${post.id}`}>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <Link href={`/user/${post.authorId}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {post.author?.avatarUrl ? (
              <img 
                src={post.author.avatarUrl} 
                alt={post.author.displayName || 'User'} 
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{post.author?.displayName || 'User'}</p>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                @{cleanUsername(post.author?.username)} · {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </p>
            </div>
          </Link>

          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                data-testid={`button-post-menu-${post.id}`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              
              {showMenu && (
                <div className={`absolute right-0 mt-1 rounded-lg shadow-lg py-1 z-10 ${theme === 'dark' ? 'bg-gray-700 border border-white/10' : 'bg-white border border-gray-200'}`}>
                  <button
                    onClick={handleDelete}
                    className={`flex items-center gap-2 px-4 py-2 text-red-500 w-full text-left ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                    data-testid={`button-delete-post-${post.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {post.content && (
          <p className={`mt-3 whitespace-pre-wrap ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{post.content}</p>
        )}

        {post.mediaUrl && (
          <div className="mt-3 rounded-xl overflow-hidden">
            {post.mediaType === 'photo' ? (
              <img src={post.mediaUrl} alt="" className="w-full max-h-96 object-cover" />
            ) : post.mediaType === 'video' ? (
              <video src={post.mediaUrl} className="w-full max-h-96" controls />
            ) : null}
          </div>
        )}

        {sharedTrack && (
          <div
            onClick={() => {
              if (currentTrack?.videoId === sharedTrack.videoId) togglePlay();
              else playTrack(sharedTrack);
            }}
            className={`mt-3 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
              currentTrack?.videoId === sharedTrack.videoId 
                ? theme === 'dark' ? 'bg-rose-500/20 ring-1 ring-rose-500' : 'bg-rose-50 ring-1 ring-rose-200'
                : theme === 'dark' ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
            }`}
            data-testid={`shared-track-${sharedTrack.videoId}`}
          >
            <div className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 ${
              theme === 'dark' ? 'bg-gray-600' : 'bg-gray-200'
            }`}>
              {sharedTrack.thumbnail ? (
                <img 
                  src={sharedTrack.thumbnail}
                  alt={sharedTrack.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${sharedTrack.videoId}/default.jpg`;
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <div className={`absolute inset-0 flex items-center justify-center bg-black/30 ${
                currentTrack?.videoId === sharedTrack.videoId ? 'opacity-100' : 'opacity-0 hover:opacity-100'
              } transition-opacity`}>
                {currentTrack?.videoId === sharedTrack.videoId && isPlaying ? (
                  <Pause className="w-5 h-5 text-white fill-current" />
                ) : (
                  <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm truncate ${
                currentTrack?.videoId === sharedTrack.videoId ? 'text-rose-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                {cleanTitle(sharedTrack.title)}
              </p>
              <p className={`text-xs truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                {normalizeArtist(sharedTrack.channel)}
              </p>
            </div>
            <div className={`p-2 rounded-full ${
              currentTrack?.videoId === sharedTrack.videoId && isPlaying
                ? 'bg-rose-500 text-white'
                : theme === 'dark' ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'
            }`}>
              {currentTrack?.videoId === sharedTrack.videoId && isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`flex items-center justify-between px-4 py-3 border-t ${theme === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
        <button
          onClick={() => handleReaction('like')}
          className={`flex items-center gap-1.5 transition-all ${
            userReaction === 'like' ? 'text-rose-500' : theme === 'dark' ? 'text-gray-400 hover:text-rose-500' : 'text-gray-400 hover:text-rose-500'
          }`}
          data-testid={`button-like-${post.id}`}
        >
          <Heart className={`w-5 h-5 ${userReaction === 'like' ? 'fill-current' : ''}`} />
          <span className="text-sm">{likesCount}</span>
        </button>

        <button
          onClick={() => handleReaction('dislike')}
          className={`flex items-center gap-1.5 transition-all ${
            userReaction === 'dislike' ? 'text-blue-500' : theme === 'dark' ? 'text-gray-400 hover:text-blue-500' : 'text-gray-400 hover:text-blue-500'
          }`}
          data-testid={`button-dislike-${post.id}`}
        >
          <ThumbsDown className={`w-5 h-5 ${userReaction === 'dislike' ? 'fill-current' : ''}`} />
          <span className="text-sm">{dislikesCount}</span>
        </button>

        <button
          onClick={toggleComments}
          className={`flex items-center gap-1.5 transition-all ${theme === 'dark' ? 'text-gray-400 hover:text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
          data-testid={`button-comments-${post.id}`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">{post.commentsCount}</span>
        </button>

        <button
          onClick={openShareModal}
          disabled={isSharing || hasShared}
          className={`flex items-center gap-1.5 transition-all ${
            hasShared ? 'text-violet-500' : theme === 'dark' ? 'text-gray-400 hover:text-violet-500' : 'text-gray-400 hover:text-violet-500'
          } ${hasShared ? 'cursor-default' : ''}`}
          data-testid={`button-share-${post.id}`}
        >
          <Share2 className={`w-5 h-5 ${hasShared ? 'fill-current' : ''}`} />
          <span className="text-sm">{sharesCount}</span>
        </button>
      </div>

      {showComments && (
        <div className={`px-4 py-3 border-t space-y-3 animate-slide-up ${theme === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
          {isAuthenticated && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className={`flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none ${
                  theme === 'dark'
                    ? 'bg-gray-700 border border-white/10 text-white placeholder-gray-500 focus:border-rose-500'
                    : 'input-modern text-gray-900 placeholder-gray-400'
                }`}
                onKeyDown={(e) => e.key === 'Enter' && handleComment()}
                data-testid={`input-comment-${post.id}`}
              />
              <button
                onClick={handleComment}
                disabled={!newComment.trim() || isSubmittingComment}
                className="px-4 py-2 btn-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`button-submit-comment-${post.id}`}
              >
                Send
              </button>
            </div>
          )}

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-2 py-2">
                {comment.author?.avatarUrl ? (
                  <img 
                    src={comment.author.avatarUrl} 
                    alt="" 
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{comment.author?.displayName || 'User'}</span>
                    <span className={`ml-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>@{cleanUsername(comment.author?.username)}</span>
                  </p>
                  <p className={`text-sm mt-0.5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{comment.content}</p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className={`text-sm text-center py-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>No comments yet</p>
            )}
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={closeShareModal}>
          <div className={`rounded-2xl w-full max-w-md shadow-xl animate-scale-in ${theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Share Post</h3>
              <button
                onClick={closeShareModal}
                className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <textarea
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                placeholder="Add a comment to your share (optional)..."
                className={`w-full px-4 py-3 rounded-lg focus:outline-none resize-none ${
                  theme === 'dark'
                    ? 'bg-gray-700 border border-white/10 text-white placeholder-gray-500 focus:border-rose-500'
                    : 'input-modern text-gray-900 placeholder-gray-400'
                }`}
                rows={3}
                data-testid={`input-share-text-${post.id}`}
              />
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="w-full py-3 btn-primary text-white rounded-lg font-semibold disabled:opacity-50"
                data-testid={`button-confirm-share-${post.id}`}
              >
                {isSharing ? 'Sharing...' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
