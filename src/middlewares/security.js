const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

// Production rate limiting
const productionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: "Too many requests, please try again later",
    retryAfter: 900,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const votingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: (req) => req.voter?.id || req.ip,
  message: "Voting rate limit exceeded",
});

// Security middleware
exports.securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  }),
  productionLimiter,
];

exports.votingLimiter = votingLimiter;
