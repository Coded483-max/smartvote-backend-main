const socketIO = require("socket.io");
const redis = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

let io;

const initializeSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
    // Performance optimizations
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true,
  });

  // Redis adapter for horizontal scaling
  if (process.env.REDIS_HOST) {
    const pubClient = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    });

    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

  // Connection handling
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join election-specific rooms
    socket.on("joinElection", (electionId) => {
      socket.join(`election-${electionId}`);
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

// Optimized event emission
const emitToElection = (electionId, event, data) => {
  if (io) {
    io.to(`election-${electionId}`).emit(event, data);
  }
};

module.exports = { initializeSocket, getIO, emitToElection };
