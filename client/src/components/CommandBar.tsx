import { useState, type FormEvent } from 'react';
import { Download, Link } from 'lucide-react';
import { useMusicStore } from '../lib/store';

export function CommandBar() {
  const { addToLibrary } = useMusicStore();
  const [urlInput, setUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    
    setIsDownloading(true);
    await addToLibrary(urlInput);
    setUrlInput('');
    setIsDownloading(false);
  };

  return (
    <div className="bg-card/30 rounded-xl border border-border p-4 md:p-5">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">Direct Download</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Paste a YouTube link to download directly
      </p>
      
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-mono text-xs"
            placeholder="https://youtube.com/watch?v=..."
            data-testid="input-url"
          />
        </div>
        <button
          type="submit"
          disabled={!urlInput.trim() || isDownloading}
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          data-testid="button-download-url"
        >
          <Download className="w-4 h-4" />
          {isDownloading ? 'Adding...' : 'Download'}
        </button>
      </form>
    </div>
  );
}
