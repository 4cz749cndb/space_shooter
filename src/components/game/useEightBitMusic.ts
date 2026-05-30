"use client";

import { type MutableRefObject, useEffect, useMemo, useRef } from "react";

export type ResultTune = "happy" | "sad";
export type ExplosionKind = "enemy" | "player";

export function useEightBitMusic() {
  const audioRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const gainConnectedRef = useRef(false);
  const intensityRef = useRef(1);
  const noteIndexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number[]>([]);
  const melody = useMemo(
    () => [330, 392, 494, 392, 523, 494, 392, 294, 330, 392, 440, 392, 330, 262, 294, 330],
    []
  );

  const getMusicInterval = () => {
    const progress = clamp01(intensityRef.current - 1);
    return 220 - progress * 75;
  };

  const getMusicVolume = () => {
    const progress = clamp01(intensityRef.current - 1);
    return 0.055 + progress * 0.025;
  };

  const getMusicGain = (context: AudioContext) => {
    const gain = gainRef.current ?? context.createGain();
    gainRef.current = gain;

    if (!gainConnectedRef.current) {
      gain.connect(context.destination);
      gainConnectedRef.current = true;
    }

    return gain;
  };

  const stop = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    for (const timer of resultTimerRef.current) {
      window.clearTimeout(timer);
    }
    resultTimerRef.current = [];
    noteIndexRef.current = 0;

    gainRef.current?.gain.cancelScheduledValues(0);
    gainRef.current?.gain.setValueAtTime(0, audioRef.current?.currentTime ?? 0);
  };

  const setIntensity = (timeScale: number) => {
    const nextIntensity = Math.min(Math.max(timeScale, 1), 2);
    intensityRef.current = nextIntensity;

    const context = audioRef.current;
    if (!context || !gainRef.current || timerRef.current === null) return;

    gainRef.current.gain.cancelScheduledValues(context.currentTime);
    gainRef.current.gain.linearRampToValueAtTime(getMusicVolume(), context.currentTime + 0.08);
  };

  const start = async () => {
    if (timerRef.current !== null) return;

    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      await context.resume();
    }

    const gain = getMusicGain(context);
    gain.gain.setValueAtTime(getMusicVolume(), context.currentTime);

    const playNote = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const intensityProgress = clamp01(intensityRef.current - 1);
      const melodyIndex = noteIndexRef.current % melody.length;
      const shouldLiftOctave = intensityProgress > 0.58 && noteIndexRef.current % 4 === 0;
      const frequency = melody[melodyIndex] * (shouldLiftOctave ? 2 : 1);

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, now);
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      oscillator.connect(noteGain);
      noteGain.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.2);

      noteIndexRef.current += 1;
      timerRef.current = window.setTimeout(playNote, getMusicInterval());
    };

    playNote();
  };

  const playResultTune = async (kind: ResultTune) => {
    stop();

    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      await context.resume();
    }

    const gain = getMusicGain(context);
    gain.gain.setValueAtTime(0.065, context.currentTime);

    const notes = kind === "happy" ? [392, 494, 587, 784, 988] : [392, 349, 294, 247, 196];
    const noteLength = kind === "happy" ? 0.16 : 0.22;

    resultTimerRef.current = notes.map((frequency, index) =>
      window.setTimeout(() => {
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const noteGain = context.createGain();

        oscillator.type = kind === "happy" ? "square" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, now);
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + noteLength);
        oscillator.connect(noteGain);
        noteGain.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + noteLength + 0.02);
      }, index * 170)
    );
  };

  const playLevelUpTune = () => {
    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume();
    }

    const notes = [523, 659, 784, 1047, 1319];
    const now = context.currentTime;

    notes.forEach((frequency, index) => {
      const startTime = now + index * 0.07;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = index % 2 === 0 ? "square" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.16, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.2);
    });
  };

  const playPew = () => {
    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1160, now);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.08);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.11);
  };

  const playBuzz = () => {
    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.setValueAtTime(120, now + 0.045);
    oscillator.frequency.setValueAtTime(150, now + 0.09);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.008);
    gain.gain.setValueAtTime(0.16, now + 0.11);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  };

  const playExplosion = (kind: ExplosionKind) => {
    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const duration = kind === "player" ? 0.42 : 0.24;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(kind === "player" ? 220 : 360, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "player" ? 42 : 95, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(kind === "player" ? 0.24 : 0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  };

  useEffect(() => stop, []);

  return { playBuzz, playExplosion, playLevelUpTune, playPew, playResultTune, setIntensity, start, stop };
}

function getAudioContext(audioRef: MutableRefObject<AudioContext | null>) {
  if (audioRef.current) return audioRef.current;

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  audioRef.current = new AudioContextConstructor();
  return audioRef.current;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
