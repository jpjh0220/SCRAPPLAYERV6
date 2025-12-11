import { Download, Check, ExternalLink, Music, Play, Loader2 } from 'lucide-react';
import { useMusicStore } from '../lib/store';
import { useState } from 'react';

export function ResultList() {
  const { searchResults, addToLibrary, library, streamTrack } = useMusicStore();
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());

  const handleDownload = async (url: string, id: string) => {
    setDownloadingIds(prev => new Set(prev).add(id));
    await addToLibrary(url);
  };

  const handleStream = async (result: { id: string; title: string; channel: string; thumbnail: string }) => {
    setStreamingIds(prev => new Set(prev).add(result.id));
    try {
      await streamTrack(result.id, result.title, result.channel, result.thumbnail);
    } finally {
      setStreamingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(result.id);
        return newSet;
      });
    }
  };

  const isInLibrary = (videoId: string) => {
    return library.some(track => track.videoId === videoId);
  };

  if (searchResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Music className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p className="text-base font-medium text-foreground/80">Ready to discover</p>
        <p className="text-sm text-muted-foreground mt-1">Search for your favorite music above</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-muted-foreground">
          {searchResults.length} results found
        </h4>
      </div>
      
      <div className="grid gap-3">
        {searchResults.map((result) => {
          const inLibrary = isInLibrary(result.id);
          const isDownloading = downloadingIds.has(result.id);
          
          return (
            <div 
              key={result.id}
              data-testid={`result-card-${result.id}`}
              className="group flex gap-4 p-4 bg-background hover:bg-muted/50 border border-border rounded-xl transition-all"
            >
              {/* Thumbnail */}
              <div className="relative w-24 aspect-video rounded-lg overflow-hidden shrink-0 bg-muted">
                <img 
                  src={result.thumbnail} 
                  alt={result.title} 
                  className="w-full h-full object-cover" 
                />
                <a 
                  href={result.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-5 h-5 text-white" />
                </a>
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h3 className="text-sm font-medium text-foreground line-clamp-2" title={result.title}>
                  {result.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {result.channel}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Stream/Play Button */}
                {streamingIds.has(result.id) ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400 bg-green-500/10 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <button
                    onClick={() => handleStream(result)}
                    data-testid={`button-stream-${result.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500 text-white hover:bg-green-600 rounded-full transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Play
                  </button>
                )}
                
                {/* Download/Added Status */}
                {inLibrary ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400 bg-green-500/10 rounded-full">
                    <Check className="w-3.5 h-3.5" />
                    Added
                  </div>
                ) : isDownloading ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-full">
                    <Download className="w-3.5 h-3.5 animate-bounce" />
                    Adding...
                  </div>
                ) : (
                  <button
                    onClick={() => handleDownload(result.url, result.id)}
                    data-testid={`button-download-${result.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-full transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
