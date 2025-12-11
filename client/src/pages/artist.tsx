import { useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import { useMusicStore } from '@/lib/store';
import { useThemeStore } from '@/lib/themeStore';
import { Header } from '@/components/Header';
import { ArrowLeft, Music, Play, Pause, Shuffle, Users, Loader2 } from 'lucide-react';
import type { Track } from '@shared/schema';

interface ArtistTrack {
  id: number;
  videoId: string;
  title: string;
  channel: string;
  filePath: string;
  thumbnail: string | null;
  status: string;
  progress: number;
  addedAt: string;
  userId: string | null;
  isShared: number;
}

interface ArtistData {
  name: string;
  trackCount: number;
  thumbnail: string | null;
  tracks: ArtistTrack[];
}

export default function ArtistPage() {
  const [, params] = useRoute('/artist/:name');
  const artistName = params?.name ? decodeURIComponent(params.name) : '';
  const { theme } = useThemeStore();
  const { playTrack, currentTrack, isPlaying, togglePlay, setQueue } = useMusicStore();
  
  const [artistData, setArtistData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName) return;
    
    const fetchArtist = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/artists/${encodeURIComponent(artistName)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Artist not found');
          } else {
            setError('Failed to load artist');
          }
          return;
        }
        const data = await res.json();
        setArtistData(data);
      } catch (err) {
        console.error('Error fetching artist:', err);
        setError('Failed to load artist');
      } finally {
        setLoading(false);
      }
    };
    
    fetchArtist();
  }, [artistName]);

  const convertToTracks = (artistTracks: ArtistTrack[]): Track[] => {
    return artistTracks.map(t => ({
      id: t.id,
      videoId: t.videoId,
      title: t.title,
      channel: t.channel,
      filePath: t.filePath,
      thumbnail: t.thumbnail,
      status: t.status,
      progress: t.progress,
      addedAt: new Date(t.addedAt),
      userId: t.userId,
      isShared: t.isShared
    }) as Track);
  };

  const handlePlayAll = () => {
    if (artistData && artistData.tracks.length > 0) {
      const tracks = convertToTracks(artistData.tracks);
      setQueue(tracks);
      playTrack(tracks[0]);
    }
  };

  const handleShufflePlay = () => {
    if (artistData && artistData.tracks.length > 0) {
      const tracks = convertToTracks(artistData.tracks);
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      playTrack(shuffled[0]);
    }
  };

  const handlePlayTrack = (artistTrack: ArtistTrack) => {
    const tracks = convertToTracks(artistData?.tracks || []);
    const track = tracks.find(t => t.videoId === artistTrack.videoId);
    if (!track) return;
    
    if (currentTrack?.videoId === track.videoId) {
      togglePlay();
    } else {
      setQueue(tracks);
      playTrack(track);
    }
  };

  if (loading) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <Header title="Artist" showSearch={false} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !artistData) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <Header title="Artist" showSearch={false} />
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <Music className={`w-16 h-16 mb-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-lg font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            {error || 'Artist not found'}
          </p>
          <Link href="/explore">
            <a 
              className="mt-4 text-rose-500 hover:text-rose-600 font-medium flex items-center gap-2"
              data-testid="link-back-to-explore-error"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Explore
            </a>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${
      theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className={`relative ${theme === 'dark' ? 'bg-gradient-to-b from-gray-800 to-gray-900' : 'bg-gradient-to-b from-rose-100 to-gray-50'}`}>
        <div className="absolute top-4 left-4 z-10">
          <Link href="/explore">
            <a 
              className={`p-2 rounded-full transition-colors ${
                theme === 'dark' 
                  ? 'bg-black/30 hover:bg-black/50 text-white' 
                  : 'bg-white/70 hover:bg-white text-gray-700'
              }`}
              data-testid="link-back-to-explore"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
          </Link>
        </div>

        <div className="pt-16 pb-6 px-6 flex flex-col items-center">
          <div className={`w-32 h-32 rounded-full overflow-hidden mb-4 shadow-xl ${
            theme === 'dark' ? 'bg-gray-700 ring-4 ring-gray-600' : 'bg-gray-200 ring-4 ring-white'
          }`}>
            {artistData.thumbnail ? (
              <img 
                src={artistData.thumbnail} 
                alt={artistData.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className={`w-12 h-12 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
              </div>
            )}
          </div>
          
          <h1 className={`text-2xl font-bold text-center mb-1 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`} data-testid="text-artist-name">
            {artistData.name}
          </h1>
          
          <div className="flex items-center gap-2 mb-4">
            <Users className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
            <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {artistData.trackCount} {artistData.trackCount === 1 ? 'track' : 'tracks'}
            </span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full font-medium transition-colors"
              data-testid="button-play-all"
            >
              <Play className="w-4 h-4 fill-current" />
              Play All
            </button>
            <button
              onClick={handleShufflePlay}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-colors ${
                theme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-white hover:bg-gray-100 text-gray-700 shadow-sm'
              }`}
              data-testid="button-shuffle"
            >
              <Shuffle className="w-4 h-4" />
              Shuffle
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4">
        <h2 className={`text-sm font-medium uppercase tracking-wide mb-3 ${
          theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
        }`}>
          All Tracks
        </h2>
        
        <div className="space-y-2">
          {artistData.tracks.map((track, index) => {
            const isCurrent = currentTrack?.videoId === track.videoId;
            const isCurrentPlaying = isCurrent && isPlaying;
            
            return (
              <div
                key={`${track.videoId}-${index}`}
                onClick={() => handlePlayTrack(track)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                  theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-750'
                    : 'bg-white shadow-sm hover:shadow-md'
                } ${isCurrent ? 'ring-2 ring-rose-500' : ''}`}
                data-testid={`track-${track.id}`}
              >
                <div className={`w-8 h-8 flex items-center justify-center text-sm font-medium ${
                  theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  {isCurrentPlaying ? (
                    <div className="flex gap-0.5">
                      <span className="w-0.5 h-3 bg-rose-500 animate-pulse" />
                      <span className="w-0.5 h-4 bg-rose-500 animate-pulse" style={{ animationDelay: '0.1s' }} />
                      <span className="w-0.5 h-2 bg-rose-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                    </div>
                  ) : (
                    index + 1
                  )}
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
                  <p className={`text-xs truncate ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {track.channel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
