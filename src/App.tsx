/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Song } from './types/song';
import { storageService } from './services/storage';
import { MobileShell } from './components/ui/MobileShell';
import { BottomTabBar } from './components/ui/Tabs';
import { SplashScreen } from './screens/SplashScreen';
import { HomeScreen } from './screens/HomeScreen';
import { EditorScreen } from './screens/EditorScreen';
import { GameplayScreen } from './screens/GameplayScreen';

export default function App() {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentTab, setCurrentTab] = useState<'home' | 'editor'>('home');
  const [activePlayingSong, setActivePlayingSong] = useState<Song | null>(null);
  const [editorSongId, setEditorSongId] = useState<string>('');

  const refreshSongs = useCallback(async () => {
    const list = await storageService.getSongs();
    setSongs(list);
    if (list.length > 0 && !editorSongId) {
      setEditorSongId(list[0].id);
    }
  }, [editorSongId]);

  // Handle URL query parameters (e.g. ?autostart=1 or ?tab=editor)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'editor') {
      setCurrentTab('editor');
    }
  }, []);

  const handleSplashLoaded = useCallback(async () => {
    await refreshSongs();
    setIsInitialized(true);

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const list = await storageService.getSongs();
      if (list.length > 0) {
        setActivePlayingSong(list[0]);
      }
    }
  }, [refreshSongs]);

  const handlePlaySong = (song: Song) => {
    setActivePlayingSong(song);
  };

  const handleEditSong = (song: Song) => {
    setEditorSongId(song.id);
    setCurrentTab('editor');
  };

  const handleExitGameplay = () => {
    setActivePlayingSong(null);
  };

  const handleRestartGameplay = () => {
    if (activePlayingSong) {
      const current = activePlayingSong;
      setActivePlayingSong(null);
      setTimeout(() => {
        setActivePlayingSong(current);
      }, 50);
    }
  };

  return (
    <MobileShell activeScreen={activePlayingSong ? 'play' : currentTab}>
      {!isInitialized ? (
        <SplashScreen onLoaded={handleSplashLoaded} />
      ) : activePlayingSong ? (
        /* Full-screen Gameplay Screen Modal/Route */
        <GameplayScreen
          song={activePlayingSong}
          onExitToHome={handleExitGameplay}
          onRestart={handleRestartGameplay}
        />
      ) : (
        /* Main Tab Navigation Container */
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {currentTab === 'home' ? (
              <HomeScreen
                songs={songs}
                onRefreshSongs={refreshSongs}
                onPlaySong={handlePlaySong}
                onEditSong={handleEditSong}
              />
            ) : (
              <EditorScreen
                songs={songs}
                selectedSongId={editorSongId || (songs[0]?.id ?? '')}
                onSelectSong={(id) => setEditorSongId(id)}
                onRefreshSongs={refreshSongs}
                onPlaySong={handlePlaySong}
              />
            )}
          </div>

          {/* Bottom Tab Bar */}
          <BottomTabBar
            currentTab={currentTab}
            onTabChange={(tab) => setCurrentTab(tab)}
            quickPlaySongTitle={songs[0]?.title}
            onQuickPlay={songs[0] ? () => handlePlaySong(songs[0]) : undefined}
          />
        </div>
      )}
    </MobileShell>
  );
}
