import React, { useState, useEffect } from 'react';
import { Movie, User } from './types';
import { api, authStorage } from './services/api';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { Footer } from './components/Footer';
import { VideoPlayer } from './components/VideoPlayer';
import { AuthModal } from './components/AuthModal';

import { HomePage } from './pages/HomePage';
import { MovieDetailsPage } from './pages/MovieDetailsPage';
import { MoviesPage } from './pages/MoviesPage';
import { GenresPage } from './pages/GenresPage';
import { SearchPage } from './pages/SearchPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { AdminPage } from './pages/AdminPage';
import { ContactPage } from './pages/ContactPage';
import { LegalPage } from './pages/LegalPage';

const getTabFromPath = (path: string): string => {
  const clean = path.toLowerCase().replace(/\/$/, '');
  if (clean === '/admin') return 'admin';
  if (clean === '/movies') return 'movies';
  if (clean === '/genres') return 'genres';
  if (clean === '/search') return 'search';
  if (clean === '/watchlist') return 'watchlist';
  if (clean === '/contact') return 'contact';
  if (clean === '/legal/dmca' || clean === '/dmca') return 'legal_dmca';
  if (clean === '/legal/terms' || clean === '/terms') return 'legal_terms';
  if (clean === '/legal/privacy' || clean === '/privacy') return 'legal_privacy';
  return 'home';
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getTabFromPath(window.location.pathname);
    }
    return 'home';
  });
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [playingMovie, setPlayingMovie] = useState<Movie | null>(null);
  const [user, setUser] = useState<User | null>(authStorage.getUser());
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [initialGenre, setInitialGenre] = useState<string>('Action');

  // Verify auth on mount and ensure initial data
  useEffect(() => {
    api.ensureInitialData();
    api.getMe()
      .then((userData) => {
        if (userData) {
          setUser(userData);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for browser back / forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      setSelectedMovie(null);
      setCurrentTab(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Scroll to top on navigation & sync browser history
  const navigateTo = (tab: string, extra?: any) => {
    if (extra?.genre) {
      setInitialGenre(extra.genre);
    }
    setSelectedMovie(null);
    setCurrentTab(tab);
    const path = tab === 'home' ? '/' : `/${tab.replace('_', '/')}`;
    if (window.location.pathname !== path) {
      window.history.pushState({ tab }, '', path);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectMovie = (movie: Movie) => {
    setSelectedMovie(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePlayMovie = (movie: Movie) => {
    setPlayingMovie(movie);
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    navigateTo('home');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#08090d] text-slate-100 font-sans selection:bg-red-600 selection:text-white">
      {/* Universal Header */}
      <Header
        currentTab={selectedMovie ? '' : currentTab}
        onNavigate={navigateTo}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {selectedMovie ? (
          <MovieDetailsPage
            movie={selectedMovie}
            onBack={() => setSelectedMovie(null)}
            onPlayMovie={handlePlayMovie}
            user={user}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        ) : (
          <>
            {currentTab === 'home' && (
              <HomePage
                onSelectMovie={handleSelectMovie}
                onPlayMovie={handlePlayMovie}
                onNavigate={navigateTo}
                user={user}
                onOpenAuth={() => setAuthModalOpen(true)}
              />
            )}

            {currentTab === 'movies' && (
              <MoviesPage
                onSelectMovie={handleSelectMovie}
                onPlayMovie={handlePlayMovie}
              />
            )}

            {currentTab === 'genres' && (
              <GenresPage
                onSelectMovie={handleSelectMovie}
                onPlayMovie={handlePlayMovie}
                initialGenre={initialGenre}
              />
            )}

            {currentTab === 'search' && (
              <SearchPage
                onSelectMovie={handleSelectMovie}
                onPlayMovie={handlePlayMovie}
              />
            )}

            {currentTab === 'watchlist' && (
              <WatchlistPage
                user={user}
                onOpenAuth={() => setAuthModalOpen(true)}
                onSelectMovie={handleSelectMovie}
                onPlayMovie={handlePlayMovie}
              />
            )}

            {currentTab === 'admin' && (
              <AdminPage
                user={user}
                onNavigateHome={() => navigateTo('home')}
                onOpenAuth={() => setAuthModalOpen(true)}
                onSelectMovie={handleSelectMovie}
                onPlayMovie={handlePlayMovie}
              />
            )}

            {currentTab === 'contact' && <ContactPage />}

            {currentTab === 'legal_dmca' && (
              <LegalPage section="dmca" onBack={() => navigateTo('home')} />
            )}

            {currentTab === 'legal_terms' && (
              <LegalPage section="terms" onBack={() => navigateTo('home')} />
            )}

            {currentTab === 'legal_privacy' && (
              <LegalPage section="privacy" onBack={() => navigateTo('home')} />
            )}
          </>
        )}
      </main>

      {/* Active Fullscreen Video Player */}
      {playingMovie && (
        <VideoPlayer
          movie={playingMovie}
          onClose={() => setPlayingMovie(null)}
        />
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(newUser) => {
          setUser(newUser);
          if (newUser.role === 'admin') {
            navigateTo('admin');
          }
        }}
      />

      {/* Footer */}
      <Footer onNavigate={navigateTo} />

      {/* Mobile Bottom Navigation Bar (Home | Movies | Search | Watchlist | Profile) */}
      <BottomNav
        currentTab={currentTab}
        onNavigate={navigateTo}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
    </div>
  );
}
