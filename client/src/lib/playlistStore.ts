import { create } from 'zustand';

export interface Playlist {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: number;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PlaylistStore {
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  isLoading: boolean;
  
  loadPlaylists: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  updatePlaylist: (id: number, updates: Partial<Pick<Playlist, 'name' | 'description' | 'isPublic'>>) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  setCurrentPlaylist: (playlist: Playlist | null) => void;
  addTrackToPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],
  currentPlaylist: null,
  isLoading: false,

  loadPlaylists: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/playlists', { credentials: 'include' });
      if (response.ok) {
        const playlists = await response.json();
        set({ playlists });
      }
    } catch (error) {
      console.error('Failed to load playlists:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createPlaylist: async (name, description) => {
    try {
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description })
      });
      
      if (response.ok) {
        const playlist = await response.json();
        set(state => ({ playlists: [playlist, ...state.playlists] }));
        return playlist;
      }
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
    return null;
  },

  updatePlaylist: async (id, updates) => {
    try {
      const response = await fetch(`/api/playlists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        const updated = await response.json();
        set(state => ({
          playlists: state.playlists.map(p => p.id === id ? updated : p),
          currentPlaylist: state.currentPlaylist?.id === id ? updated : state.currentPlaylist
        }));
      }
    } catch (error) {
      console.error('Failed to update playlist:', error);
    }
  },

  deletePlaylist: async (id) => {
    try {
      const response = await fetch(`/api/playlists/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        set(state => ({
          playlists: state.playlists.filter(p => p.id !== id),
          currentPlaylist: state.currentPlaylist?.id === id ? null : state.currentPlaylist
        }));
      }
    } catch (error) {
      console.error('Failed to delete playlist:', error);
    }
  },

  setCurrentPlaylist: (playlist) => set({ currentPlaylist: playlist }),

  addTrackToPlaylist: async (playlistId, trackId) => {
    try {
      const response = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trackId })
      });
      
      if (response.ok) {
        set(state => ({
          playlists: state.playlists.map(p => 
            p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p
          )
        }));
      }
    } catch (error) {
      console.error('Failed to add track to playlist:', error);
    }
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    try {
      const response = await fetch(`/api/playlists/${playlistId}/tracks/${trackId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        set(state => ({
          playlists: state.playlists.map(p => 
            p.id === playlistId ? { ...p, trackCount: Math.max(0, p.trackCount - 1) } : p
          )
        }));
      }
    } catch (error) {
      console.error('Failed to remove track from playlist:', error);
    }
  }
}));
