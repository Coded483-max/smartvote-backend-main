const BlockedIP = require("../models/blockedIp.model");

async function blocklistMiddleware(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;

  const isBlocked = await BlockedIP.findOne({ ipAddress: clientIP, active: true });
  if (isBlocked) {
    return res.status(403).json({
      message: "Access denied: your IP has been blocked",
    });
  }

  next();
}

module.exports = blocklistMiddleware;
