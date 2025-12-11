import { useEffect, useRef, useState, useCallback } from 'react';
import { useMusicStore } from '../lib/store';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music, SlidersHorizontal } from 'lucide-react';
import { Equalizer } from './Equalizer';
import { equalizerManager } from '../lib/equalizerManager';

export function Player() {
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, library } = useMusicStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current && duration > 0) {
      const clampedTime = Math.max(0, Math.min(time, duration));
      audioRef.current.currentTime = clampedTime;
      setCurrentTime(clampedTime);
    }
  }, [duration]);

  const updatePositionState = useCallback(() => {
    if ('mediaSession' in navigator && audioRef.current && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: audioRef.current.playbackRate,
          position: audioRef.current.currentTime,
        });
      } catch (e) {
        console.log('Position state update failed:', e);
      }
    }
  }, [duration]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.log("Autoplay prevented", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;

    const thumbnail = currentTrack.thumbnail || `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.channel,
      album: 'TubePocketDJ',
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

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      prevTrack();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      nextTrack();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        seekTo(details.seekTime);
        updatePositionState();
      }
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10;
      seekTo(currentTime - skipTime);
      updatePositionState();
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10;
      seekTo(currentTime + skipTime);
      updatePositionState();
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
    };
  }, [currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, seekTo, currentTime, updatePositionState]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current && currentTrack) {
      equalizerManager.connectAudio(audioRef.current);
    }
  }, [currentTrack]);

  const handleTimeUpdate = () => {
    if (audioRef.current && !isDragging) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
      updatePositionState();
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
      setCurrentTime(0);
      updatePositionState();
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleSeekStart = () => {
    setIsDragging(true);
  };

  const handleSeekEnd = () => {
    setIsDragging(false);
    updatePositionState();
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentTrack) {
    return (
      <div className="h-24 border-t border-border bg-card/50 backdrop-blur-sm flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium">No track selected</p>
            <p className="text-xs text-muted-foreground/70">Choose a song from your library</p>
          </div>
        </div>
      </div>
    );
  }

  // Use streaming URL directly if filePath starts with http, otherwise use API endpoint
  const audioUrl = currentTrack.filePath?.startsWith('http') 
    ? currentTrack.filePath 
    : `/api/audio/${currentTrack.videoId}`;
  const coverArt = currentTrack.thumbnail || `https://i.ytimg.com/vi/${currentTrack.videoId}/hqdefault.jpg`;

  return (
    <div className="h-24 border-t border-border bg-card/80 backdrop-blur-sm flex flex-col">
      {/* Progress Bar - Touch-friendly range slider */}
      <div className="relative h-2 bg-muted group">
        <div 
          className="absolute inset-0 bg-primary pointer-events-none" 
          style={{ width: `${progress}%` }}
        />
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime}
          onChange={handleSeekChange}
          onMouseDown={handleSeekStart}
          onMouseUp={handleSeekEnd}
          onTouchStart={handleSeekStart}
          onTouchEnd={handleSeekEnd}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none"
          style={{ touchAction: 'none' }}
          data-testid="progress-bar"
        />
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>

      <div className="flex-1 flex items-center px-4 md:px-6 gap-4 md:gap-6">
        {/* Track Info */}
        <div className="flex items-center gap-2 md:gap-4 w-1/3 min-w-0">
          <button
            onClick={() => setShowEqualizer(true)}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0"
            title="Equalizer"
            data-testid="button-equalizer-mobile"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-md overflow-hidden shrink-0 border border-border/50">
            <img 
              src={coverArt} 
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${currentTrack.videoId}/default.jpg`;
              }}
            />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground truncate" title={currentTrack.title}>
              {currentTrack.title}
            </h4>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {currentTrack.channel}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-1 md:gap-2 flex-1">
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={prevTrack} 
              className="text-muted-foreground hover:text-foreground transition-colors p-2"
              data-testid="button-prev"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            
            <button 
              onClick={togglePlay}
              className="w-10 h-10 md:w-12 md:h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
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
              className="text-muted-foreground hover:text-foreground transition-colors p-2"
              data-testid="button-next"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
          
          {/* Time */}
          <div className="flex items-center gap-2 text-[10px] md:text-[11px] text-muted-foreground font-mono">
            <span className="w-8 md:w-10 text-right">{formatTime(currentTime)}</span>
            <span>/</span>
            <span className="w-8 md:w-10">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume and Equalizer - Hidden on mobile */}
        <div 
          className="hidden md:flex items-center justify-end gap-3 w-1/3"
          onMouseEnter={() => setShowVolume(true)}
          onMouseLeave={() => setShowVolume(false)}
        >
          <button
            onClick={() => setShowEqualizer(true)}
            className="text-muted-foreground hover:text-foreground transition-colors p-2"
            title="Equalizer"
            data-testid="button-equalizer"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          <div className={`flex items-center gap-2 transition-all ${showVolume ? 'opacity-100 w-24' : 'opacity-0 w-0'} overflow-hidden`}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                setIsMuted(false);
              }}
              className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              data-testid="volume-slider"
            />
          </div>
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="text-muted-foreground hover:text-foreground transition-colors p-2"
            data-testid="button-mute"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      <audio 
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={nextTrack}
        preload="metadata"
      />

      <Equalizer
        isOpen={showEqualizer}
        onClose={() => setShowEqualizer(false)}
        audioElement={audioRef.current}
      />
    </div>
  );
}
