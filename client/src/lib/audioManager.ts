import { useMusicStore } from './store';

class AudioManager {
  private audio: HTMLAudioElement;
  private currentVideoId: string | null = null;
  private onTimeUpdateCallback: ((time: number, duration: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private initialized: boolean = false;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    
    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(this.audio.currentTime, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(0, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.onEndedCallback) {
        this.onEndedCallback();
      }
    });
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.unsubscribe = useMusicStore.subscribe((state, prevState) => {
      const { currentTrack, isPlaying } = state;
      const prevTrack = prevState.currentTrack;
      const prevIsPlaying = prevState.isPlaying;

      if (currentTrack && currentTrack.videoId !== this.currentVideoId) {
        this.currentVideoId = currentTrack.videoId;
        // Use streaming URL directly if filePath starts with http, otherwise use API endpoint
        this.audio.src = currentTrack.filePath?.startsWith('http') 
          ? currentTrack.filePath 
          : `/api/audio/${currentTrack.videoId}`;
        if (isPlaying) {
          this.audio.play().catch(e => console.log('Autoplay prevented:', e));
        }
      }

      if (isPlaying !== prevIsPlaying) {
        if (isPlaying && currentTrack) {
          this.audio.play().catch(e => console.log('Autoplay prevented:', e));
        } else {
          this.audio.pause();
        }
      }
    });

    const { currentTrack, isPlaying } = useMusicStore.getState();
    if (currentTrack && currentTrack.videoId !== this.currentVideoId) {
      this.currentVideoId = currentTrack.videoId;
      // Use streaming URL directly if filePath starts with http, otherwise use API endpoint
      this.audio.src = currentTrack.filePath?.startsWith('http') 
        ? currentTrack.filePath 
        : `/api/audio/${currentTrack.videoId}`;
      if (isPlaying) {
        this.audio.play().catch(e => console.log('Autoplay prevented:', e));
      }
    }
  }

  seekTo(time: number) {
    if (this.audio.duration > 0) {
      const clampedTime = Math.max(0, Math.min(time, this.audio.duration));
      this.audio.currentTime = clampedTime;
    }
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  getDuration() {
    return this.audio.duration || 0;
  }

  onTimeUpdate(callback: (time: number, duration: number) => void) {
    this.onTimeUpdateCallback = callback;
  }

  onEnded(callback: () => void) {
    this.onEndedCallback = callback;
  }

  getAudioElement() {
    return this.audio;
  }
}

export const audioManager = new AudioManager();
