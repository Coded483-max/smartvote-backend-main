// middleware/monitoring.js
const prometheus = require("prom-client");

// Metrics
const httpRequestDuration = new prometheus.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
});

const zkProofGeneration = new prometheus.Histogram({
  name: "zk_proof_generation_duration_seconds",
  help: "Duration of ZK proof generation",
  labelNames: ["success"],
});

const voteCount = new prometheus.Counter({
  name: "votes_cast_total",
  help: "Total number of votes cast",
  labelNames: ["election_id"],
});

// Middleware
exports.metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });

  next();
};

exports.recordZKProof = (duration, success) => {
  zkProofGeneration.labels(success ? "true" : "false").observe(duration);
};

exports.recordVote = (electionId) => {
  voteCount.labels(electionId).inc();
};
