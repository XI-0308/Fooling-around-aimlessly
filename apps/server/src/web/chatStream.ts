import type { GenerationSettings } from "../config.js";

import { streamChatCompletion, type StreamCallbacks } from "../deepseek.js";

import {

  streamAnthropicChatWithWebSearch,

  type WebSearchStreamCallbacks,

} from "./search/anthropicStream.js";



export type ChatStreamCallbacks = StreamCallbacks & {

  onWebSearching?: () => void;

};



export async function streamRoleplayChat(

  apiKey: string,

  messages: Parameters<typeof streamChatCompletion>[1],

  settings: GenerationSettings & { webSearchEnabled?: boolean; webSearchThisTurn?: boolean },

  callbacks: ChatStreamCallbacks

): Promise<void> {

  const useWebSearch =

    settings.webSearchEnabled !== false && settings.webSearchThisTurn === true;

  if (useWebSearch) {

    await streamAnthropicChatWithWebSearch(apiKey, messages, settings, callbacks);

    return;

  }

  await streamChatCompletion(apiKey, messages, settings, callbacks);

}

