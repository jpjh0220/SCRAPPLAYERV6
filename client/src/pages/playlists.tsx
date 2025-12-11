import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useMusicStore, Track } from '@/lib/store';
import { useThemeStore } from '@/lib/themeStore';
import { Header } from '@/components/Header';
import { cleanTitle, normalizeArtist } from '@/lib/titleUtils';
import { 
  Plus, 
  Play, 
  Pause, 
  Trash2, 
  Music, 
  ChevronLeft, 
  MoreVertical,
  ListMusic,
  Globe,
  Lock,
  Edit2,
  X
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Playlist {
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

interface PlaylistTrackItem {
  id: number;
  playlistId: number;
  trackId: number;
  position: number;
  addedAt: string;
  track: Track;
}

export default function PlaylistsPage() {
  const [, setLocation] = useLocation();
  const { theme } = useThemeStore();
  const { playTrack, currentTrack, isPlaying, togglePlay, library, loadLibrary } = useMusicStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddTrackDialog, setShowAddTrackDialog] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const { data: playlists = [], isLoading } = useQuery<Playlist[]>({
    queryKey: ['/api/playlists'],
  });

  const { data: playlistTracks = [] } = useQuery<PlaylistTrackItem[]>({
    queryKey: ['/api/playlists', selectedPlaylist?.id, 'tracks'],
    queryFn: () => selectedPlaylist ? apiRequest('GET', `/api/playlists/${selectedPlaylist.id}/tracks`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedPlaylist,
  });

  const createPlaylistMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await apiRequest('POST', '/api/playlists', data);
      if (!response.ok) {
        throw new Error('Failed to create playlist');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      setShowCreateDialog(false);
      setNewPlaylistName('');
      setNewPlaylistDescription('');
      toast({ title: "Playlist created!" });
    },
    onError: () => {
      toast({ title: "Failed to create playlist", variant: "destructive" });
    },
  });

  const updatePlaylistMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string; description?: string; isPublic?: number } }) => {
      const response = await apiRequest('PUT', `/api/playlists/${id}`, data);
      if (!response.ok) {
        throw new Error('Failed to update playlist');
      }
      return response.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      if (selectedPlaylist?.id === updated.id) {
        setSelectedPlaylist(updated);
      }
      setEditingPlaylist(null);
      toast({ title: "Playlist updated!" });
    },
    onError: () => {
      toast({ title: "Failed to update playlist", variant: "destructive" });
    },
  });

  const deletePlaylistMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/playlists/${id}`);
      if (!response.ok) {
        throw new Error('Failed to delete playlist');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      setSelectedPlaylist(null);
      toast({ title: "Playlist deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete playlist", variant: "destructive" });
    },
  });

  const addTrackMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: number; trackId: number }) => {
      const response = await apiRequest('POST', `/api/playlists/${playlistId}/tracks`, { trackId });
      if (!response.ok) {
        throw new Error('Failed to add track');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists', selectedPlaylist?.id, 'tracks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      setShowAddTrackDialog(false);
      toast({ title: "Track added to playlist" });
    },
    onError: () => {
      toast({ title: "Failed to add track", variant: "destructive" });
    },
  });

  const removeTrackMutation = useMutation({
    mutationFn: async ({ playlistId, trackId }: { playlistId: number; trackId: number }) => {
      const response = await apiRequest('DELETE', `/api/playlists/${playlistId}/tracks/${trackId}`);
      if (!response.ok) {
        throw new Error('Failed to remove track');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists', selectedPlaylist?.id, 'tracks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      toast({ title: "Track removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove track", variant: "destructive" });
    },
  });

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    createPlaylistMutation.mutate({
      name: newPlaylistName.trim(),
      description: newPlaylistDescription.trim() || undefined,
    });
  };

  const TrackRow = ({ track, showRemove = false }: { track: Track; showRemove?: boolean }) => {
    const isCurrent = currentTrack?.videoId === track.videoId;
    const isCurrentPlaying = isCurrent && isPlaying;
    const thumbnail = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;

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
        data-testid={`playlist-track-${track.videoId}`}
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

        {showRemove && selectedPlaylist && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              removeTrackMutation.mutate({ playlistId: selectedPlaylist.id, trackId: track.id });
            }}
            className={`p-2 transition-all ${
              theme === 'dark' ? 'text-gray-500 hover:text-red-400' : 'text-gray-300 hover:text-red-500'
            }`}
            data-testid={`button-remove-track-${track.videoId}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  const PlaylistCard = ({ playlist }: { playlist: Playlist }) => {
    const firstTrackThumbnail = `https://i.ytimg.com/vi/default/default.jpg`;
    
    return (
      <button
        onClick={() => setSelectedPlaylist(playlist)}
        className={`w-full text-left p-4 rounded-2xl transition-all ${
          theme === 'dark' ? 'bg-gray-800 hover:bg-gray-750' : 'card-elevated hover:shadow-lg'
        }`}
        data-testid={`playlist-card-${playlist.id}`}
      >
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center ${
            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            {playlist.coverUrl ? (
              <img src={playlist.coverUrl} alt={playlist.name} className="w-full h-full object-cover" />
            ) : (
              <ListMusic className={`w-8 h-8 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {playlist.name}
              </h3>
              {playlist.isPublic === 1 ? (
                <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              ) : (
                <Lock className={`w-3.5 h-3.5 shrink-0 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
              )}
            </div>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {playlist.trackCount} track{playlist.trackCount !== 1 ? 's' : ''}
            </p>
            {playlist.description && (
              <p className={`text-xs truncate mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                {playlist.description}
              </p>
            )}
          </div>
        </div>
      </button>
    );
  };

  if (selectedPlaylist) {
    return (
      <div className={`flex-1 flex flex-col min-h-screen pb-32 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`sticky top-0 z-10 px-4 py-3 ${
          theme === 'dark' ? 'bg-gray-900/95 backdrop-blur-lg' : 'bg-white/95 backdrop-blur-lg shadow-sm'
        }`}>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedPlaylist(null)}
              className={`p-2 rounded-full transition-all ${
                theme === 'dark' ? 'hover:bg-white/10 text-white' : 'hover:bg-gray-100 text-gray-700'
              }`}
              data-testid="button-back-playlists"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className={`font-bold text-lg truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {selectedPlaylist.name}
              </h1>
              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                {selectedPlaylist.trackCount} track{selectedPlaylist.trackCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button 
              onClick={() => setEditingPlaylist(selectedPlaylist)}
              className={`p-2 rounded-full transition-all ${
                theme === 'dark' ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
              data-testid="button-edit-playlist"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                if (confirm('Delete this playlist?')) {
                  deletePlaylistMutation.mutate(selectedPlaylist.id);
                }
              }}
              className={`p-2 rounded-full transition-all ${
                theme === 'dark' ? 'hover:bg-white/10 text-gray-400 hover:text-red-400' : 'hover:bg-gray-100 text-gray-500 hover:text-red-500'
              }`}
              data-testid="button-delete-playlist"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-4">
          <button
            onClick={() => setShowAddTrackDialog(true)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
              theme === 'dark' 
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' 
                : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
            }`}
            data-testid="button-add-track"
          >
            <Plus className="w-5 h-5" />
            <span>Add Track</span>
          </button>

          {playlistTracks.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-16 text-center rounded-2xl ${
              theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
            }`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
              }`}>
                <Music className="w-10 h-10 text-rose-400" />
              </div>
              <p className={`font-bold text-xl ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                No tracks yet
              </p>
              <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                Add tracks from your library
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {playlistTracks.filter(item => item.track).map((item) => (
                <div key={item.id} className={`rounded-2xl ${theme === 'dark' ? 'bg-gray-800' : 'card-elevated'}`}>
                  <TrackRow track={item.track} showRemove />
                </div>
              ))}
            </div>
          )}
        </div>

        {showAddTrackDialog && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddTrackDialog(false)} />
            <div className={`relative w-full max-w-lg max-h-[70vh] overflow-hidden rounded-t-3xl ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            }`}>
              <div className={`sticky top-0 px-4 py-4 border-b ${
                theme === 'dark' ? 'border-white/10 bg-gray-800' : 'border-gray-100 bg-white'
              }`}>
                <div className="flex items-center justify-between">
                  <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Add Track
                  </h2>
                  <button 
                    onClick={() => setShowAddTrackDialog(false)}
                    className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(70vh-80px)]">
                {library.filter(t => t.status === 'ready').length === 0 ? (
                  <p className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    No tracks in your library
                  </p>
                ) : (
                  <div className="space-y-2">
                    {library.filter(t => t.status === 'ready').map((track) => {
                      const isInPlaylist = playlistTracks.some(pt => pt.trackId === track.id);
                      return (
                        <button
                          key={track.id}
                          disabled={isInPlaylist}
                          onClick={() => {
                            if (!isInPlaylist && selectedPlaylist) {
                              addTrackMutation.mutate({ playlistId: selectedPlaylist.id, trackId: track.id });
                            }
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                            isInPlaylist
                              ? theme === 'dark' ? 'opacity-50 cursor-not-allowed' : 'opacity-50 cursor-not-allowed'
                              : theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                          }`}
                          data-testid={`button-add-track-${track.videoId}`}
                        >
                          <div className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 ${
                            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                          }`}>
                            <img 
                              src={track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`}
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <h4 className={`text-sm font-medium truncate ${
                              theme === 'dark' ? 'text-white' : 'text-gray-900'
                            }`}>
                              {cleanTitle(track.title)}
                            </h4>
                            <p className={`text-xs truncate ${
                              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {normalizeArtist(track.channel)}
                            </p>
                          </div>
                          {isInPlaylist ? (
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              theme === 'dark' ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                            }`}>
                              Added
                            </span>
                          ) : (
                            <Plus className={`w-5 h-5 ${theme === 'dark' ? 'text-rose-400' : 'text-rose-500'}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {editingPlaylist && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setEditingPlaylist(null)} />
            <div className={`relative w-full max-w-md rounded-2xl p-6 ${
              theme === 'dark' ? 'bg-gray-800' : 'bg-white'
            }`}>
              <h2 className={`text-xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Edit Playlist
              </h2>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={editingPlaylist.name}
                    onChange={(e) => setEditingPlaylist({ ...editingPlaylist, name: e.target.value })}
                    className={`w-full px-4 py-2 rounded-xl border transition-all ${
                      theme === 'dark' 
                        ? 'bg-gray-700 border-gray-600 text-white focus:border-rose-500' 
                        : 'bg-white border-gray-200 text-gray-900 focus:border-rose-500'
                    } focus:outline-none focus:ring-2 focus:ring-rose-500/20`}
                    data-testid="input-edit-playlist-name"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Description
                  </label>
                  <textarea
                    value={editingPlaylist.description || ''}
                    onChange={(e) => setEditingPlaylist({ ...editingPlaylist, description: e.target.value })}
                    rows={3}
                    className={`w-full px-4 py-2 rounded-xl border transition-all resize-none ${
                      theme === 'dark' 
                        ? 'bg-gray-700 border-gray-600 text-white focus:border-rose-500' 
                        : 'bg-white border-gray-200 text-gray-900 focus:border-rose-500'
                    } focus:outline-none focus:ring-2 focus:ring-rose-500/20`}
                    data-testid="input-edit-playlist-description"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    Public playlist
                  </span>
                  <button
                    onClick={() => setEditingPlaylist({ 
                      ...editingPlaylist, 
                      isPublic: editingPlaylist.isPublic === 1 ? 0 : 1 
                    })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      editingPlaylist.isPublic === 1 ? 'bg-rose-500' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                    }`}
                    data-testid="button-toggle-public"
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      editingPlaylist.isPublic === 1 ? 'translate-x-7' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingPlaylist(null)}
                  className={`flex-1 px-4 py-2 rounded-xl font-medium transition-all ${
                    theme === 'dark' 
                      ? 'bg-gray-700 text-white hover:bg-gray-600' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updatePlaylistMutation.mutate({
                      id: editingPlaylist.id,
                      data: {
                        name: editingPlaylist.name,
                        description: editingPlaylist.description || undefined,
                        isPublic: editingPlaylist.isPublic,
                      },
                    });
                  }}
                  className="flex-1 px-4 py-2 rounded-xl font-medium bg-rose-500 text-white hover:bg-rose-600 transition-all"
                  data-testid="button-save-edit"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-screen pb-32 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <Header title="Playlists" />

      <div className="flex-1 px-4 py-4 space-y-4">
        <button
          onClick={() => setShowCreateDialog(true)}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
            theme === 'dark' 
              ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30' 
              : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100'
          }`}
          data-testid="button-create-playlist"
        >
          <Plus className="w-5 h-5" />
          <span>Create Playlist</span>
        </button>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : playlists.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-16 text-center rounded-2xl ${
            theme === 'dark' ? 'bg-gray-800' : 'card-elevated'
          }`}>
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${
              theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
            }`}>
              <ListMusic className="w-12 h-12 text-rose-400" />
            </div>
            <p className={`font-bold text-2xl ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              No playlists yet
            </p>
            <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Create a playlist to organize your music
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateDialog(false)} />
          <div className={`relative w-full max-w-md rounded-2xl p-6 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-white'
          }`}>
            <h2 className={`text-xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Create Playlist
            </h2>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Name
                </label>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="My Playlist"
                  className={`w-full px-4 py-2 rounded-xl border transition-all ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-rose-500' 
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-rose-500'
                  } focus:outline-none focus:ring-2 focus:ring-rose-500/20`}
                  data-testid="input-playlist-name"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description (optional)
                </label>
                <textarea
                  value={newPlaylistDescription}
                  onChange={(e) => setNewPlaylistDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={3}
                  className={`w-full px-4 py-2 rounded-xl border transition-all resize-none ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-rose-500' 
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-rose-500'
                  } focus:outline-none focus:ring-2 focus:ring-rose-500/20`}
                  data-testid="input-playlist-description"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewPlaylistName('');
                  setNewPlaylistDescription('');
                }}
                className={`flex-1 px-4 py-2 rounded-xl font-medium transition-all ${
                  theme === 'dark' 
                    ? 'bg-gray-700 text-white hover:bg-gray-600' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid="button-cancel-create"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className={`flex-1 px-4 py-2 rounded-xl font-medium transition-all ${
                  newPlaylistName.trim()
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                data-testid="button-confirm-create"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
