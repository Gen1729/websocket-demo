const WebSocket = require("ws");
const http = require("http");

const port = process.env.PORT || 8080;

const server = http.createServer();

const wss = new WebSocket.Server({
  server,
});

const rooms = new Map(); // Map<roomId, Set<ws>>
const userByWs = new Map(); // Map<ws, { roomId, userId }>
const latestStateByUser = new Map(); // Map<roomId, Map<userId, { name, text, ts, joinedAt }>>

wss.on("connection", (ws) => {
  console.log("client connected");

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      console.error("JSONの解析に失敗しました:", err.message);
      return;
    }

    if (!msg || typeof msg.type !== "string") {
      console.error("invalid message");
      return;
    }

    switch (msg.type) {
      case "join": {
        const roomId = msg.roomId;
        const userId = msg.userId;
        const name = msg.name;

        if (!roomId || !userId || typeof name !== "string") return;
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }

        if (!latestStateByUser.has(roomId)) {
          latestStateByUser.set(roomId, new Map());
        }

        const roomClients = rooms.get(roomId);

        if (roomClients.size >= 9){
          ws.send(
            JSON.stringify({
              type: "deny",
              roomId,
              userId,
              name,
              ts: Date.now(),
            })
          );
          return;
        }

        const joinedAt = Date.now();
        latestStateByUser.get(roomId).set(userId, {
          name,
          text: "",
          ts: 0,
          joinedAt,
        });

        roomClients.add(ws);
        userByWs.set(ws, { roomId: roomId, userId: userId });

        if (latestStateByUser.has(roomId)) {
          latestStateByUser.get(roomId).forEach((state, existingUserId) => {
            ws.send(
              JSON.stringify({
                type: "state",
                roomId,
                userId: existingUserId,
                name: state.name,
                text: state.text,
                ts: state.ts,
                joinedAt: state.joinedAt,
              })
            );
          });
        }

        roomClients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "state",
                roomId,
                userId,
                name,
                text: "",
                ts: Date.now(),
                joinedAt
              })
            );
          }
        });
        break;
      }
      case "state": {
        const roomId = msg.roomId;
        const userId = msg.userId;
        const name = msg.name;
        const text = msg.text;
        const ts = msg.ts;
        const joinedAt = msg.joinedAt;

        if (!roomId || !userId || typeof name !== "string" || typeof text !== "string") {
          return;
        }
        if (!userByWs.has(ws)) {
          console.error("join required");
          return;
        }

        const { roomId: wsRoomId, userId: wsUserId } = userByWs.get(ws);
        if (roomId !== wsRoomId || userId !== wsUserId) {
          console.error("mismatch");
          return;
        }

        if (!latestStateByUser.has(roomId)) {
          latestStateByUser.set(roomId, new Map());
        }
        latestStateByUser.get(roomId).set(userId, {
          name,
          text: text,
          ts: ts,
          joinedAt: typeof joinedAt === "number" ? joinedAt : Date.now(),
        });

        const roomClients = rooms.get(roomId);
        if (!roomClients) return;

        roomClients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "state",
                roomId,
                userId,
                name,
                text,
                ts,
                joinedAt: typeof joinedAt === "number" ? joinedAt : Date.now(),
              })
            );
          }
        });
        break;
      }
      default:
        console.error("unknown type" + ", ws:" + ws);
        break;
    }
  });

  ws.on("close", () => {
    if (!userByWs.has(ws)) {
      return;
    }

    const { roomId: roomId, userId: userId } = userByWs.get(ws);
    const roomClients = rooms.get(roomId);

    userByWs.delete(ws);

    if (!roomClients) {
      return;
    }

    roomClients.delete(ws);

    if (latestStateByUser.has(roomId)) {
      latestStateByUser.get(roomId).delete(userId);
    }

    roomClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
          type: "leave",
          roomId,
          userId,
          ts: Date.now()
          })
        );
      }
    });

    if (roomClients.size === 0) {
      rooms.delete(roomId);
      latestStateByUser.delete(roomId);
    }

    console.log("client disconnected");
  });
});

server.listen(port, () => {
  console.log(`server running on ${port}`);
});