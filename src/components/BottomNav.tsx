import React from 'react';
import { Home, Film, Search, Bookmark, User as UserIcon } from 'lucide-react';
import { User } from '../types';

interface BottomNavProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  user: User | null;
  onOpenAuth: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onNavigate,
  user,
  onOpenAuth,
}) => {
  const items = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
    { id: 'profile', label: 'Profile', icon: UserIcon },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#090a0f]/95 backdrop-blur-md border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around"
      style={{ maxHeight: '12vh' }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id || (item.id === 'profile' && currentTab === 'admin');

        return (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'profile') {
                if (!user) {
                  onOpenAuth();
                } else if (user.role === 'admin') {
                  onNavigate('admin');
                } else {
                  onNavigate('watchlist');
                }
              } else {
                onNavigate(item.id);
              }
            }}
            className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] py-1 transition-colors ${
              isActive ? 'text-red-500 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
