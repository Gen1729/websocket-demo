"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ViewMode = "lobby" | "room";

type Participant = {
  id: string;
  name: string;
  text: string;
  ts: number;
  joinedAt: number;
  isSelf?: boolean;
};

const ROOM_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const createRoomId = () => {
  let result = "";
  for (let i = 0; i < 8; i += 1) {
    const index = Math.floor(Math.random() * ROOM_ID_CHARS.length);
    result += ROOM_ID_CHARS[index];
  }
  return result;
};

const getGridConfig = (count: number) => {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
};

export default function Home() {
  const [view, setView] = useState<ViewMode>("lobby");
  const [displayName, setDisplayName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [selfText, setSelfText] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const selfIdRef = useRef(`self-${crypto.randomUUID()}`);
  const selfJoinedAtRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => a.joinedAt - b.joinedAt);
  }, [participants]);

  const { cols, rows } = getGridConfig(sortedParticipants.length || 1);

  const enterRoom = (targetRoomId: string) => {
    if (!displayName.trim()) {
      setError("表示名を入力してください");
      return;
    }

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) {
      setError("WebSocket URLが未設定です");
      return;
    }

    setError(null);
    setRoomId(targetRoomId);
    setView("room");
    setSelfText("");
    setIsInRoom(true);

    const now = Date.now();
    selfJoinedAtRef.current = now;
    setParticipants([
      {
        id: selfIdRef.current,
        name: displayName.trim(),
        text: "",
        ts: 0,
        joinedAt: now,
        isSelf: true,
      },
    ]);
  };

  const handleCreateRoom = () => {
    const newRoomId = createRoomId();
    enterRoom(newRoomId);
  };

  const handleJoinRoom = () => {
    const cleaned = joinRoomId.trim().toUpperCase();
    if (!cleaned) {
      setError("部屋番号を入力してください");
      return;
    }
    if (!/^[A-Z0-9]{8}$/.test(cleaned)) {
      setError("部屋番号は8桁の英数字（大文字）です");
      return;
    }

    enterRoom(cleaned);
  };

  const handleBackToLobby = () => {
    setView("lobby");
    setRoomId(null);
    setParticipants([]);
    setSelfText("");
    setError(null);
    setIsInRoom(false);
    selfJoinedAtRef.current = null;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  useEffect(() => {
    if (view !== "room" || !roomId || !displayName.trim()) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      const joinMsg = {
        type: "join",
        roomId,
        userId: selfIdRef.current,
        name: displayName.trim(),
        ts: Date.now(),
      };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!msg || msg.roomId !== roomId || typeof msg.type !== "string") {
        return;
      }

      if (msg.type === "state") {
        const userId = msg.userId;
        const name = msg.name;
        const text = msg.text;
        const ts = msg.ts;
        const joinedAt = msg.joinedAt;

        if (!userId || typeof text !== "string") return;

        setParticipants((prev) => {
          const index = prev.findIndex((item) => item.id === userId);
          if (index >= 0) {
            const existing = prev[index];
            if (typeof existing.ts === "number" && ts <= existing.ts) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...existing,
              name: name ?? existing.name,
              text,
              ts,
              joinedAt: joinedAt ?? existing.joinedAt,
              isSelf: existing.isSelf || userId === selfIdRef.current,
            };
            return next;
          }

          return [
            ...prev,
            {
              id: userId,
              name: name ?? "",
              text,
              ts,
              joinedAt: joinedAt ?? Date.now(),
              isSelf: userId === selfIdRef.current,
            },
          ];
        });
        return;
      }

      if (msg.type === "leave") {
        const userId = msg.userId;
        if (!userId) return;
        setParticipants((prev) => prev.filter((item) => item.id !== userId));
        return;
      }

      if (msg.type === "error") {
        setError(msg.message ?? "unknown error");
        setView("lobby");
      }
    };

    ws.onerror = () => {
      setError("接続エラーが発生しました");
    };

    ws.onclose = () => {
      setError("接続が切れました");
      setView("lobby");
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [view, roomId, displayName]);

  const sendStateDebounced = (nextText: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const sendPayload = (text: string) => {
      if (!socketRef.current || !roomId) return;
      const payload = {
        type: "state",
        roomId,
        userId: selfIdRef.current,
        name: displayName.trim(),
        text,
        ts: Date.now(),
        joinedAt: selfJoinedAtRef.current ?? Date.now(),
      };
      socketRef.current.send(JSON.stringify(payload));
      lastSentRef.current = Date.now();
    };

    const now = Date.now();
    const elapsed = now - lastSentRef.current;
    const remaining = Math.max(200 - elapsed, 0);

    if (remaining === 0) {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      sendPayload(nextText);
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      sendPayload(nextText);
      debounceRef.current = null;
    }, remaining);
  };

  const handleSelfTextChange = (nextText: string) => {
    setSelfText(nextText);
    sendStateDebounced(nextText);
    setParticipants((prev) => {
      const index = prev.findIndex((item) => item.id === selfIdRef.current);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = {
        ...next[index],
        text: nextText,
        ts: Date.now(),
      };
      return next;
    });
  };

  return (
    <main
      className={
        view === "room" ? "min-h-screen" : "min-h-screen px-6 py-10 md:px-12"
      }
    >
      <div
        className={
          view === "room"
            ? "flex min-h-screen w-full flex-col gap-6"
            : "mx-auto flex w-full max-w-5xl flex-col gap-8"
        }
      >
        {view === "lobby" && (
          <header className="flex flex-col gap-3">
            <p className="text-base tracking-[1em] text-zinc-500">
              Realtime Typing Rooms
            </p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-[3em] font-semibold text-zinc-900 md:text-[3em]">
                いま打っている文章が、そのまま届く。
              </h1>
            </div>
          </header>
        )}

        {view === "lobby" && (
          <section className="grid gap-8 rounded-3xl border border-zinc-200/80 bg-white/75 p-8 shadow-xl shadow-zinc-200/50 backdrop-blur">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h2 className="text-[2em] font-semibold text-zinc-900">ロビー</h2>
                <p className="text-sm text-zinc-600">
                  部屋を作るか、部屋番号で参加してください。
                </p>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white/80 p-6">
                <label className="text-lg font-semibold text-zinc-900">
                  表示名
                </label>
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400"
                  placeholder="例: TAKA"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <p className="text-xs text-zinc-500">
                  ルーム内の表示名として使われます。
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white/80 p-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">
                    roomを作成
                  </h3>
                  <p className="mt-2 text-sm text-zinc-600">
                    8桁の英数字（大文字）を自動生成します。
                  </p>
                </div>
                <button
                  className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-900/30 transition hover:-translate-y-0.5"
                  onClick={handleCreateRoom}
                >
                  roomを作成
                </button>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white/80 p-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">
                    roomに参加
                  </h3>
                  <p className="mt-2 text-sm text-zinc-600">
                    部屋番号を入力して参加します。
                  </p>
                </div>
                <input
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400"
                  placeholder="例: AB12CD34"
                  value={joinRoomId}
                  onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
                />
                <p className="text-xs text-zinc-500">
                  8桁の英数字（A-Z, 0-9）のみ。
                </p>
                <button
                  className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-900/30 transition hover:-translate-y-0.5"
                  onClick={handleJoinRoom}
                >
                  roomに参加
                </button>
              </div>
            </div>

            {error && isInRoom && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}
          </section>
        )}

        {view === "room" && (
          <section className="flex min-h-screen w-full flex-col gap-6 px-6 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {roomId && (
                <div className="text-2xl font-semibold tracking-[0.35em] text-zinc-900 md:text-4xl">
                  ROOMID : {roomId}
                </div>
              )}
              <button
                className="rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-xs font-semibold text-zinc-700"
                onClick={handleBackToLobby}
              >
                ロビーに戻る
              </button>
            </div>

            <div
              className="grid flex-1 gap-4"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {sortedParticipants.map((participant) => (
                <div
                  key={participant.id}
                  className={`flex h-full min-h-[140px] flex-col gap-3 rounded-2xl border p-4 shadow-sm transition ${
                    participant.isSelf
                      ? "border-zinc-200 bg-black/10 text-zinc-900"
                      : "border-zinc-200 bg-white/80 text-zinc-900"
                  }`}
                >
                  <div className="flex items-center justify-between text-[1em] tracking-[0.3em]">
                    <span className={participant.isSelf ? "text-red-500" : "text-zinc-500"}>
                      {participant.name}
                    </span>
                  </div>
                  <div className="flex h-full w-full items-center justify-center">
                    <p className="text-[2em] leading-relaxed text-center break-all">
                      {participant.text || ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm">
              <textarea
                className="h-28 resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 outline-none transition focus:border-zinc-400"
                placeholder="ここに入力すると、相手の画面にリアルタイムで反映されます。"
                value={selfText}
                onChange={(event) => handleSelfTextChange(event.target.value)}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}