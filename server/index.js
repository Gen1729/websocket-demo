const WebSocket = require("ws");
const http = require("http");

const port = process.env.PORT || 8080;

const server = http.createServer();

const wss = new WebSocket.Server({
  server,
});

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

server.listen(port, () => {
  console.log(`server running on ${port}`);
});