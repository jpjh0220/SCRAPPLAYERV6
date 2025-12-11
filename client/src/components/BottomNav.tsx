import { useLocation, Link } from 'wouter';
import { Home, Compass, Library } from 'lucide-react';
import { useThemeStore } from '@/lib/themeStore';

export function BottomNav() {
  const [location] = useLocation();
  const { theme } = useThemeStore();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/explore', label: 'Explore', icon: Compass },
    { path: '/library', label: 'Library', icon: Library },
  ];

  return (
    <nav className={`fixed bottom-0 left-0 right-0 z-50 safe-area-bottom ${
      theme === 'dark' 
        ? 'bg-gray-900/95 backdrop-blur-lg border-t border-white/10' 
        : 'nav-clean'
    }`}>
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              href={item.path}
              className="relative flex flex-col items-center justify-center flex-1 h-full gap-1 group"
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-rose-500 rounded-b-full" />
              )}
              
              <div className={`relative p-2 rounded-xl transition-all duration-200 ${
                isActive 
                  ? theme === 'dark' ? 'bg-rose-500/20' : 'bg-rose-50'
                  : theme === 'dark' ? 'group-hover:bg-white/10' : 'group-hover:bg-gray-100'
              }`}>
                <Icon className={`w-5 h-5 transition-all duration-200 ${
                  isActive 
                    ? 'text-rose-500' 
                    : theme === 'dark' 
                      ? 'text-gray-400 group-hover:text-white' 
                      : 'text-gray-400 group-hover:text-gray-600'
                }`} />
              </div>
              
              <span className={`text-[10px] font-semibold tracking-wide transition-colors duration-200 ${
                isActive 
                  ? 'text-rose-500' 
                  : theme === 'dark' 
                    ? 'text-gray-400 group-hover:text-white' 
                    : 'text-gray-400 group-hover:text-gray-600'
              }`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
