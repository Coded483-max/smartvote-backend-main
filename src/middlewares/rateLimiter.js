const rateLimit = require("express-rate-limit");
const MongoStore = require("rate-limit-mongo");

const createRateLimiter = (options = {}) => {
  return rateLimit({
    store: new MongoStore({
      uri: process.env.MONGO_URI,
      collectionName: "rate_limits",
      expireTimeMs: options.windowMs || 900000, // 15 minutes
    }),
    windowMs: options.windowMs || 900000, // 15 minutes
    max: options.max || 100, // requests per window
    message: {
      error: "Too many requests from this IP",
      retryAfter: Math.ceil(options.windowMs / 1000) || 900,
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
  });
};

// Different limits for different endpoints
const authLimiter = createRateLimiter({ max: 5, windowMs: 900000 }); // 5 requests per 15 min
const voteLimiter = createRateLimiter({ max: 100, windowMs: 3600000 }); // 10 votes per hour
const generalLimiter = createRateLimiter({ max: 1000, windowMs: 900000 }); // 1000 requests per 15 min

module.exports = { authLimiter, voteLimiter, generalLimiter };
