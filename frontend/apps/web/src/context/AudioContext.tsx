'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ActiveSong {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string;
  audioUrl: string;
  versionId?: string;
}

interface AudioContextValue {
  activeSong: ActiveSong | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  queue: ActiveSong[];
  queueSource: 'repertoire' | 'album' | null;
  queueIndex: number;
  playSong: (song: ActiveSong) => void;
  playSongAtIndex: (index: number) => void;
  setQueue: (songs: ActiveSong[], source: 'repertoire' | 'album', startIndex?: number) => void;
  addToQueue: (songs: ActiveSong[], source: 'repertoire' | 'album') => void;
  clearQueue: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

const AudioContext = createContext<AudioContextValue>({
  activeSong: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  queue: [],
  queueSource: null,
  queueIndex: 0,
  playSong: () => {},
  playSongAtIndex: () => {},
  setQueue: () => {},
  addToQueue: () => {},
  clearQueue: () => {},
  pause: () => {},
  seek: () => {},
  setVolume: () => {},
  setMuted: () => {}
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const [activeSong, setActiveSong] = useState<ActiveSong | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [queue, setQueueState] = useState<ActiveSong[]>([]);
  const [queueSource, setQueueSource] = useState<'repertoire' | 'album' | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync volume/muted to audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const playSong = useCallback((song: ActiveSong) => {
    const audio = audioRef.current;
    if (!audio) return;

    // If same song is already active, just resume play
    if (activeSong?.id === song.id && activeSong?.audioUrl === song.audioUrl) {
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    setActiveSong(song);
    setCurrentTime(0);
    setDuration(0);

    audio.src = song.audioUrl;
    void audio.play().catch(() => {
      setIsPlaying(false);
    });
  }, [activeSong]);

  const playSongAtIndex = useCallback((index: number) => {
    if (index < 0 || index >= queue.length) return;
    const song = queue[index];
    setQueueIndex(index);
    playSong(song);
  }, [queue, playSong]);

  const setQueue = useCallback((songs: ActiveSong[], source: 'repertoire' | 'album', startIndex = 0) => {
    setQueueState(songs);
    setQueueSource(source);
    setQueueIndex(startIndex);
  }, []);

  const addToQueue = useCallback((songs: ActiveSong[], source: 'repertoire' | 'album') => {
    setQueueState((prev) => [...prev, ...songs]);
    if (!queueSource) {
      setQueueSource(source);
    }
  }, [queueSource]);

  const clearQueue = useCallback(() => {
    setQueueState([]);
    setQueueSource(null);
    setQueueIndex(0);
  }, []);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

  const handleSetVolume = useCallback((newVolume: number) => {
    setVolume(newVolume);
  }, []);

  const handleSetMuted = useCallback((newMuted: boolean) => {
    setMuted(newMuted);
  }, []);

  return (
    <AudioContext.Provider value={{ activeSong, isPlaying, currentTime, duration, volume, muted, queue, queueSource, queueIndex, playSong, playSongAtIndex, setQueue, addToQueue, clearQueue, pause, seek, setVolume: handleSetVolume, setMuted: handleSetMuted }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio(): AudioContextValue {
  return useContext(AudioContext);
}
