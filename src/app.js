const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const inputSanitizer = require("./middlewares/inputSanitizer"); // ✅ Safe custom version
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const sessionsRoute = require("./routes/session.routes");
const zkpRoutes = require("./routes/zkp-vote.routes"); // ZKP vote routes
const {
  trackActivity,
  checkInactivity,
} = require("./middlewares/inActivityMiddleware");
const { metricsMiddleware } = require("./middlewares/monitoring.middleware");

// Routes
const routes = require("./routes/index.routes");
const adminDashboardRoutes = require("./routes/admin.dashboard.routes");
const superAdminDashboardRoutes = require("./routes/superadmin.dashboard.routes");
const electionDashboardRoutes = require("./routes/election.dashboard.routes");
const candidateDashboardRoutes = require("./routes/candidate.dashboard.routes");
const candidateRoutes = require("./routes/candidate.routes");
const voterDashboardRoutes = require("./routes/voter.dashboard.routes");
const voterRoutes = require("./routes/voter.routes");
const fileRoutes = require("./routes/file.routes");
const securityLogsRoutes = require("./routes/securityLogs.routes");
const blockedListMiddleware = require("./middlewares/blocklist.middleware");

require("./services/scheduler"); // Start the scheduler

const positionRoutes = require("./routes/position.routes");

const notificationRoutes = require("./routes/notification.routes");

const errorMiddleware = require("./middlewares/error.middleware");
const swaggerSpec = require("./config/swagger.config");
const { authLimiter } = require("./middlewares/rateLimiter");
const { securityMiddleware } = require("./middlewares/security");

const RedisStore = require("connect-redis").RedisStore;
const { createClient } = require("redis");

const app = express();

console.log("server starting...");
console.log("Cloudinary name:", process.env.CLOUDINARY_CLOUD_NAME);
console.log(
  "Cloudinary API Key:",
  process.env.CLOUDINARY_API_KEY ? "Set" : "Not Set"
);
console.log(
  "Cloudinary API Secret:",
  process.env.CLOUDINARY_API_SECRET ? "Set" : "Not Set"
);

// ✅ Global Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "blob:",
          "https:",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        connectSrc: [
          "'self'",
          "https://smart-vote.vercel.app",
          "https://smartvote-backend-ld18.onrender.com",
        ],
      },
    },
  })
);
app.use(
  cors({
    // origin: process.env.FRONTEND_URL,
    origin: "http://localhost:5173",

    credentials: true, // Allow credentials
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(blockedListMiddleware);
app.use(securityMiddleware);
app.use(metricsMiddleware);
// ✅ **Serve Static Files - CRITICAL FOR FILE ACCESS**
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Alternative: More specific static file serving
// app.use(
//   "/uploads/photos",
//   express.static(path.join(__dirname, "uploads/photos"))
// );
// app.use(
//   "/uploads/manifesto",
//   express.static(path.join(__dirname, "uploads/manifesto"))
// );
// app.use(
//   "/uploads/transcript",
//   express.static(path.join(__dirname, "uploads/transcript"))
// );

// Enable CORS
app.use(morgan("dev")); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(inputSanitizer); // ✅ Custom input sanitization
app.use(cookieParser()); // Parse cookies
// app.use(authLimiter); // ✅ Global rate limiter

const redisClient = createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});
redisClient.connect().catch(console.error);

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret:
      process.env.SESSION_SECRET ||
      "your-super-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
    name: "smartvote.sid", // Custom session name
  })
);

// ✅ CRITICAL: Trust proxy to get real IP addresses
app.set("trust proxy", false);

// ✅ Swagger Docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(trackActivity); // Track user activity on every request
app.use(checkInactivity); // Check for inactivity timeouts

// ✅ Main API Routes
app.use("/api/session", sessionsRoute);
app.use("/api", routes);
app.use("/api/voters", require("./routes/voter.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use("/api/candidates", candidateRoutes);
app.use("/api/elections", require("./routes/election.routes"));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use("/api/votes", require("./routes/vote.routes"));
app.use("/api/positions", positionRoutes); // ✅ Position management routes
app.use("/api/data", require("./routes/data.routes")); // ✅ Public data routes
app.use("/api/notifications", notificationRoutes); // ✅ Notifications
// ✅ ZKP Vote Routes
app.use("/api/votes/zkp", zkpRoutes);

// ✅ Dashboards
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/superadmin", superAdminDashboardRoutes);
app.use("/api/dashboard/elections", electionDashboardRoutes);
app.use("/api/candidate-dashboard", candidateDashboardRoutes);
app.use("/api/voter", voterDashboardRoutes);
app.use("/api/voters", voterRoutes);

app.use("/api/security-logs", securityLogsRoutes);

// ✅ Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "SmartVote API is running!",
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// ✅ Global Error Handler
app.use(errorMiddleware);

module.exports = app;
