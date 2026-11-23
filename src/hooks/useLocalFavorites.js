import { useCallback, useEffect, useState } from "react";

const FAVORITES_EVENT = "karaoke:favorites-changed";

const getStorageKey = (userId) => `karaoke_favorites_${userId}`;

const readFavorites = (storageKey) => {
  if (!storageKey) return [];
  try {
    const songs = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(songs) ? songs.filter((song) => song?.videoId && song?.title) : [];
  } catch {
    return [];
  }
};

export const useLocalFavorites = (userId) => {
  const storageKey = userId ? getStorageKey(userId) : null;
  const [storedFavorites, setStoredFavorites] = useState({ key: null, songs: [] });

  useEffect(() => {
    if (!storageKey) {
      setStoredFavorites({ key: null, songs: [] });
      return undefined;
    }

    const syncFavorites = () => setStoredFavorites({ key: storageKey, songs: readFavorites(storageKey) });
    const onStorage = (event) => {
      if (event.key === storageKey) syncFavorites();
    };
    const onFavoritesChanged = (event) => {
      if (event.detail?.key === storageKey) syncFavorites();
    };

    syncFavorites();
    window.addEventListener("storage", onStorage);
    window.addEventListener(FAVORITES_EVENT, onFavoritesChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAVORITES_EVENT, onFavoritesChanged);
    };
  }, [storageKey]);

  const favorites = storedFavorites.key === storageKey ? storedFavorites.songs : [];

  const toggleFavorite = useCallback((song) => {
    if (!storageKey || !song?.videoId || !song?.title) return;

    const currentFavorites = readFavorites(storageKey);
    const exists = currentFavorites.some((favorite) => favorite.videoId === song.videoId);
    const nextFavorites = exists
      ? currentFavorites.filter((favorite) => favorite.videoId !== song.videoId)
      : [...currentFavorites, {
          videoId: song.videoId,
          title: song.title,
          thumbnail: song.thumbnail || `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`,
          authorName: song.authorName || song.channelTitle || "YouTube"
        }];

    try {
      localStorage.setItem(storageKey, JSON.stringify(nextFavorites));
      setStoredFavorites({ key: storageKey, songs: nextFavorites });
      window.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: { key: storageKey } }));
    } catch (error) {
      console.warn("Could not save favorite songs on this device:", error);
    }
  }, [storageKey]);

  return {
    favorites,
    isFavorite: (videoId) => favorites.some((song) => song.videoId === videoId),
    toggleFavorite
  };
};
