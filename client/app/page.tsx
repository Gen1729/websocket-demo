"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const socketRef = useRef<WebSocket | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket(
      process.env.NEXT_PUBLIC_WS_URL!
    );

    ws.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
    };

    socketRef.current = ws;

    return () => ws.close();
  }, []);

  const sendMessage = () => {
    if (!socketRef.current || message === "") return;

    socketRef.current.send(message);
    setMessage("");
  };

  return (
    <main className="p-10">
      <h1 className="text-3xl mb-4">
        Realtime Chat
      </h1>

      <div className="border p-4 h-80 overflow-auto mb-4">
        {messages.map((m, i) => (
          <div key={i}>{m}</div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="border p-2 flex-1"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button
          className="border px-4"
          onClick={sendMessage}
        >
          Send
        </button>
      </div>
    </main>
  );
}