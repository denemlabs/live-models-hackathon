import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import type { Profile, StoryPage } from "../shared/story";
import {
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
  preparePictures: () => Promise<boolean>;
}) {
  const { accessCode, profile, topic, history, onScene, onPage } = options;
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const spoken = useRef<string[]>([]);
  const pendingPage = useRef<PageArgs | null>(null);
  const scene = useRef<SceneArgs | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionId = useRef(0);
  const latest = useRef({
    onScene,
    onPage,
    preparePictures: options.preparePictures,
  });
  latest.current = {
    onScene,
    onPage,
    preparePictures: options.preparePictures,
  };
  const attempt = useRef(0);

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
        spoken.current.push(text);
        settlePage();
      }
      setCaptions((prev) =>
        [...prev, { id: ++captionId.current, who, text }].slice(-8),
      );
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
    const current = ++attempt.current;
    setError("");
    setCaptions([]);
    setConnecting(true);
    spoken.current = [];
    pendingPage.current = null;
    scene.current = null;
    try {
      const permission = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      permission.getTracks().forEach((track) => track.stop());
      if (current !== attempt.current) return;
      const [session, picturesReady] = await Promise.all([
        api<{
          token: string;
          overrides: CallOverrides | null;
        }>(
          "/api/storyteller/token",
          { profile, topic, history: history.slice(-12) },
          accessCode,
        ),
        latest.current.preparePictures(),
      ]);
      if (current !== attempt.current) return;
      if (!picturesReady)
        throw new Error(
          "The live picture isn’t ready yet. Please reconnect the pictures, then try the call again.",
        );
      await startSession({
        conversationToken: session.token,
        connectionType: "webrtc",
        ...(session.overrides ? { overrides: session.overrides } : {}),
      });
      if (current !== attempt.current) endSession();
    } catch (e) {
      if (current !== attempt.current) return;
      setError(
        e instanceof DOMException
          ? "We need permission to use the microphone so the storyteller can hear you."
          : e instanceof Error
            ? e.message
            : "The storyteller couldn’t join just now. Please try again.",
      );
    } finally {
      if (current === attempt.current) setConnecting(false);
    }
  }, [accessCode, history, profile, startSession, endSession, topic]);

  const hangUp = useCallback(() => {
    attempt.current++;
    setConnecting(false);
    if (settle.current) clearTimeout(settle.current);
    pendingPage.current = null;
    spoken.current = [];
    endSession();
  }, [endSession]);

  useEffect(
    () => () => {
      attempt.current++;
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
    captions,
    status: conversation.status,
    isSpeaking: conversation.isSpeaking,
    isMuted: conversation.isMuted,
    setMuted: conversation.setMuted,
    sendUserMessage: conversation.sendUserMessage,
    getOutputByteFrequencyData: conversation.getOutputByteFrequencyData,
  };
}
