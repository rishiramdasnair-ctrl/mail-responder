import { useEffect, useState, useRef } from "react";

// DO NOT MODIFY THIS FILE
// The recording/export pipeline depends on its exact implementation.

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}

interface UseVideoPlayerOptions {
  durations: Record<string, number>;
}

export function useVideoPlayer({ durations }: UseVideoPlayerOptions) {
  const [currentScene, setCurrentScene] = useState(0);
  const keys = Object.keys(durations);
  const sceneCount = keys.length;
  const isFirstPass = useRef(true);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const playScene = (index: number) => {
      setCurrentScene(index);
      
      const key = keys[index];
      const duration = durations[key];

      timeoutId = setTimeout(() => {
        const nextScene = index + 1;
        if (nextScene >= sceneCount) {
          if (isFirstPass.current) {
            isFirstPass.current = false;
            window.stopRecording?.();
          }
          playScene(0); // loop
        } else {
          playScene(nextScene);
        }
      }, duration);
    };

    window.startRecording?.();
    playScene(0);

    return () => clearTimeout(timeoutId);
  }, []); // Run once on mount

  return { currentScene };
}
