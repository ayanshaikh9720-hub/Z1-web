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

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [playingMovie, setPlayingMovie] = useState<Movie | null>(null);
  const [user, setUser] = useState<User | null>(authStorage.getUser());
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [initialGenre, setInitialGenre] = useState<string>('Action');

  // Verify auth on mount
  useEffect(() => {
    if (authStorage.getToken()) {
      api.getMe()
        .then((userData) => setUser(userData))
        .catch(() => {
          authStorage.clearToken();
          setUser(null);
        });
    }
  }, []);

  // Scroll to top on navigation
  const navigateTo = (tab: string, extra?: any) => {
    if (extra?.genre) {
      setInitialGenre(extra.genre);
    }
    setSelectedMovie(null);
    setCurrentTab(tab);
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
    if (currentTab === 'admin' || currentTab === 'watchlist') {
      setCurrentTab('home');
    }
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
        onSuccess={(newUser) => setUser(newUser)}
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
