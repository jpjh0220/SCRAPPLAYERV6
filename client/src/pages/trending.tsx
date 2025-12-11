import { useState, useEffect } from 'react';
import { useMusicStore } from '@/lib/store';
import { TrendingUp, Play, Download, Check, Loader2, Music } from 'lucide-react';

interface TrendingVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

const API_KEY = "AIzaSyCmf-qsQy5xkgnvU5kCR7yvK-Fp1MFzs_s";

const TRENDING_CATEGORIES = [
  { id: 'music', label: 'Music', query: 'trending music 2024' },
  { id: 'hiphop', label: 'Hip Hop', query: 'trending hip hop songs 2024' },
  { id: 'pop', label: 'Pop', query: 'trending pop songs 2024' },
  { id: 'rnb', label: 'R&B', query: 'trending rnb songs 2024' },
  { id: 'latin', label: 'Latin', query: 'trending latin music 2024' },
  { id: 'edm', label: 'EDM', query: 'trending edm songs 2024' },
];

export default function TrendingPage() {
  const { addToLibrary, library } = useMusicStore();
  const [activeCategory, setActiveCategory] = useState('music');
  const [trendingVideos, setTrendingVideos] = useState<TrendingVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const fetchTrending = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=12&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${API_KEY}`
      );
      const data = await response.json();
      
      if (data.items) {
        const videos: TrendingVideo[] = data.items.map((item: any) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium.url,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));
        setTrendingVideos(videos);
      }
    } catch (error) {
      console.error("Failed to fetch trending:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const category = TRENDING_CATEGORIES.find(c => c.id === activeCategory);
    if (category) {
      fetchTrending(category.query);
    }
  }, [activeCategory]);

  const handleDownload = async (video: TrendingVideo) => {
    setDownloadingIds(prev => new Set(prev).add(video.id));
    await addToLibrary(video.url);
  };

  const isInLibrary = (videoId: string) => {
    return library.some(track => track.videoId === videoId);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-6 border-b border-border pt-14 md:pt-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Trending</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Discover popular music right now
            </p>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 md:px-8 py-3 border-b border-border overflow-x-auto">
        <div className="flex gap-2">
          {TRENDING_CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`
                px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all
                ${activeCategory === category.id 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }
              `}
              data-testid={`category-${category.id}`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : trendingVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Music className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No trending music found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendingVideos.map((video) => {
              const inLibrary = isInLibrary(video.id);
              const isDownloading = downloadingIds.has(video.id);
              
              return (
                <div 
                  key={video.id}
                  className="group bg-card/50 border border-border rounded-xl overflow-hidden hover:bg-card transition-all"
                  data-testid={`trending-card-${video.id}`}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-muted">
                    <img 
                      src={video.thumbnail} 
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-12 h-12 text-white" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-1">
                      {video.title}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate mb-3">
                      {video.channel}
                    </p>

                    {/* Action Button */}
                    {inLibrary ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-400">
                        <Check className="w-4 h-4" />
                        In Library
                      </div>
                    ) : isDownloading ? (
                      <div className="flex items-center gap-1.5 text-xs text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding...
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDownload(video)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
                        data-testid={`button-download-trending-${video.id}`}
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
