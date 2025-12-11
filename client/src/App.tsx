import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { useThemeStore } from "@/lib/themeStore";
import { useEffect } from "react";
import HomePage from "@/pages/home";
import ExplorePage from "@/pages/explore";
import LibraryPage from "@/pages/library";
import ProfilePage from "@/pages/profile";
import UserProfilePage from "@/pages/user-profile";
import UsersPage from "@/pages/users";
import ArtistPage from "@/pages/artist";
import PlaylistsPage from "@/pages/playlists";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/explore" component={ExplorePage} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/user/:userId" component={UserProfilePage} />
      <Route path="/users" component={UsersPage} />
      <Route path="/artist/:name" component={ArtistPage} />
      <Route path="/playlists" component={PlaylistsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <div className={`flex flex-col min-h-screen overflow-hidden transition-colors duration-200 ${
          theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'
        }`}>
          <main className="flex-1 flex flex-col overflow-y-auto">
            <Router />
          </main>
          <MiniPlayer />
          <BottomNav />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
