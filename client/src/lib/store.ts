import { create } from 'zustand';
import { audioManager } from './audioManager';

// Types
export interface SearchResult {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

export interface Track {
  id: number;
  videoId: string;
  title: string;
  channel: string;
  filePath: string;
  thumbnail?: string | null;
  status: 'downloading' | 'processing' | 'ready' | 'error';
  progress: number;
  addedAt: string;
  userId?: string | null;
  isShared: number;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
  status: 'pending' | 'downloading' | 'processing' | 'ready' | 'error';
  progress: number;
  errorMessage?: string;
}

type LibraryView = 'mine' | 'shared';

interface MusicStore {
  // Search State
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  setSearchQuery: (query: string) => void;
  performSearch: (apiKey: string) => Promise<void>;

  // Download Queue State
  downloadQueue: QueueItem[];
  addToQueue: (item: Omit<QueueItem, 'status' | 'progress'>) => void;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void;
  removeFromQueue: (id: string) => void;
  clearCompletedFromQueue: () => void;

  // Download/Library State
  library: Track[];
  sharedLibrary: Track[];
  libraryView: LibraryView;
  setLibraryView: (view: LibraryView) => void;
  loadLibrary: () => Promise<void>;
  loadSharedLibrary: () => Promise<void>;
  addToLibrary: (url: string, metadata?: { title: string; channel: string; thumbnail: string }) => Promise<void>;
  deleteTrack: (id: number) => Promise<void>;
  toggleShareTrack: (id: number) => Promise<void>;
  addSharedTrackToLibrary: (trackId: number) => Promise<Track | null>;
  
  // Player State
  currentTrack: Track | null;
  pendingTrack: { videoId: string; title: string; channel: string; thumbnail: string; status: 'downloading' | 'processing' } | null;
  isPlaying: boolean;
  playTrack: (track: Track) => void;
  setPendingTrack: (track: { videoId: string; title: string; channel: string; thumbnail: string } | null) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  
  // Shuffle & Repeat
  shuffleEnabled: boolean;
  repeatMode: 'off' | 'all' | 'one';
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  
  // Queue Management
  playQueue: Track[];
  queueIndex: number;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueueNext: (track: Track) => void;
  addToQueueEnd: (track: Track) => void;
  removeFromPlayQueue: (index: number) => void;
  clearQueue: () => void;
  playFromQueue: (index: number) => void;
  
  // Streaming
  streamTrack: (videoId: string, title: string, channel: string, thumbnail: string) => Promise<void>;
  streamingTrack: { videoId: string; title: string; channel: string; thumbnail: string } | null;
}

export const useMusicStore = create<MusicStore>((set, get) => ({
  // Search
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  performSearch: async (apiKey) => {
    const { searchQuery, addToLibrary } = get();
    if (!searchQuery.trim()) return;

    set({ isSearching: true });
    
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(searchQuery)}&type=video&key=${apiKey}`
      );
      const data = await response.json();
      
      if (data.items) {
        const results: SearchResult[] = data.items.map((item: any) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.medium.url,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));
        set({ searchResults: results });
        
        // Automatically download all search results
        for (const result of results) {
          addToLibrary(result.url, {
            title: result.title,
            channel: result.channel,
            thumbnail: result.thumbnail
          });
        }
      }
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      set({ isSearching: false });
    }
  },

  // Download Queue
  downloadQueue: [],
  
  addToQueue: (item) => {
    set((state) => {
      if (state.downloadQueue.some(q => q.videoId === item.videoId)) {
        return state;
      }
      return {
        downloadQueue: [...state.downloadQueue, { ...item, status: 'pending', progress: 0 }]
      };
    });
  },
  
  updateQueueItem: (id, updates) => {
    set((state) => ({
      downloadQueue: state.downloadQueue.map(item =>
        item.id === id ? { ...item, ...updates } : item
      )
    }));
  },
  
  removeFromQueue: (id) => {
    set((state) => ({
      downloadQueue: state.downloadQueue.filter(item => item.id !== id)
    }));
  },
  
  clearCompletedFromQueue: () => {
    set((state) => ({
      downloadQueue: state.downloadQueue.filter(item => 
        item.status !== 'ready' && item.status !== 'error'
      )
    }));
  },

  // Library - Real API calls
  library: [],
  sharedLibrary: [],
  libraryView: 'mine',
  setLibraryView: (view) => set({ libraryView: view }),
  
  loadLibrary: async () => {
    try {
      const response = await fetch('/api/tracks/mine', {
        credentials: 'include'
      });
      if (response.status === 401) {
        set({ library: [], libraryView: 'shared' });
        return;
      }
      if (!response.ok) {
        console.error("Failed to load library: HTTP", response.status);
        return;
      }
      const tracks = await response.json();
      if (Array.isArray(tracks)) {
        const currentLibrary = get().library;
        const hasChanged = JSON.stringify(tracks) !== JSON.stringify(currentLibrary);
        if (hasChanged) {
          set({ library: tracks });
        }
      }
    } catch (error) {
      console.error("Failed to load library:", error);
    }
  },

  loadSharedLibrary: async () => {
    try {
      const response = await fetch('/api/tracks/shared');
      if (!response.ok) {
        console.error("Failed to load shared library: HTTP", response.status);
        return;
      }
      const tracks = await response.json();
      if (Array.isArray(tracks)) {
        const currentSharedLibrary = get().sharedLibrary;
        const hasChanged = JSON.stringify(tracks) !== JSON.stringify(currentSharedLibrary);
        if (hasChanged) {
          set({ sharedLibrary: tracks });
        }
      }
    } catch (error) {
      console.error("Failed to load shared library:", error);
    }
  },
  
  addToLibrary: async (url, metadata) => {
    const { updateQueueItem, addToQueue, removeFromQueue, setPendingTrack, playTrack } = get();
    
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : `url-${Date.now()}`;
    const queueId = videoId;
    
    if (metadata) {
      addToQueue({
        id: queueId,
        videoId,
        title: metadata.title,
        channel: metadata.channel,
        thumbnail: metadata.thumbnail,
        url
      });
      
      setPendingTrack({
        videoId,
        title: metadata.title,
        channel: metadata.channel,
        thumbnail: metadata.thumbnail
      });
    }
    
    try {
      updateQueueItem(queueId, { status: 'downloading', progress: 10 });
      
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url })
      });
      
      if (response.status === 409) {
        const data = await response.json();
        console.log("Track already exists:", data.track);
        updateQueueItem(queueId, { status: 'ready', progress: 100 });
        setTimeout(() => removeFromQueue(queueId), 3000);
        if (data.track && data.track.status === 'ready') {
          playTrack(data.track);
        }
        return;
      }
      
      if (!response.ok) {
        const error = await response.json();
        console.error("Download failed:", error);
        updateQueueItem(queueId, { 
          status: 'error', 
          errorMessage: error.message || 'Download failed' 
        });
        setPendingTrack(null);
        return;
      }
      
      updateQueueItem(queueId, { status: 'processing', progress: 50 });
      set((state) => state.pendingTrack?.videoId === videoId ? { pendingTrack: { ...state.pendingTrack, status: 'processing' } } : {});
      
      await get().loadLibrary();
      
      const pollInterval = setInterval(async () => {
        await get().loadLibrary();
        
        const track = get().library.find(t => t.videoId === videoId);
        if (track) {
          if (track.status === 'ready') {
            updateQueueItem(queueId, { status: 'ready', progress: 100 });
            setTimeout(() => removeFromQueue(queueId), 3000);
            clearInterval(pollInterval);
            playTrack(track);
          } else if (track.status === 'error') {
            updateQueueItem(queueId, { status: 'error', errorMessage: 'Processing failed' });
            setPendingTrack(null);
            clearInterval(pollInterval);
          } else if (track.status === 'processing') {
            updateQueueItem(queueId, { status: 'processing', progress: 70 });
            set((state) => state.pendingTrack?.videoId === videoId ? { pendingTrack: { ...state.pendingTrack, status: 'processing' } } : {});
          } else if (track.status === 'downloading') {
            updateQueueItem(queueId, { progress: Math.min(40, track.progress || 30) });
          }
        }
        
        const hasDownloading = get().library.some(t => 
          t.status === 'downloading' || t.status === 'processing'
        );
        if (!hasDownloading) {
          clearInterval(pollInterval);
        }
      }, 2000);
      
    } catch (error) {
      console.error("Failed to add to library:", error);
      updateQueueItem(queueId, { 
        status: 'error', 
        errorMessage: 'Network error' 
      });
      setPendingTrack(null);
    }
  },

  deleteTrack: async (id) => {
    try {
      const response = await fetch(`/api/tracks/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error("Delete failed:", error);
        return;
      }
      
      // If the deleted track is currently playing, stop it
      const { currentTrack } = get();
      if (currentTrack?.id === id) {
        set({ currentTrack: null, isPlaying: false });
      }
      
      // Reload library
      await get().loadLibrary();
      await get().loadSharedLibrary();
    } catch (error) {
      console.error("Failed to delete track:", error);
    }
  },

  toggleShareTrack: async (id) => {
    try {
      const response = await fetch(`/api/tracks/${id}/share`, {
        method: 'PUT',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error("Share toggle failed:", error);
        return;
      }
      
      // Reload both libraries
      await get().loadLibrary();
      await get().loadSharedLibrary();
    } catch (error) {
      console.error("Failed to toggle share:", error);
    }
  },

  addSharedTrackToLibrary: async (trackId) => {
    try {
      const response = await fetch(`/api/tracks/${trackId}/add-to-library`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.status === 409) {
        const data = await response.json();
        console.log("Track already in library:", data.track);
        return data.track;
      }
      
      if (!response.ok) {
        const error = await response.json();
        console.error("Add to library failed:", error);
        return null;
      }
      
      const data = await response.json();
      
      // Reload library to show the new track
      await get().loadLibrary();
      
      return data.track;
    } catch (error) {
      console.error("Failed to add track to library:", error);
      return null;
    }
  },

  // Player
  currentTrack: null,
  pendingTrack: null,
  isPlaying: false,
  playTrack: (track) => {
    const { playQueue } = get();
    const queueIndex = playQueue.findIndex(t => t.id === track.id);
    set({ 
      currentTrack: track, 
      pendingTrack: null,
      isPlaying: true,
      queueIndex: queueIndex >= 0 ? queueIndex : -1
    });
  },
  setPendingTrack: (track) => {
    if (track) {
      set({ pendingTrack: { ...track, status: 'downloading' } });
    } else {
      set({ pendingTrack: null });
    }
  },
  togglePlay: () => set(state => ({ isPlaying: !state.isPlaying })),
  nextTrack: () => {
    const { playQueue, queueIndex, shuffleEnabled, repeatMode, currentTrack } = get();
    
    if (repeatMode === 'one' && currentTrack) {
      audioManager.seekTo(0);
      set({ isPlaying: true });
      return;
    }
    
    if (playQueue.length === 0) {
      const { library } = get();
      if (!currentTrack) return;
      const currentIdx = library.findIndex(t => t.id === currentTrack.id);
      const nextTrack = library[currentIdx + 1];
      if (nextTrack && nextTrack.status === 'ready') {
        set({ currentTrack: nextTrack, isPlaying: true });
      } else if (repeatMode === 'all' && library.length > 0) {
        const firstReady = library.find(t => t.status === 'ready');
        if (firstReady) {
          set({ currentTrack: firstReady, isPlaying: true });
        }
      }
      return;
    }
    
    let nextIndex = queueIndex + 1;
    
    if (shuffleEnabled) {
      const availableIndices = playQueue
        .map((_, i) => i)
        .filter(i => i !== queueIndex);
      if (availableIndices.length > 0) {
        nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      }
    }
    
    if (nextIndex >= playQueue.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        set({ isPlaying: false });
        return;
      }
    }
    
    const nextTrack = playQueue[nextIndex];
    if (nextTrack) {
      set({ currentTrack: nextTrack, queueIndex: nextIndex, isPlaying: true });
    }
  },
  prevTrack: () => {
    const { playQueue, queueIndex, currentTrack } = get();
    if (playQueue.length === 0) {
      const { library } = get();
      if (!currentTrack) return;
      const currentIdx = library.findIndex(t => t.id === currentTrack.id);
      const prevTrack = library[currentIdx - 1];
      if (prevTrack && prevTrack.status === 'ready') {
        set({ currentTrack: prevTrack, isPlaying: true });
      }
      return;
    }
    
    const prevIndex = queueIndex > 0 ? queueIndex - 1 : playQueue.length - 1;
    const prevTrack = playQueue[prevIndex];
    if (prevTrack) {
      set({ currentTrack: prevTrack, queueIndex: prevIndex, isPlaying: true });
    }
  },
  
  // Shuffle & Repeat
  shuffleEnabled: false,
  repeatMode: 'off',
  toggleShuffle: () => set(state => ({ shuffleEnabled: !state.shuffleEnabled })),
  toggleRepeat: () => set(state => ({
    repeatMode: state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off'
  })),
  
  // Queue Management
  playQueue: [],
  queueIndex: -1,
  setQueue: (tracks, startIndex = 0) => {
    const track = tracks[startIndex];
    set({ 
      playQueue: tracks, 
      queueIndex: startIndex,
      currentTrack: track || null,
      isPlaying: !!track
    });
  },
  addToQueueNext: (track) => {
    set(state => {
      const newQueue = [...state.playQueue];
      newQueue.splice(state.queueIndex + 1, 0, track);
      return { playQueue: newQueue };
    });
  },
  addToQueueEnd: (track) => {
    set(state => ({ playQueue: [...state.playQueue, track] }));
  },
  removeFromPlayQueue: (index) => {
    set(state => {
      const newQueue = state.playQueue.filter((_, i) => i !== index);
      let newIndex = state.queueIndex;
      if (index < state.queueIndex) newIndex--;
      else if (index === state.queueIndex && newIndex >= newQueue.length) newIndex = newQueue.length - 1;
      return { 
        playQueue: newQueue, 
        queueIndex: newIndex,
        currentTrack: newQueue[newIndex] || null
      };
    });
  },
  clearQueue: () => set({ playQueue: [], queueIndex: -1 }),
  playFromQueue: (index) => {
    const { playQueue } = get();
    if (index >= 0 && index < playQueue.length) {
      set({ currentTrack: playQueue[index], queueIndex: index, isPlaying: true });
    }
  },
  
  // Streaming
  streamingTrack: null,
  streamTrack: async (videoId, title, channel, thumbnail) => {
    set({ streamingTrack: { videoId, title, channel, thumbnail } });
    
    try {
      const response = await fetch(`/api/stream/${videoId}`);
      if (!response.ok) {
        throw new Error('Failed to get stream URL');
      }
      
      const { streamUrl } = await response.json();
      
      // Create a temporary track object for the player
      const streamTrack: Track = {
        id: -1, // Temporary ID for streaming
        videoId,
        title,
        channel,
        thumbnail,
        filePath: streamUrl, // Use stream URL as file path
        status: 'ready',
        progress: 100,
        addedAt: new Date().toISOString(),
        userId: null,
        isShared: 0
      };
      
      set({ 
        currentTrack: streamTrack, 
        isPlaying: true,
        streamingTrack: null
      });
    } catch (error) {
      console.error('Stream failed:', error);
      set({ streamingTrack: null });
    }
  }
}));
