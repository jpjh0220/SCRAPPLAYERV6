import { type FormEvent } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useMusicStore } from '../lib/store';

const API_KEY = "AIzaSyCmf-qsQy5xkgnvU5kCR7yvK-Fp1MFzs_s";

export function SearchBar() {
  const { searchQuery, setSearchQuery, performSearch, isSearching } = useMusicStore();

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    performSearch(API_KEY);
  };

  return (
    <div className="p-4 md:p-6 border-b border-border">
      <h3 className="text-base md:text-lg font-semibold text-foreground mb-3">Search YouTube</h3>
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            placeholder="Search songs, artists..."
            data-testid="input-search"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !searchQuery.trim()}
          className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          data-testid="button-search"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="sm:inline hidden">Searching</span>
            </>
          ) : (
            'Search'
          )}
        </button>
      </form>
      <p className="text-[10px] md:text-xs text-muted-foreground mt-2">
        Results auto-download to your library
      </p>
    </div>
  );
}
