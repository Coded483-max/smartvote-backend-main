require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/db.config");
const { startListeners } = require("./src/services/eventListener");
const { initializeSocket } = require("./src/services/socket");

const http = require("http").createServer(app);
const PORT = process.env.PORT || 5001;

console.log(PORT);
console.log("Cloudinary name:", process.env.CLOUDINARY_CLOUD_NAME);
console.log(
  "Cloudinary API Key:",
  process.env.CLOUDINARY_API_KEY ? "Set" : "Not Set"
);
console.log(
  "Cloudinary API Secret:",
  process.env.CLOUDINARY_API_SECRET ? "Set" : "Not Set"
);

/* ───────────────────────── Start-up sequence ───────────────────────── */
connectDB().then(() => {
  /* WebSocket */
  const io = initializeSocket(http);

  io.on("connection", (socket) => {
    console.log("WS client connected:", socket.id);
  });

  /* Blockchain listener (after DB ready) */
  if (process.env.NODE_ENV !== "test") {
    startListeners(io);
  }

  /* Launch HTTP */
  http.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
