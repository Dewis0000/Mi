"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export function LivePlayer({ hlsUrl }: { hlsUrl: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!hlsUrl || !video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(true);
      });
      return () => hls.destroy();
    }
    queueMicrotask(() => setError(true));
  }, [hlsUrl]);

  if (!hlsUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed bg-muted/30 p-6 text-center">
        <div className="max-w-xs">
          <p className="font-medium">Трансляция пока недоступна</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Камера этой комнаты ещё не подключена к медиа-серверу (см. docs/ARCHITECTURE.md, раздел 7).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} controls autoPlay playsInline className="h-full w-full" />
      {error && <p className="bg-destructive/10 p-2 text-center text-xs text-destructive">Не удалось загрузить поток</p>}
    </div>
  );
}
