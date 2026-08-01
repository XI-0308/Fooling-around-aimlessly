"use client";

import type { ReactNode } from "react";
import MessageAvatar from "@/components/MessageAvatar";

type Props = {
  role: "user" | "assistant";
  displayName: string;
  characterId?: string;
  characterName: string;
  userName: string;
  characterHasAvatar: boolean;
  userHasAvatar: boolean;
  characterAvatarVersion?: number;
  userAvatarVersion?: number;
  extra?: ReactNode;
};

/** 头像 + 名字（名字在头像旁/下，与档案页同尺寸 72px） */
export default function ChatSpeakerBlock({
  role,
  displayName,
  characterId,
  characterName,
  userName,
  characterHasAvatar,
  userHasAvatar,
  characterAvatarVersion,
  userAvatarVersion,
  extra,
}: Props) {
  return (
    <div className={`chat-speaker-block chat-speaker-${role}`}>
      <MessageAvatar
        role={role}
        characterId={characterId}
        characterName={characterName}
        userName={userName}
        characterHasAvatar={characterHasAvatar}
        userHasAvatar={userHasAvatar}
        characterAvatarVersion={characterAvatarVersion}
        userAvatarVersion={userAvatarVersion}
      />
      <span className="msg-role chat-speaker-name">
        {displayName}
        {extra}
      </span>
    </div>
  );
}
