// config/session.js
const session = require("express-session");
const MongoStore = require("connect-mongo");

// ✅ Validate environment variables
if (!process.env.SESSION_SECRET) {
  console.error("❌ SESSION_SECRET environment variable is required!");
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI environment variable is required!");
  process.exit(1);
}
const INACTIVITY_TIMEOUT = {
  voter: parseInt(process.env.VOTER_INACTIVITY_TIMEOUT) || 30, // 30 minutes
  candidate: parseInt(process.env.CANDIDATE_INACTIVITY_TIMEOUT) || 20, // 20 minutes
  admin: parseInt(process.env.ADMIN_INACTIVITY_TIMEOUT) || 15, // 15 minutes
  superAdmin: parseInt(process.env.SUPER_ADMIN_INACTIVITY_TIMEOUT) || 10, // 10 minutes
};

// ✅ Clean the session secret (remove any problematic characters)
const sessionSecret = process.env.SESSION_SECRET.trim().replace(/[\/\\]/g, "");

console.log("🔐 Session configuration:", {
  secretLength: sessionSecret.length,
  mongoUri: process.env.MONGO_URI ? "configured" : "missing",
  nodeEnv: process.env.NODE_ENV,
  inactivityTimeouts: INACTIVITY_TIMEOUT,
});

const sessionConfig = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "sessions",
    touchAfter: 60, // Update session every minute for activity tracking
    ttl: parseInt(process.env.SESSION_STORE_TTL) || 24 * 60 * 60, // 24 hours absolute maximum
  }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours maximum
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
  name: "smartvote.sid",
  rolling: false, // ✅ Disable rolling - we'll handle this manually
};

module.exports = { sessionConfig, INACTIVITY_TIMEOUT };
