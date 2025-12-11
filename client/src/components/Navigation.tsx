import { useLocation, Link } from 'wouter';
import { Search, Library, Disc3, Menu, X, LogIn, LogOut, User, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function Navigation() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const navItems = [
    { path: '/', label: 'Discover', icon: Search },
    { path: '/trending', label: 'Trending', icon: TrendingUp },
    { path: '/library', label: 'Library', icon: Library },
  ];

  const handleNavClick = () => {
    if (isMobile) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-card border border-border rounded-lg"
        data-testid="button-menu"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && isMobile && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Navigation Sidebar */}
      <nav className={`
        fixed md:relative z-40 h-full
        w-56 bg-card border-r border-border flex flex-col shrink-0
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <Link href="/" className="flex items-center gap-3" onClick={handleNavClick}>
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Disc3 className="w-5 h-5 text-primary" />
            </div>
            <div className={`${!isOpen && !isMobile ? 'hidden' : ''}`}>
              <h1 className="text-sm font-bold text-foreground">TubePocket</h1>
              <p className="text-[9px] text-muted-foreground -mt-0.5">MP3 Downloader</p>
            </div>
          </Link>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 p-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.path;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={handleNavClick}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }
                  `}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className={`${!isOpen && !isMobile ? 'hidden' : ''}`}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* User / Auth Section */}
        <div className={`p-3 border-t border-border ${!isOpen && !isMobile ? 'hidden' : ''}`}>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading...</div>
          ) : isAuthenticated && user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {user.profileImageUrl ? (
                  <img 
                    src={user.profileImageUrl} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.firstName || user.email || 'User'}
                  </p>
                </div>
              </div>
              <a
                href="/api/logout"
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </a>
            </div>
          ) : (
            <a
              href="/api/login"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-all"
              data-testid="button-login"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </a>
          )}
        </div>
      </nav>
    </>
  );
}
