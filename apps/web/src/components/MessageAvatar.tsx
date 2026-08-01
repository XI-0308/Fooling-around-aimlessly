"use client";

type Props = {
  role: "user" | "assistant";
  characterId?: string;
  characterName: string;
  userName: string;
  characterHasAvatar: boolean;
  userHasAvatar: boolean;
  /** 文件 mtime，用于缓存破坏；同一会话内保持稳定 */
  characterAvatarVersion?: number;
  userAvatarVersion?: number;
};

/** 用 background-image 而不是每条消息一张 <img>，浏览器只解码一次 */
export default function MessageAvatar({
  role,
  characterId,
  characterName,
  userName,
  characterHasAvatar,
  userHasAvatar,
  characterAvatarVersion = 0,
  userAvatarVersion = 0,
}: Props) {
  if (role === "user") {
    if (userHasAvatar) {
      const src = `/api/user/avatar?v=${userAvatarVersion || 0}`;
      return (
        <div
          className="msg-avatar msg-avatar-photo"
          style={{ backgroundImage: `url(${src})` }}
          role="img"
          aria-label={userName}
        />
      );
    }
    return <div className="msg-avatar msg-avatar-fallback">{userName.slice(0, 1)}</div>;
  }
  if (characterHasAvatar && characterId) {
    const src = `/api/characters/${characterId}/avatar?v=${characterAvatarVersion || 0}`;
    return (
      <div
        className="msg-avatar msg-avatar-photo"
        style={{ backgroundImage: `url(${src})` }}
        role="img"
        aria-label={characterName}
      />
    );
  }
  return <div className="msg-avatar msg-avatar-fallback">{characterName.slice(0, 1)}</div>;
}
