import { SearchBar } from "@/components/SearchBar";
import { ResultList } from "@/components/ResultList";
import { CommandBar } from "@/components/CommandBar";

export default function Discover() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-6 border-b border-border pt-14 md:pt-6">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Discover</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Search YouTube and download music
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
          {/* Direct URL Download */}
          <CommandBar />
          
          {/* Search */}
          <div className="bg-card/30 rounded-xl border border-border overflow-hidden">
            <SearchBar />
            <ResultList />
          </div>
        </div>
      </div>
    </div>
  );
}
