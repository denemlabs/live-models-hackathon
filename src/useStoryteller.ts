import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import type { Profile, StoryPage } from "../shared/story";
import {
  mergeTranscript,
  PageArgsSchema,
  pageChoices,
  SceneArgsSchema,
  SHOW_SCENE_TOOL,
  TURN_PAGE_TOOL,
  type CallOverrides,
  type PageArgs,
  type SceneArgs,
} from "../shared/storyteller";
import { api } from "./api";

export type Caption = {
  id: number;
  who: "storyteller" | "child";
  text: string;
};

// The agent's spoken text and its turn_page call arrive as separate events in
// no guaranteed order, so a page is only written once both have settled.
const SETTLE_MS = 700;

export function useStoryteller(options: {
  accessCode: string;
  profile: Profile;
  topic: string;
  history: StoryPage[];
  onScene: (scene: SceneArgs) => void;
  onPage: (page: StoryPage) => void;
}) {
  const { accessCode, profile, topic, history, onScene, onPage } = options;
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  // Captions read like the rolling subtitles on a television, so only the line
  // being spoken right now is ever on screen.
  const [caption, setCaption] = useState<Caption | null>(null);
  const spoken = useRef<string[]>([]);
  const pendingPage = useRef<PageArgs | null>(null);
  const scene = useRef<SceneArgs | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionId = useRef(0);
  const latest = useRef({ onScene, onPage });
  latest.current = { onScene, onPage };

  const settlePage = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const args = pendingPage.current;
      const narrative = spoken.current.join(" ").trim();
      if (!args || !narrative) return;
      pendingPage.current = null;
      spoken.current = [];
      latest.current.onPage({
        title: args.title,
        narrative,
        question: args.question,
        choices: pageChoices(args),
        visualPrompt: scene.current?.visual_prompt ?? "",
        theme: scene.current?.theme ?? "forest",
      });
    }, SETTLE_MS);
  }, []);

  const conversation = useConversation({
    onMessage: ({ message, source }) => {
      const text = message.trim();
      if (!text) return;
      const who: Caption["who"] = source === "ai" ? "storyteller" : "child";
      if (who === "storyteller") {
        const merge = mergeTranscript(spoken.current.at(-1), text);
        if (merge === "replace")
          spoken.current[spoken.current.length - 1] = text;
        else if (merge === "append") spoken.current.push(text);
        settlePage();
      }
      setCaption((prev) => {
        const merge =
          prev?.who === who ? mergeTranscript(prev.text, text) : "append";
        if (merge === "skip") return prev;
        // A growing partial keeps its id so the line flows on instead of
        // restarting the roll-up mid-sentence.
        return {
          id: merge === "replace" && prev ? prev.id : ++captionId.current,
          who,
          text,
        };
      });
    },
    onError: () =>
      setError(
        "The story call dropped. You can hang up and call the storyteller again.",
      ),
  });

  useConversationClientTool(SHOW_SCENE_TOOL, (params) => {
    const parsed = SceneArgsSchema.safeParse(params);
    if (!parsed.success) return;
    scene.current = parsed.data;
    latest.current.onScene(parsed.data);
  });
  useConversationClientTool(TURN_PAGE_TOOL, (params) => {
    const parsed = PageArgsSchema.safeParse(params);
    if (!parsed.success) return;
    pendingPage.current = parsed.data;
    settlePage();
  });

  const { startSession, endSession } = conversation;
  const start = useCallback(async () => {
    setError("");
    setCaption(null);
    setConnecting(true);
    spoken.current = [];
    pendingPage.current = null;
    scene.current = null;
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const session = await api<{
        token: string;
        overrides: CallOverrides | null;
      }>(
        "/api/storyteller/token",
        { profile, topic, history: history.slice(-12) },
        accessCode,
      );
      startSession({
        conversationToken: session.token,
        connectionType: "webrtc",
        ...(session.overrides ? { overrides: session.overrides } : {}),
      });
    } catch (e) {
      setError(
        e instanceof DOMException
          ? "We need permission to use the microphone so the storyteller can hear you."
          : e instanceof Error
            ? e.message
            : "The storyteller couldn’t join just now. Please try again.",
      );
    } finally {
      setConnecting(false);
    }
  }, [accessCode, history, profile, startSession, topic]);

  const hangUp = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    pendingPage.current = null;
    spoken.current = [];
    endSession();
  }, [endSession]);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
      endSession();
    },
    [endSession],
  );

  return {
    start,
    hangUp,
    connecting,
    error,
    caption,
    status: conversation.status,
    isSpeaking: conversation.isSpeaking,
    isMuted: conversation.isMuted,
    setMuted: conversation.setMuted,
    sendUserMessage: conversation.sendUserMessage,
    getOutputByteFrequencyData: conversation.getOutputByteFrequencyData,
  };
}
