import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { PostCard } from '@/components/PostCard';
import { PostComposer } from '@/components/PostComposer';
import { useMusicStore, type Track } from '@/lib/store';
import { useThemeStore } from '@/lib/themeStore';
import { Play, Pause, Music, User, Sparkles, Download, Library } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

interface YouTubeVideo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt?: string;
  status: string;
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
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt: string;
  author: Profile | null;
  userReaction: string | null;
}

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const { theme } = useThemeStore();
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'music'>('feed');
  const [pickedForYou, setPickedForYou] = useState<YouTubeVideo[]>([]);
  const [loadingPicked, setLoadingPicked] = useState(false);

  const { 
    library, 
    sharedLibrary, 
    loadLibrary, 
    loadSharedLibrary, 
    playTrack, 
    currentTrack, 
    isPlaying, 
    togglePlay,
    addToLibrary,
    downloadQueue,
    pendingTrack
  } = useMusicStore();

  useEffect(() => {
    loadLibrary();
    loadSharedLibrary();
    fetchFeed();
    fetchPickedForYou();
  }, [isAuthenticated]);

  const fetchPickedForYou = async () => {
    setLoadingPicked(true);
    try {
      const res = await fetch('/api/youtube/for-you?limit=12');
      if (res.ok) {
        const data = await res.json();
        setPickedForYou(data);
      }
    } catch (error) {
      console.error('Failed to fetch picked for you:', error);
    } finally {
      setLoadingPicked(false);
    }
  };

  const handleDownloadVideo = (video: YouTubeVideo) => {
    addToLibrary(`https://www.youtube.com/watch?v=${video.videoId}`, {
      title: video.title,
      channel: video.channel,
      thumbnail: video.thumbnail
    });
  };

  const fetchFeed = async () => {
    try {
      if (isAuthenticated) {
        const res = await fetch('/api/feed');
        if (res.ok) {
          const data = await res.json();
          setPosts(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewPost = (post: Post) => {
    setPosts([post, ...posts]);
  };

  const allTracksWithStatus = [...library, ...sharedLibrary].filter(
    (track, index, self) => 
      index === self.findIndex(t => t.videoId === track.videoId)
  );

  const allTracks = allTracksWithStatus.filter(t => t.status === 'ready');

  const quickPicks = allTracks.slice(0, 6);

  const TrackCard = ({ track }: { track: typeof allTracks[0] }) => {
    const isCurrent = currentTrack?.videoId === track.videoId;
    const isCurrentPlaying = isCurrent && isPlaying;
    const thumbnail = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;

    return (
      <div 
        onClick={() => {
          if (isCurrent) togglePlay();
          else playTrack(track);
        }}
        className={`shrink-0 w-40 cursor-pointer group animate-slide-up`}
        data-testid={`track-card-${track.videoId}`}
      >
        <div className={`relative aspect-square rounded-2xl overflow-hidden ${
          theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
        } ${isCurrent ? 'ring-2 ring-rose-500' : ''}`}>
          <img 
            src={thumbnail}
            alt={track.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${track.videoId}/default.jpg`;
            }}
          />
          <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 ${isCurrent ? 'opacity-100' : ''}`}>
            <div className={`p-4 rounded-full bg-rose-500 shadow-lg ${isCurrentPlaying ? 'animate-pulse' : ''}`}>
              {isCurrentPlaying ? (
                <Pause className="w-7 h-7 text-white fill-current" />
              ) : (
                <Play className="w-7 h-7 text-white fill-current ml-0.5" />
              )}
            </div>
          </div>
        </div>
        <h4 className={`mt-3 text-sm font-bold truncate ${
          isCurrent ? 'text-rose-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'
        }`}>{track.title}</h4>
        <p className={`text-xs truncate font-medium ${
          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
        }`}>{track.channel}</p>
      </div>
    );
  };

  const YouTubeVideoCard = ({ video }: { video: YouTubeVideo }) => {
    const queueItem = downloadQueue.find(q => q.videoId === video.videoId);
    const isQueueDownloading = queueItem?.status === 'downloading' || queueItem?.status === 'processing' || queueItem?.status === 'pending';
    const isPending = pendingTrack?.videoId === video.videoId;
    const libraryTrack = allTracksWithStatus.find(t => t.videoId === video.videoId);
    const isLibraryDownloading = libraryTrack && (libraryTrack.status === 'downloading' || libraryTrack.status === 'processing');
    const isDownloading = isQueueDownloading || isPending || isLibraryDownloading;
    const isCurrent = currentTrack?.videoId === video.videoId;
    const isCurrentPlaying = isCurrent && isPlaying;

    const handleClick = () => {
      if (libraryTrack && libraryTrack.status === 'ready') {
        if (isCurrent) togglePlay();
        else playTrack(libraryTrack);
      } else if (isDownloading) {
      } else {
        handleDownloadVideo(video);
      }
    };

    const showPlayButton = libraryTrack?.status === 'ready';
    const showDownloadingState = isDownloading;

    return (
      <div 
        onClick={handleClick}
        className={`shrink-0 w-40 group animate-slide-up cursor-pointer`}
        data-testid={`youtube-card-${video.videoId}`}
      >
        <div 
          className={`relative aspect-square rounded-2xl overflow-hidden ${
            theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
          } ${isCurrent || isPending ? 'ring-2 ring-rose-500' : ''}`}
        >
          <img 
            src={video.thumbnail}
            alt={video.title}
            className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${showDownloadingState ? 'opacity-70' : ''}`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.videoId}/default.jpg`;
            }}
          />
          <div className={`absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 ${isCurrent || isPending || showDownloadingState ? 'opacity-100' : ''}`}>
            {showPlayButton ? (
              <div className={`p-4 rounded-full bg-rose-500 shadow-lg ${isCurrentPlaying ? 'animate-pulse' : ''}`}>
                {isCurrentPlaying ? (
                  <Pause className="w-7 h-7 text-white fill-current" />
                ) : (
                  <Play className="w-7 h-7 text-white fill-current ml-0.5" />
                )}
              </div>
            ) : showDownloadingState ? (
              <div className="p-4 rounded-full bg-gray-500 shadow-lg">
                <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="p-4 rounded-full bg-rose-500 hover:bg-rose-600 shadow-lg transition-all">
                <Download className="w-7 h-7 text-white" />
              </div>
            )}
          </div>
        </div>
        <h4 className={`mt-3 text-sm font-bold truncate ${
          isCurrent || isPending ? 'text-rose-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'
        }`}>{video.title}</h4>
        <p className={`text-xs truncate font-medium ${
          showDownloadingState ? 'text-rose-500' : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
        }`}>{showDownloadingState ? 'Downloading...' : video.channel}</p>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <Header title="ScrapPlayer" />

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center animate-slide-up">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center mb-8 shadow-lg">
            <Music className="w-16 h-16 text-white" />
          </div>
          <h1 className={`text-4xl font-black mb-4 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>Welcome to ScrapPlayer</h1>
          <p className={`mb-10 max-w-sm text-lg ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}>
            Discover music, connect with friends, and share your favorite tracks
          </p>
          <a
            href="/api/login"
            className="btn-primary px-10 py-4 text-white rounded-full font-bold text-lg"
            data-testid="button-get-started"
          >
            Get Started
          </a>

          {quickPicks.length > 0 && (
            <div className="w-full mt-14">
              <h2 className={`text-2xl font-black text-left mb-6 ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Trending Music
              </h2>
              <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
                {quickPicks.map((track) => (
                  <TrackCard key={track.videoId} track={track} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <Header title="ScrapPlayer" />

      <div className={`flex border-b ${
        theme === 'dark' ? 'bg-gray-800 border-white/10' : 'bg-white border-gray-200'
      }`}>
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 py-4 text-base font-bold transition-all duration-200 relative ${
            activeTab === 'feed' 
              ? 'text-rose-500' 
              : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'
          }`}
          data-testid="tab-feed"
        >
          Feed
          {activeTab === 'feed' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-rose-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('music')}
          className={`flex-1 py-4 text-base font-bold transition-all duration-200 relative ${
            activeTab === 'music' 
              ? 'text-rose-500' 
              : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'
          }`}
          data-testid="tab-music"
        >
          Music
          {activeTab === 'music' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-rose-500 rounded-full" />
          )}
        </button>
      </div>

      <div className="flex-1 px-4 py-4">
        {activeTab === 'feed' ? (
          <>
            <PostComposer onPost={handleNewPost} />

            <div className="mt-4 space-y-4">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full" />
                </div>
              ) : posts.length > 0 ? (
                posts.map((post) => (
                  <PostCard 
                    key={post.id} 
                    post={post}
                    onDelete={() => setPosts(posts.filter(p => p.id !== post.id))}
                    onShare={fetchFeed}
                  />
                ))
              ) : (
                <div className={`text-center py-16 p-8 animate-scale-in rounded-2xl ${
                  theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
                }`}>
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
                    theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
                  }`}>
                    <User className="w-12 h-12 text-rose-400" />
                  </div>
                  <p className={`font-bold text-2xl mb-2 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>Your feed is empty</p>
                  <p className={`text-base mt-2 ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Follow other users to see their posts here
                  </p>
                  <Link href="/users" className="inline-block mt-6 btn-primary px-8 py-3 text-white rounded-full text-base font-bold">
                    Discover Users
                  </Link>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-8">
            {quickPicks.length > 0 && (
              <section>
                <h2 className={`text-xl font-bold mb-4 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Quick picks
                </h2>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {quickPicks.map((track) => (
                    <TrackCard key={track.videoId} track={track} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-rose-500" />
                <h2 className={`text-xl font-bold ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Picked for you
                </h2>
              </div>
              {loadingPicked ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full" />
                </div>
              ) : pickedForYou.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {pickedForYou.map((video) => (
                    <YouTubeVideoCard key={`picked-${video.videoId}`} video={video} />
                  ))}
                </div>
              ) : (
                <div className={`text-center py-6 rounded-xl ${
                  theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-100'
                }`}>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>Add music to your library to get personalized suggestions</p>
                </div>
              )}
            </section>

            {allTracks.length > 6 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Library className="w-5 h-5 text-rose-500" />
                  <h2 className={`text-xl font-bold ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Your library
                  </h2>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {allTracks.slice(6).map((track) => (
                    <TrackCard key={track.videoId} track={track} />
                  ))}
                </div>
              </section>
            )}

            {allTracks.length === 0 && pickedForYou.length === 0 && !loadingPicked && (
              <div className={`flex flex-col items-center justify-center py-16 text-center p-8 animate-scale-in rounded-2xl ${
                theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
              }`}>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 ${
                  theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
                }`}>
                  <Music className="w-10 h-10 text-rose-400" />
                </div>
                <p className={`font-bold text-xl ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>No music yet</p>
                <p className={`text-sm mt-2 ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>Go to Explore to discover and download music</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
