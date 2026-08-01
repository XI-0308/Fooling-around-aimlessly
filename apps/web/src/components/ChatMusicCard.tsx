"use client";

export interface MusicCardData {
  songId: number;
  name: string;
  artists: string;
  album?: string;
  coverUrl: string;
  webUrl: string;
  appUrl: string;
}

export default function ChatMusicCard({ card }: { card: MusicCardData }) {
  const href = card.webUrl;

  function handleOpen(e: React.MouseEvent) {
    // 移动端优先尝试唤起 App，失败则走网页链接
    if (typeof window !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      e.preventDefault();
      const fallback = card.webUrl;
      const start = Date.now();
      window.location.href = card.appUrl;
      window.setTimeout(() => {
        if (Date.now() - start < 1600) {
          window.location.href = fallback;
        }
      }, 1200);
    }
  }

  return (
    <a
      className="msg-music-card"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleOpen}
    >
      {card.coverUrl ? (
        <img src={card.coverUrl} alt="" className="msg-music-cover" loading="lazy" />
      ) : (
        <div className="msg-music-cover msg-music-cover-fallback">♪</div>
      )}
      <div className="msg-music-meta">
        <div className="msg-music-title">{card.name}</div>
        {card.artists &&
          card.artists !== "未知歌手" &&
          card.artists !== "未知艺人" && (
            <div className="msg-music-artist">{card.artists}</div>
          )}
        {card.album && <div className="msg-music-album hint">{card.album}</div>}
        <div className="msg-music-action">点击在网易云音乐中播放 →</div>
      </div>
    </a>
  );
}
