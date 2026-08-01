"use client";

import { Bubble } from "@ant-design/x";
import ChatSpeakerBlock from "@/components/antx/ChatSpeakerBlock";

type Props = {
  text: string;
  characterId?: string;
  characterName: string;
  userName: string;
  characterHasAvatar: boolean;
  userHasAvatar: boolean;
  characterAvatarVersion?: number;
  userAvatarVersion?: number;
};

/** 工具调用等待：Bubble 流式打字机动画 */
export default function ToolWaitingBubble({
  text,
  characterId,
  characterName,
  userName,
  characterHasAvatar,
  userHasAvatar,
  characterAvatarVersion,
  userAvatarVersion,
}: Props) {
  return (
    <div className="chat-tool-wait">
      <Bubble
        placement="start"
        variant="filled"
        shape="round"
        content={text}
        avatar={
          <ChatSpeakerBlock
            role="assistant"
            displayName={characterName}
            characterId={characterId}
            characterName={characterName}
            userName={userName}
            characterHasAvatar={characterHasAvatar}
            userHasAvatar={userHasAvatar}
            characterAvatarVersion={characterAvatarVersion}
            userAvatarVersion={userAvatarVersion}
          />
        }
        typing={{ effect: "typing", step: 2, interval: 70 }}
        streaming
      />
    </div>
  );
}
