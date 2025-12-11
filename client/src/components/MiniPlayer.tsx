import { useEffect, useState, useCallback, useRef } from 'react';
import { useMusicStore } from '../lib/store';
import { audioManager } from '../lib/audioManager';
import { cleanTitle, normalizeArtist } from '../lib/titleUtils';
import { useThemeStore } from '@/lib/themeStore';
import { Play, Pause, SkipForward, Shuffle, Repeat, Repeat1, Loader2 } from 'lucide-react';

export function MiniPlayer() {
  const { currentTrack, pendingTrack, isPlaying, togglePlay, nextTrack, shuffleEnabled, repeatMode, toggleShuffle, toggleRepeat } = useMusicStore();
  const { theme } = useThemeStore();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const initializedRef = useRef(false);

  const updatePositionState = useCallback(() => {
    if ('mediaSession' in navigator && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: currentTime,
        });
      } catch (e) {
        console.log('Position state update failed:', e);
      }
    }
  }, [duration, currentTime]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    audioManager.init();

    audioManager.onTimeUpdate((time, dur) => {
      setCurrentTime(time);
      setDuration(dur);
    });

    audioManager.onEnded(() => {
      nextTrack();
    });
  }, [nextTrack]);

  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;

    const thumbnail = currentTrack.thumbnail || `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: cleanTitle(currentTrack.title),
      artist: normalizeArtist(currentTrack.channel),
      album: 'ScrapPlayer',
      artwork: [
        { src: thumbnail, sizes: '96x96', type: 'image/jpeg' },
        { src: thumbnail, sizes: '128x128', type: 'image/jpeg' },
        { src: thumbnail, sizes: '192x192', type: 'image/jpeg' },
        { src: thumbnail, sizes: '256x256', type: 'image/jpeg' },
        { src: thumbnail, sizes: '384x384', type: 'image/jpeg' },
        { src: thumbnail, sizes: '512x512', type: 'image/jpeg' },
      ],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      if (!isPlaying) togglePlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (isPlaying) togglePlay();
    });
    navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        audioManager.seekTo(details.seekTime);
        updatePositionState();
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [currentTrack?.videoId, currentTrack?.title, isPlaying, togglePlay, nextTrack, updatePositionState]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  useEffect(() => {
    updatePositionState();
  }, [currentTime, duration, updatePositionState]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentTrack && !pendingTrack) {
    return null;
  }

  if (pendingTrack && !currentTrack) {
    const pendingCoverArt = pendingTrack.thumbnail || `https://i.ytimg.com/vi/${pendingTrack.videoId}/hqdefault.jpg`;
    
    return (
      <div className="fixed bottom-16 left-0 right-0 z-40 animate-slide-up">
        <div className={`mx-3 mb-1 rounded-2xl overflow-hidden shadow-medium ${
          theme === 'dark' 
            ? 'bg-gray-800 border border-white/10' 
            : 'bg-white border border-gray-200'
        }`}>
          <div className={`relative h-1 overflow-hidden ${
            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <div className="absolute top-0 left-0 h-full w-full">
              <div className="h-full bg-rose-500/50 animate-pulse" style={{ width: '100%' }} />
            </div>
          </div>
          
          <div className="flex items-center h-[72px] px-4 gap-4">
            <div className="relative">
              <div className={`relative w-14 h-14 rounded-xl overflow-hidden shadow-soft ${
                theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
              }`}>
                <img 
                  src={pendingCoverArt} 
                  alt={pendingTrack.title}
                  className="w-full h-full object-cover opacity-70"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${pendingTrack.videoId}/default.jpg`;
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h4 className={`text-sm font-semibold truncate leading-tight ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                {cleanTitle(pendingTrack.title)}
              </h4>
              <p className={`text-xs truncate mt-0.5 text-rose-500`}>
                {pendingTrack.status === 'processing' ? 'Processing...' : 'Downloading...'}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <div className="w-12 h-12 flex items-center justify-center bg-gray-400 rounded-full text-white shadow-md">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentTrack) {
    return null;
  }

  const coverArt = currentTrack.thumbnail || `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 animate-slide-up">
      <div className={`mx-3 mb-1 rounded-2xl overflow-hidden shadow-medium ${
        theme === 'dark' 
          ? 'bg-gray-800 border border-white/10' 
          : 'bg-white border border-gray-200'
      }`}>
        <div className={`relative h-1 overflow-hidden ${
          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          <div 
            className="absolute top-0 left-0 h-full progress-bar-clean transition-all duration-200" 
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="flex items-center h-[72px] px-4 gap-4">
          <div className="relative group">
            <div className={`relative w-14 h-14 rounded-xl overflow-hidden shadow-soft ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <img 
                src={coverArt} 
                alt={currentTrack.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${currentTrack.videoId}/default.jpg`;
                }}
              />
            </div>
            {isPlaying && (
              <div className="absolute bottom-1 right-1 flex items-end gap-0.5 h-3">
                <div className="w-0.5 bg-rose-500 rounded-full animate-pulse" style={{ height: '60%' }} />
                <div className="w-0.5 bg-rose-500 rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.2s' }} />
                <div className="w-0.5 bg-rose-500 rounded-full animate-pulse" style={{ height: '40%', animationDelay: '0.4s' }} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className={`text-sm font-semibold truncate leading-tight ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              {cleanTitle(currentTrack.title)}
            </h4>
            <p className={`text-xs truncate mt-0.5 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              {normalizeArtist(currentTrack.channel)}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={toggleShuffle}
              className={`p-2 rounded-full transition-all duration-200 ${
                shuffleEnabled 
                  ? 'text-rose-500' 
                  : theme === 'dark' 
                    ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              data-testid="button-shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            
            <button 
              onClick={toggleRepeat}
              className={`p-2 rounded-full transition-all duration-200 ${
                repeatMode !== 'off' 
                  ? 'text-rose-500' 
                  : theme === 'dark' 
                    ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              data-testid="button-repeat"
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
            
            <button 
              onClick={togglePlay}
              className="w-12 h-12 flex items-center justify-center bg-rose-500 hover:bg-rose-600 rounded-full text-white shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
              data-testid="button-play-pause"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            
            <button 
              onClick={nextTrack}
              className={`p-2.5 rounded-full transition-all duration-200 ${
                theme === 'dark' 
                  ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              data-testid="button-next"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
