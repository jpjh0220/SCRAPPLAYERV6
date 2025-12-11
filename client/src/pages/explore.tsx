import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useMusicStore } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/lib/themeStore';
import { Header } from '@/components/Header';
import { DownloadQueue } from '@/components/DownloadQueue';
import { Search, Download, Check, Loader2, X, Link as LinkIcon, LogIn, Music, Play, Pause, TrendingUp, BarChart3, Users, Flame, ChevronRight, Sparkles, Disc3, Plus } from 'lucide-react';
import type { Track } from '@shared/schema';

const GENRE_CATEGORIES = [
  { id: 'trending', label: 'Trending', query: 'trending music 2024' },
  { id: 'hiphop', label: 'Hip Hop', query: 'hip hop music new' },
  { id: 'rnb', label: 'R&B', query: 'r&b music new releases' },
  { id: 'pop', label: 'Pop', query: 'pop music hits' },
  { id: 'rock', label: 'Rock', query: 'rock music new' },
  { id: 'electronic', label: 'Electronic', query: 'electronic dance music' },
  { id: 'latin', label: 'Latin', query: 'latin music reggaeton' },
  { id: 'country', label: 'Country', query: 'country music new' },
];

interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

interface TrendingTrack {
  id: number;
  videoId: string;
  title: string;
  channel: string;
  filePath: string;
  thumbnail: string | null;
  status: 'downloading' | 'processing' | 'ready' | 'error';
  progress: number;
  addedAt: string;
  userId: string | null;
  isShared: number;
  score: number;
  userCount: number;
}

interface ChartTrack {
  id: number;
  videoId: string;
  title: string;
  channel: string;
  filePath: string;
  thumbnail: string | null;
  status: 'downloading' | 'processing' | 'ready' | 'error';
  progress: number;
  addedAt: string;
  userId: string | null;
  isShared: number;
}

interface ChartCategory {
  channel: string;
  tracks: { track: ChartTrack; score: number }[];
}

export default function ExplorePage() {
  const { addToLibrary, addSharedTrackToLibrary, library, sharedLibrary, loadLibrary, loadSharedLibrary, playTrack, currentTrack, isPlaying, togglePlay } = useMusicStore();
  const { isAuthenticated } = useAuth();
  const { theme } = useThemeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [addingToLibraryIds, setAddingToLibraryIds] = useState<Set<string>>(new Set());
  const [urlInput, setUrlInput] = useState('');
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);
  
  const [trendingTracks, setTrendingTracks] = useState<TrendingTrack[]>([]);
  const [charts, setCharts] = useState<ChartCategory[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);
  
  const [discoverVideos, setDiscoverVideos] = useState<YouTubeVideo[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState(true);
  const [activeGenre, setActiveGenre] = useState('trending');

  const loadDiscoverMusic = useCallback(async (query: string) => {
    setIsLoadingDiscover(true);
    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(query + ' official audio')}&limit=16`
      );
      
      if (!response.ok) {
        console.error("Backend search failed:", response.status);
        setDiscoverVideos([]);
        return;
      }
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setDiscoverVideos(data.map((item: any) => ({
          id: item.id,
          title: item.title,
          channel: item.channel,
          thumbnail: item.thumbnail,
          url: item.url
        })));
      } else {
        setDiscoverVideos([]);
      }
    } catch (error) {
      console.error("Failed to load discover music:", error);
      setDiscoverVideos([]);
    } finally {
      setIsLoadingDiscover(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
    loadSharedLibrary();
    loadTrending();
    loadDiscoverMusic('trending music 2024');
  }, [loadLibrary, loadSharedLibrary, loadDiscoverMusic]);

  const handleGenreClick = (genreId: string, query: string) => {
    setActiveGenre(genreId);
    loadDiscoverMusic(query);
  };

  const loadTrending = async () => {
    setIsLoadingTrending(true);
    try {
      const [trendingRes, chartsRes] = await Promise.all([
        fetch('/api/trending?limit=10'),
        fetch('/api/trending/charts?limit=5')
      ]);
      
      if (trendingRes.ok) {
        const trendingData = await trendingRes.json();
        setTrendingTracks(trendingData);
      }
      
      if (chartsRes.ok) {
        const chartsData = await chartsRes.json();
        setCharts(chartsData);
      }
    } catch (error) {
      console.error("Failed to load trending:", error);
    } finally {
      setIsLoadingTrending(false);
    }
  };

  const allTracks = [...library, ...sharedLibrary].filter(
    (track, index, self) => 
      track.status === 'ready' && 
      index === self.findIndex(t => t.videoId === track.videoId)
  );

  const myReadyTracks = library.filter(track => track.status === 'ready');
  const sharedReadyTracks = sharedLibrary.filter(track => track.status === 'ready');

  const handleSearchWithQuery = async (query: string) => {
    if (!query.trim()) return;

    setSearchQuery(query);
    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(query)}&limit=20`
      );
      
      if (!response.ok) {
        console.error("Backend search failed:", response.status);
        return;
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setSearchResults(data.map((item: any) => ({
          id: item.id,
          title: item.title,
          channel: item.channel,
          thumbnail: item.thumbnail,
          url: item.url
        })));
      }
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => handleSearchWithQuery(searchQuery);

  const handleDownload = async (result: any) => {
    if (!isAuthenticated) {
      setSignInMessage(result.id);
      setTimeout(() => setSignInMessage(null), 3000);
      return;
    }

    if (downloadingIds.has(result.id) || downloadedIds.has(result.id)) return;

    setDownloadingIds(prev => new Set(Array.from(prev).concat(result.id)));
    try {
      await addToLibrary(result.url, {
        title: result.title,
        channel: result.channel,
        thumbnail: result.thumbnail
      });
      setDownloadedIds(prev => new Set(Array.from(prev).concat(result.id)));
    } catch (error) {
      console.error("Download failed", error);
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    }
  };

  const handleUrlSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    
    if (!isAuthenticated) {
      setSignInMessage('url');
      setTimeout(() => setSignInMessage(null), 3000);
      return;
    }
    
    setIsDownloadingUrl(true);
    try {
      await addToLibrary(urlInput);
      setUrlInput('');
    } catch (error) {
      console.error("URL download failed", error);
    } finally {
      setIsDownloadingUrl(false);
    }
  };

  const isInMyLibrary = (videoId: string) => {
    return myReadyTracks.some(track => track.videoId === videoId);
  };

  const isInSharedLibrary = (videoId: string) => {
    return sharedReadyTracks.some(track => track.videoId === videoId);
  };

  const getSharedTrack = (videoId: string) => {
    return sharedReadyTracks.find(track => track.videoId === videoId);
  };

  const handleAddToLibrary = async (result: any) => {
    if (!isAuthenticated) {
      setSignInMessage(result.id);
      setTimeout(() => setSignInMessage(null), 3000);
      return;
    }

    const sharedTrack = getSharedTrack(result.id);
    if (!sharedTrack) return;

    setAddingToLibraryIds(prev => new Set(Array.from(prev).concat(result.id)));
    try {
      const newTrack = await addSharedTrackToLibrary(sharedTrack.id);
      if (newTrack) {
        await loadLibrary();
        const freshLibrary = useMusicStore.getState().library;
        const personalTrack = freshLibrary.find(t => t.videoId === result.id && t.status === 'ready');
        if (personalTrack) {
          playTrack(personalTrack);
        }
      }
    } catch (error) {
      console.error("Add to library failed", error);
    } finally {
      setAddingToLibraryIds(prev => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    }
  };

  const handlePlayFromSearch = (result: any) => {
    const existingTrack = allTracks.find(t => t.videoId === result.id);
    if (existingTrack) {
      if (currentTrack?.videoId === result.id) {
        togglePlay();
      } else {
        playTrack(existingTrack);
      }
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <Header title="Explore" showSearch={false} />

      {!isAuthenticated && (
        <div className={`mx-4 mb-3 p-4 rounded-2xl animate-slide-up ${
          theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'card-elevated'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${
              theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
            }`}>
              <LogIn className="w-5 h-5 text-rose-500" />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>Sign in to download music</p>
              <p className={`text-xs ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>Build your personal library</p>
            </div>
            <a 
              href="/api/login"
              className="btn-primary px-4 py-2 text-white rounded-lg text-sm font-medium"
            >
              Sign in
            </a>
          </div>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search songs, artists, albums..."
            className={`w-full pl-12 pr-12 py-3.5 rounded-full focus:outline-none ${
              theme === 'dark' 
                ? 'bg-gray-800 border border-white/10 text-white placeholder:text-gray-500' 
                : 'input-modern text-gray-900 placeholder:text-gray-400'
            }`}
            data-testid="input-search"
          />
          {searchQuery ? (
            <button 
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              className={`absolute right-14 top-1/2 -translate-y-1/2 p-1 ${
                theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-rose-500 hover:bg-rose-600 rounded-full text-white disabled:opacity-50 transition-all"
            data-testid="button-search-submit"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="relative">
          {signInMessage === 'url' && (
            <div className={`absolute right-0 -top-8 px-3 py-1.5 rounded-lg text-xs text-white whitespace-nowrap z-10 ${
              theme === 'dark' ? 'bg-gray-700 border border-white/10' : 'bg-gray-800'
            }`}>
              Sign in to download
            </div>
          )}
          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste YouTube link..."
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg text-sm focus:outline-none ${
                  theme === 'dark' 
                    ? 'bg-gray-800 border border-white/10 text-white placeholder:text-gray-500' 
                    : 'input-modern text-gray-900 placeholder:text-gray-400'
                }`}
                data-testid="input-url"
              />
            </div>
            <button
              type="submit"
              disabled={!urlInput.trim() || isDownloadingUrl}
              className="px-4 py-2.5 btn-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              data-testid="button-download-url"
            >
              {isDownloadingUrl ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="px-4 mb-3">
        <DownloadQueue />
      </div>

      {isSearching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
        </div>
      )}

      {!isSearching && searchResults.length > 0 && (
        <div className="flex-1 px-4 pb-4 overflow-y-auto">
          <h2 className={`text-sm font-medium mb-3 uppercase tracking-wide ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}>
            Discover music
          </h2>
          <div className="space-y-2">
            {searchResults.map((result) => {
              const inMyLibrary = isInMyLibrary(result.id);
              const inSharedOnly = !inMyLibrary && isInSharedLibrary(result.id);
              const isDownloading = downloadingIds.has(result.id);
              const isAddingToLibrary = addingToLibraryIds.has(result.id);
              const isProcessing = isDownloading || isAddingToLibrary;
              const isCurrent = currentTrack?.videoId === result.id;
              const isCurrentPlaying = isCurrent && isPlaying;
              const canPlay = inMyLibrary || inSharedOnly;

              return (
                <div 
                  key={result.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    theme === 'dark' 
                      ? 'bg-gray-800 hover:bg-gray-750' 
                      : 'card-elevated'
                  } ${isCurrent ? 'ring-2 ring-rose-500' : ''}`}
                  data-testid={`search-result-${result.id}`}
                >
                  <div 
                    className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 cursor-pointer ${
                      theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                    }`}
                    onClick={() => canPlay && handlePlayFromSearch(result)}
                  >
                    <img 
                      src={result.thumbnail}
                      alt={result.title}
                      className="w-full h-full object-cover"
                    />
                    {canPlay && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        {isCurrentPlaying ? (
                          <Pause className="w-5 h-5 text-white fill-current" />
                        ) : (
                          <Play className="w-5 h-5 text-white fill-current" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium truncate ${
                      isCurrent ? 'text-rose-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      {result.title}
                    </h4>
                    <p className={`text-xs truncate ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {result.channel}
                    </p>
                  </div>

                  <div className="relative">
                    {signInMessage === result.id && (
                      <div className={`absolute right-0 bottom-full mb-2 px-3 py-1.5 rounded-lg text-xs text-white whitespace-nowrap z-10 ${
                        theme === 'dark' ? 'bg-gray-700 border border-white/10' : 'bg-gray-800'
                      }`}>
                        Sign in to add
                      </div>
                    )}
                    {inMyLibrary ? (
                      <button 
                        disabled
                        className={`p-2.5 rounded-full transition-all ${
                          theme === 'dark' ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-500'
                        }`}
                        data-testid={`button-in-library-${result.id}`}
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    ) : inSharedOnly ? (
                      <button 
                        onClick={() => handleAddToLibrary(result)}
                        disabled={isProcessing}
                        className={`p-2.5 rounded-full transition-all ${
                          isAddingToLibrary
                          ? theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-400'
                          : theme === 'dark' ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-blue-50 text-blue-500 hover:bg-blue-100'
                        }`}
                        title="Add to your library"
                        data-testid={`button-add-library-${result.id}`}
                      >
                        {isAddingToLibrary ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Plus className="w-5 h-5" />
                        )}
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleDownload(result)}
                        disabled={isProcessing}
                        className={`p-2.5 rounded-full transition-all ${
                          isDownloading
                          ? theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-400'
                          : theme === 'dark' ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                        }`}
                        title="Download"
                        data-testid={`button-download-${result.id}`}
                      >
                        {isDownloading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Download className="w-5 h-5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isSearching && searchResults.length === 0 && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
          <section>
            <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
              {GENRE_CATEGORIES.map((genre) => (
                <button
                  key={genre.id}
                  onClick={() => handleGenreClick(genre.id, genre.query)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                    activeGenre === genre.id
                      ? 'bg-rose-500 text-white'
                      : theme === 'dark'
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  data-testid={`genre-button-${genre.id}`}
                >
                  {genre.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className={`p-1.5 rounded-lg ${theme === 'dark' ? 'bg-purple-500/20' : 'bg-purple-50'}`}>
                <Sparkles className="w-4 h-4 text-purple-500" />
              </div>
              <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Discover New Music
              </h2>
            </div>
            {isLoadingDiscover ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
              </div>
            ) : discoverVideos.filter(v => !isInMyLibrary(v.id)).length === 0 ? (
              <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No new music found. Try another genre!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {discoverVideos.filter(v => !isInMyLibrary(v.id)).slice(0, 8).map((video) => {
                  const inMyLibrary = isInMyLibrary(video.id);
                  const inSharedOnly = !inMyLibrary && isInSharedLibrary(video.id);
                  const isDownloading = downloadingIds.has(video.id);
                  const isAddingToLibrary = addingToLibraryIds.has(video.id);
                  const isProcessing = isDownloading || isAddingToLibrary;

                  return (
                    <div
                      key={video.id}
                      className={`rounded-xl overflow-hidden transition-all ${
                        theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
                      }`}
                      data-testid={`discover-video-${video.id}`}
                    >
                      <div className="relative aspect-video">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                        {inMyLibrary ? (
                          <button
                            disabled
                            className="absolute bottom-2 right-2 p-2 rounded-full bg-green-500 text-white"
                            data-testid={`button-in-library-discover-${video.id}`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        ) : inSharedOnly ? (
                          <button
                            onClick={() => handleAddToLibrary(video)}
                            disabled={isProcessing}
                            className={`absolute bottom-2 right-2 p-2 rounded-full transition-all ${
                              isAddingToLibrary
                                ? 'bg-gray-500 text-white'
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                            title="Add to your library"
                            data-testid={`button-add-library-discover-${video.id}`}
                          >
                            {isAddingToLibrary ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDownload(video)}
                            disabled={isProcessing}
                            className={`absolute bottom-2 right-2 p-2 rounded-full transition-all ${
                              isDownloading
                                ? 'bg-gray-500 text-white'
                                : 'bg-rose-500 hover:bg-rose-600 text-white'
                            }`}
                            title="Download"
                            data-testid={`button-download-discover-${video.id}`}
                          >
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className="p-3">
                        <h4 className={`text-sm font-medium line-clamp-2 ${
                          theme === 'dark' ? 'text-white' : 'text-gray-900'
                        }`}>
                          {video.title}
                        </h4>
                        <p className={`text-xs mt-1 truncate ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          {video.channel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {isLoadingTrending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
            </div>
          ) : trendingTracks.length > 0 ? (
            <>
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-lg ${theme === 'dark' ? 'bg-orange-500/20' : 'bg-orange-50'}`}>
                    <Users className="w-4 h-4 text-orange-500" />
                  </div>
                  <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Popular in Community
                  </h2>
                </div>
                <div className="space-y-2">
                  {trendingTracks.slice(0, 10).map((track, index) => {
                    const isCurrent = currentTrack?.videoId === track.videoId;
                    const isCurrentPlaying = isCurrent && isPlaying;
                    return (
                      <div 
                        key={`trending-${track.videoId}-${index}`}
                        onClick={() => playTrack(track)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                          theme === 'dark' 
                            ? 'bg-gray-800 hover:bg-gray-750' 
                            : 'card-elevated hover:shadow-md'
                        } ${isCurrent ? 'ring-2 ring-rose-500' : ''}`}
                        data-testid={`trending-track-${track.id}`}
                      >
                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm ${
                          index === 0 
                            ? theme === 'dark' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
                            : index === 1 
                            ? theme === 'dark' ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-100 text-gray-600'
                            : index === 2 
                            ? theme === 'dark' ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-50 text-orange-600'
                            : theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-50 text-gray-500'
                        }`}>
                          {index + 1}
                        </div>
                        <div className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 ${
                          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                        }`}>
                          {track.thumbnail ? (
                            <img 
                              src={track.thumbnail}
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            {isCurrentPlaying ? (
                              <Pause className="w-5 h-5 text-white fill-current" />
                            ) : (
                              <Play className="w-5 h-5 text-white fill-current" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-medium truncate ${
                            isCurrent ? 'text-rose-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }`}>
                            {track.title}
                          </h4>
                          <p className={`text-xs truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            {track.channel}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
                          <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                            {track.userCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {charts.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`p-1.5 rounded-lg ${theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'}`}>
                      <BarChart3 className="w-4 h-4 text-rose-500" />
                    </div>
                    <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Charts by Artist
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {charts.map((chart) => (
                      <div 
                        key={chart.channel}
                        className={`p-4 rounded-xl ${
                          theme === 'dark' ? 'bg-gray-800' : 'bg-white shadow-sm border border-gray-100'
                        }`}
                        data-testid={`chart-${chart.channel.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className={`w-4 h-4 ${theme === 'dark' ? 'text-rose-400' : 'text-rose-500'}`} />
                          <Link 
                            href={`/artist/${encodeURIComponent(chart.channel)}`}
                            className={`group flex items-center gap-1 font-semibold text-sm transition-colors ${
                              theme === 'dark' 
                                ? 'text-white hover:text-rose-400' 
                                : 'text-gray-900 hover:text-rose-500'
                            }`}
                            data-testid={`link-artist-${chart.channel.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            {chart.channel}
                            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {chart.tracks.length} {chart.tracks.length === 1 ? 'track' : 'tracks'}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {chart.tracks.map((item, idx) => {
                            const isCurrent = currentTrack?.videoId === item.track.videoId;
                            const isCurrentPlaying = isCurrent && isPlaying;
                            return (
                              <div 
                                key={`chart-track-${chart.channel}-${item.track.videoId}-${idx}`}
                                onClick={() => playTrack(item.track)}
                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                                  theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                } ${isCurrent ? 'bg-rose-500/10' : ''}`}
                              >
                                <span className={`w-5 text-center text-xs font-medium ${
                                  theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                                }`}>
                                  {idx + 1}
                                </span>
                                <div className={`relative w-10 h-10 rounded overflow-hidden shrink-0 ${
                                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                                }`}>
                                  {item.track.thumbnail ? (
                                    <img 
                                      src={item.track.thumbnail}
                                      alt={item.track.title}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Music className="w-4 h-4 text-gray-400" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                    {isCurrentPlaying ? (
                                      <Pause className="w-4 h-4 text-white fill-current" />
                                    ) : (
                                      <Play className="w-4 h-4 text-white fill-current" />
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className={`text-sm truncate ${
                                    isCurrent ? 'text-rose-500 font-medium' : theme === 'dark' ? 'text-white' : 'text-gray-900'
                                  }`}>
                                    {item.track.title}
                                  </h4>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 animate-scale-in">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${
                theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
              }`}>
                <Music className="w-12 h-12 text-rose-400" />
              </div>
              <p className={`font-bold text-2xl ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>Discover music</p>
              <p className={`text-sm mt-2 ${
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
              }`}>Search for your favorite songs</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
