const WebSocket = require("ws");

const port = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port });

wss.on("connection", (ws) => {
  console.log("client connected");

  ws.on("message", (message) => {
    const text = message.toString();

    console.log("received:", text);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });

  ws.on("close", () => {
    console.log("client disconnected");
  });
});

console.log(`WebSocket server running on ${port}`);