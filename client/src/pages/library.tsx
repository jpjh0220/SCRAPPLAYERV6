import { useEffect, useState } from 'react';
import { useMusicStore, Track } from '@/lib/store';
import { useThemeStore } from '@/lib/themeStore';
import { Header } from '@/components/Header';
import { cleanTitle, normalizeArtist } from '@/lib/titleUtils';
import { Play, Pause, Trash2, Globe, Lock, Music, User, LayoutList, Users, ChevronDown, ChevronRight, ListMusic, Share2, Plus, Loader2, Check, X } from 'lucide-react';
import { Link } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ViewMode = 'list' | 'artists';

export default function LibraryPage() {
  const { 
    library, 
    sharedLibrary, 
    libraryView, 
    setLibraryView, 
    playTrack, 
    currentTrack, 
    isPlaying, 
    togglePlay, 
    loadLibrary, 
    loadSharedLibrary,
    deleteTrack,
    toggleShareTrack,
    addSharedTrackToLibrary
  } = useMusicStore();
  const { theme } = useThemeStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set());
  const [addingTracks, setAddingTracks] = useState<Set<number>>(new Set());
  const [addedTracks, setAddedTracks] = useState<Set<number>>(new Set());
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTrack, setShareTrack] = useState<Track | null>(null);
  const [shareComment, setShareComment] = useState('');

  const isTrackInMyLibrary = (videoId: string) => {
    return library.some(t => t.videoId === videoId);
  };

  const handleAddToLibrary = async (track: Track) => {
    if (addingTracks.has(track.id) || addedTracks.has(track.id)) return;
    if (isTrackInMyLibrary(track.videoId)) {
      toast({
        title: "Already in library",
        description: "This track is already in your personal library.",
      });
      return;
    }

    setAddingTracks(prev => new Set(prev).add(track.id));
    
    const result = await addSharedTrackToLibrary(track.id);
    
    setAddingTracks(prev => {
      const next = new Set(prev);
      next.delete(track.id);
      return next;
    });

    if (result) {
      setAddedTracks(prev => new Set(prev).add(track.id));
      toast({
        title: "Added to library!",
        description: `"${cleanTitle(track.title)}" has been added to your library.`,
      });
    } else {
      toast({
        title: "Failed to add",
        description: "Could not add this track to your library. Please try again.",
        variant: "destructive",
      });
    }
  };

  const shareToFeedMutation = useMutation({
    mutationFn: async ({ trackId, content }: { trackId: number; content?: string }) => {
      const response = await apiRequest('POST', '/api/posts', { 
        trackId, 
        content: content?.trim() || null 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feed'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast({
        title: "Shared to feed!",
        description: "Your track has been posted to your feed.",
      });
      setShareDialogOpen(false);
      setShareTrack(null);
      setShareComment('');
    },
    onError: () => {
      toast({
        title: "Failed to share",
        description: "Could not share this track. Please try again.",
        variant: "destructive",
      });
    },
  });

  const openShareDialog = (track: Track) => {
    setShareTrack(track);
    setShareComment('');
    setShareDialogOpen(true);
  };

  const handleShareSubmit = () => {
    if (shareTrack) {
      shareToFeedMutation.mutate({ trackId: shareTrack.id, content: shareComment });
    }
  };

  useEffect(() => {
    loadLibrary();
    loadSharedLibrary();
    const interval = setInterval(() => {
      loadLibrary();
      loadSharedLibrary();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadLibrary, loadSharedLibrary]);

  const currentTracks: Track[] = libraryView === 'mine' ? library : sharedLibrary;
  const readyTracks = currentTracks.filter(t => t.status === 'ready');
  
  const sortedTracks = [...readyTracks].sort((a, b) => 
    new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  );

  const MEDIA_CHANNELS = new Set([
    'worldstarhiphop', 'wshh', 'thizzler', 'on the radar', 'ontheradar',
    'lyrical lemonade', 'elevator', 'no jumper', 'genius', 'xxl',
    'hot 97', 'the breakfast club', 'complex', 'audiomack', 'vevo',
    'official', 'music video', 'topic', 'colors', 'colors show',
    'a colors show', 'npr music', 'tiny desk', 'the tonight show',
    'jimmy fallon', 'jimmy kimmel', 'late night', 'snl', 'saturday night live'
  ]);

  const isMediaChannel = (name: string): boolean => {
    const lower = name.toLowerCase().trim();
    if (MEDIA_CHANNELS.has(lower)) return true;
    
    const mediaPatterns = [
      /thizzler/i, /worldstar/i, /on\s*the\s*radar/i, /lyrical\s*lemonade/i,
      /genius/i, /colors?\s*show/i, /tiny\s*desk/i, /npr\s*music/i,
      /tonight\s*show/i, /late\s*night/i, /jimmy\s*(fallon|kimmel)/i
    ];
    return mediaPatterns.some(p => p.test(lower));
  };

  const extractArtistFromTitle = (title: string): string | null => {
    const separatorPatterns = [
      /^([^-–—:|\\/]+?)\s*[-–—]\s*.+$/,
      /^([^:]+?):\s*(?:tiny desk|colors|live|session|concert|performance)/i,
      /^([^|]+?)\s*\|\s*.+$/,
      /^(.+?)\s*[-–—]\s*["'].*["']/,
      /^([^x×]+?)\s+[x×]\s+.+$/i,
    ];
    
    for (const pattern of separatorPatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const potential = normalizeArtist(match[1]);
        if (potential.length >= 2 && potential.length <= 50) {
          const skipWords = ['official', 'audio', 'video', 'lyrics', 'hd', 'hq', 'new', 'exclusive', 'the', 'a', 'live', 'full'];
          if (!skipWords.some(w => potential.toLowerCase() === w)) {
            return potential;
          }
        }
      }
    }
    return null;
  };

  const extractAllArtists = (track: Track): string[] => {
    const artists = new Set<string>();
    const channelNormalized = normalizeArtist(track.channel);
    
    if (isMediaChannel(track.channel)) {
      const titleArtist = extractArtistFromTitle(track.title);
      if (titleArtist && !isMediaChannel(titleArtist)) {
        artists.add(titleArtist);
      }
    } else if (channelNormalized && channelNormalized.length >= 2) {
      artists.add(channelNormalized);
    }
    
    const featPatterns = [
      /\s*[\(\[]\s*(?:feat\.?|ft\.?|featuring|with|w\/)\s*([^\)\]]+)\s*[\)\]]/gi,
      /\s*(?:feat\.?|ft\.?|featuring)\s+([^,\-–—\(\[]+)/gi,
    ];
    
    for (const pattern of featPatterns) {
      let match;
      const titleCopy = track.title;
      while ((match = pattern.exec(titleCopy)) !== null) {
        const featuredArtists = match[1].split(/[,&]/).map(a => normalizeArtist(a.trim()));
        for (const artist of featuredArtists) {
          if (artist && artist.length >= 2 && !isMediaChannel(artist)) {
            artists.add(artist);
          }
        }
      }
    }
    
    if (artists.size === 0 && channelNormalized && channelNormalized.length >= 2) {
      artists.add(channelNormalized);
    }
    
    return Array.from(artists);
  };

  const artistCanonicalMap = new Map<string, string>();
  readyTracks.forEach(track => {
    const allArtists = extractAllArtists(track);
    allArtists.forEach(artist => {
      const key = artist.toLowerCase();
      const existing = artistCanonicalMap.get(key);
      if (!existing || (artist.replace(/[^A-Z]/g, '').length > existing.replace(/[^A-Z]/g, '').length)) {
        artistCanonicalMap.set(key, artist);
      }
    });
  });

  const tracksByArtist = readyTracks.reduce((acc, track) => {
    const allArtists = extractAllArtists(track);
    allArtists.forEach(artist => {
      const key = artist.toLowerCase();
      const canonicalName = artistCanonicalMap.get(key) || artist;
      if (!acc[canonicalName]) {
        acc[canonicalName] = [];
      }
      if (!acc[canonicalName].some(t => t.id === track.id)) {
        acc[canonicalName].push(track);
      }
    });
    return acc;
  }, {} as Record<string, Track[]>);

  const sortedArtists = Object.keys(tracksByArtist).sort((a, b) => a.localeCompare(b));

  const toggleArtist = (artist: string) => {
    setExpandedArtists(prev => {
      const next = new Set(prev);
      if (next.has(artist)) {
        next.delete(artist);
      } else {
        next.add(artist);
      }
      return next;
    });
  };

  const TrackRow = ({ track }: { track: Track }) => {
    const isCurrent = currentTrack?.videoId === track.videoId;
    const isCurrentPlaying = isCurrent && isPlaying;
    const thumbnail = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
    const isOwner = libraryView === 'mine';

    return (
      <div 
        onClick={() => {
          if (isCurrent) togglePlay();
          else playTrack(track);
        }}
        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
          isCurrent 
            ? theme === 'dark' ? 'bg-rose-500/20 ring-1 ring-rose-500' : 'bg-rose-50 ring-1 ring-rose-200'
            : theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-50'
        }`}
        data-testid={`track-row-${track.videoId}`}
      >
        <div className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 ${
          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          <img 
            src={thumbnail}
            alt={track.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${track.videoId}/default.jpg`;
            }}
          />
          {isCurrent && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              {isCurrentPlaying ? (
                <Pause className="w-4 h-4 text-white fill-current" />
              ) : (
                <Play className="w-4 h-4 text-white fill-current" />
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-medium truncate ${
            isCurrent ? 'text-rose-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            {cleanTitle(track.title)}
          </h4>
          <p className={`text-xs truncate ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}>
            {normalizeArtist(track.channel)}
          </p>
        </div>

        {isOwner && (
          <div className="flex items-center gap-1">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                openShareDialog(track);
              }}
              className={`p-2 transition-all ${
                theme === 'dark' ? 'text-gray-500 hover:text-rose-400' : 'text-gray-300 hover:text-rose-500'
              }`}
              title="Share to feed"
              data-testid={`button-share-feed-${track.videoId}`}
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleShareTrack(track.id);
              }}
              className={`p-2 transition-all ${
                track.isShared 
                  ? 'text-blue-500' 
                  : theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-300 hover:text-gray-500'
              }`}
              title={track.isShared ? 'Shared to community' : 'Private'}
              data-testid={`button-share-${track.videoId}`}
            >
              {track.isShared ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this track?')) {
                  deleteTrack(track.id);
                }
              }}
              className={`p-2 transition-all ${
                theme === 'dark' ? 'text-gray-500 hover:text-red-400' : 'text-gray-300 hover:text-red-500'
              }`}
              data-testid={`button-delete-${track.videoId}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {!isOwner && (
          <div className="flex items-center gap-1">
            {(() => {
              const isAdding = addingTracks.has(track.id);
              const isAdded = addedTracks.has(track.id) || isTrackInMyLibrary(track.videoId);
              
              return (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToLibrary(track);
                  }}
                  disabled={isAdding || isAdded}
                  className={`p-2 rounded-full transition-all ${
                    isAdded
                      ? theme === 'dark' ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-500'
                      : isAdding
                      ? theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-400'
                      : theme === 'dark' ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                  }`}
                  title={isAdded ? 'In your library' : 'Add to my library'}
                  data-testid={`button-add-to-library-${track.videoId}`}
                >
                  {isAdded ? (
                    <Check className="w-4 h-4" />
                  ) : isAdding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </button>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <Header title="Library" />

      <div className="px-4 pt-3 pb-2">
        <Link
          href="/playlists"
          className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
            theme === 'dark' 
              ? 'bg-gray-800 hover:bg-gray-750 border border-white/5' 
              : 'card-elevated hover:shadow-lg'
          }`}
          data-testid="link-playlists"
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
          }`}>
            <ListMusic className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex-1">
            <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Playlists
            </h3>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Create and manage your playlists
            </p>
          </div>
          <ChevronRight className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
        </Link>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <div className={`flex items-center gap-1 rounded-full p-1 ${
          theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'bg-white shadow-soft border border-gray-100'
        }`}>
          <button
            onClick={() => setLibraryView('mine')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              libraryView === 'mine' 
                ? 'bg-rose-500 text-white' 
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="button-library-mine"
          >
            <User className="w-4 h-4" />
            <span>My Library</span>
          </button>
          <button
            onClick={() => setLibraryView('shared')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              libraryView === 'shared' 
                ? 'bg-rose-500 text-white' 
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="button-library-community"
          >
            <Globe className="w-4 h-4" />
            <span>Community</span>
          </button>
        </div>

        <div className={`flex items-center gap-1 rounded-full p-1 ${
          theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'bg-white shadow-soft border border-gray-100'
        }`}>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-full transition-all ${
              viewMode === 'list' 
                ? theme === 'dark' ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-500'
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'
            }`}
            data-testid="button-view-list"
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('artists')}
            className={`p-2 rounded-full transition-all ${
              viewMode === 'artists' 
                ? theme === 'dark' ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-500'
                : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'
            }`}
            data-testid="button-view-artists"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 pb-4">
        {sortedTracks.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-16 text-center animate-scale-in rounded-2xl ${
            theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
          }`}>
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${
              theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
            }`}>
              <Music className="w-12 h-12 text-rose-400" />
            </div>
            <p className={`font-bold text-2xl ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              {libraryView === 'mine' ? 'Your library is empty' : 'No community tracks yet'}
            </p>
            <p className={`text-sm mt-2 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              Go to Explore to discover and download music
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-2">
            {sortedTracks.map((track) => (
              <div key={track.id} className={`rounded-2xl ${
                theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
              }`}>
                <TrackRow track={track} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedArtists.map((artist) => {
              const artistTracks = tracksByArtist[artist];
              const isExpanded = expandedArtists.has(artist);
              const firstTrack = artistTracks[0];
              const thumbnail = firstTrack?.thumbnail || `https://i.ytimg.com/vi/${firstTrack?.videoId}/default.jpg`;

              return (
                <div key={artist} className={`overflow-hidden animate-slide-up rounded-2xl ${
                  theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
                }`}>
                  <button
                    onClick={() => toggleArtist(artist)}
                    className={`w-full flex items-center gap-3 p-3 transition-colors ${
                      theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                    }`}
                    data-testid={`button-artist-${artist.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <div className={`w-12 h-12 rounded-full overflow-hidden shrink-0 ring-2 ${
                      theme === 'dark' ? 'bg-gray-700 ring-gray-600' : 'bg-gray-100 ring-gray-100'
                    }`}>
                      <img 
                        src={thumbnail}
                        alt={artist}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <h4 className={`font-medium ${
                        theme === 'dark' ? 'text-white' : 'text-gray-900'
                      }`}>{artist}</h4>
                      <p className={`text-xs ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {artistTracks.length} track{artistTracks.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-rose-500" />
                    ) : (
                      <ChevronRight className={`w-5 h-5 ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-400'
                      }`} />
                    )}
                  </button>

                  {isExpanded && (
                    <div className={`border-t ${
                      theme === 'dark' ? 'border-white/10' : 'border-gray-100'
                    }`}>
                      {artistTracks.map((track) => (
                        <TrackRow key={track.id} track={track} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className={`max-w-md ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-white'}`}>
          <DialogHeader>
            <DialogTitle className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
              Share to Feed
            </DialogTitle>
          </DialogHeader>
          
          {shareTrack && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-3 rounded-xl ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
              }`}>
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                  <img 
                    src={shareTrack.thumbnail || `https://i.ytimg.com/vi/${shareTrack.videoId}/hqdefault.jpg`}
                    alt={shareTrack.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-medium truncate ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    {cleanTitle(shareTrack.title)}
                  </h4>
                  <p className={`text-xs truncate ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {normalizeArtist(shareTrack.channel)}
                  </p>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Add a comment (optional)
                </label>
                <textarea
                  value={shareComment}
                  onChange={(e) => setShareComment(e.target.value)}
                  placeholder="Say something about this track..."
                  className={`w-full px-3 py-2 rounded-lg border resize-none h-24 ${
                    theme === 'dark' 
                      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-rose-500' 
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-rose-500'
                  } focus:outline-none focus:ring-1 focus:ring-rose-500`}
                  data-testid="input-share-comment"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShareDialogOpen(false)}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                    theme === 'dark'
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  data-testid="button-cancel-share"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShareSubmit}
                  disabled={shareToFeedMutation.isPending}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-rose-500 text-white hover:bg-rose-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  data-testid="button-submit-share"
                >
                  {shareToFeedMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sharing...
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      Share
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
