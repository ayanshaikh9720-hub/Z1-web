import React, { useState } from 'react';
import { Film, Search, Bookmark, User as UserIcon, Shield, LogOut, Menu, X } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onNavigate,
  user,
  onOpenAuth,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { id: 'home', label: 'Home' },
    { id: 'movies', label: 'Movies' },
    { id: 'genres', label: 'Genres' },
    { id: 'search', label: 'Search' },
    { id: 'watchlist', label: 'Watchlist' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#08090d]/95 backdrop-blur-md border-b border-slate-800/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Zone 1: Single text element Brand wordmark */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 group focus:outline-none"
            aria-label="Z1 Movies Home"
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-red-700 to-red-600 flex items-center justify-center shadow-lg shadow-red-950/50 group-hover:scale-105 transition-transform">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-extrabold text-xl tracking-tight text-white group-hover:text-red-400 transition-colors">
              Z1<span className="text-red-500">.</span>MOVIES
            </span>
          </button>
        </div>

        {/* Zone 2: 4-6 nav links (Desktop) */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          {navLinks.map((link) => {
            const isActive = currentTab === link.id;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                className={`relative py-1 transition-colors whitespace-nowrap focus:outline-none ${
                  isActive ? 'text-white font-semibold' : 'hover:text-white text-slate-400'
                }`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('search')}
            className="p-2 text-slate-400 hover:text-white transition-colors focus:outline-none hidden sm:flex"
            aria-label="Search Catalog"
            title="Search Catalog"
          >
            <Search className="w-5 h-5" />
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={() => onNavigate('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                currentTab === 'admin'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-red-400" />
              <span>Admin Panel</span>
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('watchlist')}
                className="p-2 text-slate-400 hover:text-white transition-colors hidden sm:flex"
                title="My Watchlist"
                aria-label="My Watchlist"
              >
                <Bookmark className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left text-xs leading-none">
                  <div className="font-semibold text-slate-200 truncate max-w-[100px]">{user.name}</div>
                  <span className="text-[10px] text-slate-400">{user.role}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                  title="Sign Out"
                  aria-label="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap"
            >
              <UserIcon className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer (When open) */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0c0e14] border-b border-slate-800 px-4 py-3 space-y-2">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => {
                onNavigate(link.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                currentTab === link.id
                  ? 'bg-red-600/20 text-red-400 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              {link.label}
            </button>
          ))}
          {user?.role === 'admin' && (
            <button
              onClick={() => {
                onNavigate('admin');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm bg-red-950/40 text-red-300 border border-red-900/40 font-semibold flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Admin Portal
            </button>
          )}
          {user ? (
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 px-3">
              <span>Signed in as <b className="text-slate-200">{user.name}</b></span>
              <button
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                className="text-red-400 font-semibold underline"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                onOpenAuth();
                setMobileMenuOpen(false);
              }}
              className="w-full mt-2 py-2.5 bg-red-600 text-white rounded-lg text-xs font-bold text-center"
            >
              Sign In / Register
            </button>
          )}
        </div>
      )}
    </header>
  );
};
