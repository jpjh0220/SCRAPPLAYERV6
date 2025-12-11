import { useMusicStore, QueueItem } from '@/lib/store';
import { useThemeStore } from '@/lib/themeStore';
import { X, Check, AlertCircle, Loader2, Download, Trash2 } from 'lucide-react';

export function DownloadQueue() {
  const { downloadQueue, removeFromQueue, clearCompletedFromQueue } = useMusicStore();
  const { theme } = useThemeStore();

  if (downloadQueue.length === 0) return null;

  const activeDownloads = downloadQueue.filter(
    item => item.status === 'pending' || item.status === 'downloading' || item.status === 'processing'
  );
  const completedDownloads = downloadQueue.filter(item => item.status === 'ready');
  const errorDownloads = downloadQueue.filter(item => item.status === 'error');

  const getStatusIcon = (item: QueueItem) => {
    switch (item.status) {
      case 'pending':
        return <Download className="w-4 h-4 text-gray-400" />;
      case 'downloading':
      case 'processing':
        return <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />;
      case 'ready':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = (item: QueueItem) => {
    switch (item.status) {
      case 'pending':
        return 'Waiting...';
      case 'downloading':
        return 'Downloading...';
      case 'processing':
        return 'Processing...';
      case 'ready':
        return 'Complete';
      case 'error':
        return item.errorMessage || 'Failed';
    }
  };

  const getProgressColor = (item: QueueItem) => {
    switch (item.status) {
      case 'ready':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-rose-500';
    }
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${
      theme === 'dark' ? 'bg-gray-800 border border-white/10' : 'card-elevated'
    }`} data-testid="download-queue">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        theme === 'dark' ? 'border-white/10' : 'border-gray-100'
      }`}>
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-rose-500" />
          <h3 className={`text-sm font-semibold ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            Download Queue
          </h3>
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            theme === 'dark' ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-500'
          }`}>
            {activeDownloads.length} active
          </span>
        </div>
        {(completedDownloads.length > 0 || errorDownloads.length > 0) && (
          <button
            onClick={clearCompletedFromQueue}
            className={`text-xs font-medium transition-colors ${
              theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="button-clear-queue"
          >
            Clear finished
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {downloadQueue.map((item) => (
          <div 
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${
              theme === 'dark' ? 'border-white/5' : 'border-gray-50'
            }`}
            data-testid={`queue-item-${item.videoId}`}
          >
            <div className={`relative w-10 h-10 rounded-lg overflow-hidden shrink-0 ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <img 
                src={item.thumbnail}
                alt={item.title}
                className="w-full h-full object-cover"
              />
              <div className={`absolute inset-0 flex items-center justify-center ${
                item.status === 'ready' ? 'bg-green-500/20' : 
                item.status === 'error' ? 'bg-red-500/20' : 
                'bg-black/30'
              }`}>
                {getStatusIcon(item)}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h4 className={`text-sm font-medium truncate ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                {item.title}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs ${
                  item.status === 'error' ? 'text-red-500' :
                  item.status === 'ready' ? 'text-green-500' :
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {getStatusText(item)}
                </span>
                {(item.status === 'downloading' || item.status === 'processing') && (
                  <span className={`text-xs ${
                    theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {item.progress}%
                  </span>
                )}
              </div>
              {(item.status === 'downloading' || item.status === 'processing' || item.status === 'pending') && (
                <div className={`h-1 rounded-full mt-2 overflow-hidden ${
                  theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'
                }`}>
                  <div 
                    className={`h-full transition-all duration-500 ${getProgressColor(item)}`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
            </div>

            {item.status === 'error' && (
              <button
                onClick={() => removeFromQueue(item.id)}
                className={`p-1.5 rounded-full transition-colors ${
                  theme === 'dark' ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-400'
                }`}
                data-testid={`button-remove-${item.videoId}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
