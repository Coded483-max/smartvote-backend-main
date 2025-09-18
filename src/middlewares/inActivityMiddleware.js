// middleware/inactivityMiddleware.js
const {
  isAuthenticated,
  isAdminAuthenticated,
  updateSessionActivity,
  updateAdminActivity,
  clearExpiredSession,
  isSessionExpiredFromInactivity,
} = require("../utils/sessionHelpers");

// Middleware to check and update activity
exports.trackActivity = (req, res, next) => {
  try {
    // Skip activity tracking for certain routes
    const skipRoutes = ["/api/session/status", "/api/health", "/favicon.ico"];
    if (skipRoutes.some((route) => req.path.includes(route))) {
      return next();
    }

    // Check if session exists and update activity
    if (isAuthenticated(req)) {
      updateSessionActivity(req);
    } else if (isAdminAuthenticated(req)) {
      updateAdminActivity(req);
    }

    next();
  } catch (error) {
    console.error("Activity tracking error:", error);
    next(); // Continue even if activity tracking fails
  }
};

// Middleware to handle inactivity expiry
exports.checkInactivity = (req, res, next) => {
  try {
    // Only check for protected routes
    if (!req.session?.user && !req.session?.admin) {
      return next();
    }

    // Check if session expired from inactivity
    const userExpired =
      req.session?.user && isSessionExpiredFromInactivity(req);
    const adminExpired =
      req.session?.admin &&
      req.session.admin.lastActivity &&
      Date.now() - new Date(req.session.admin.lastActivity).getTime() >
        15 * 60 * 1000; // 15 min for admin

    if (userExpired || adminExpired) {
      // Clear cookies and session
      clearExpiredSession(res);

      if (req.session) {
        req.session.destroy((err) => {
          if (err) console.error("Session destruction error:", err);
        });
      }

      // Return inactivity response
      return res.status(401).json({
        message: "Session expired due to inactivity",
        reason: "inactivity_timeout",
        requiresLogin: true,
      });
    }

    next();
  } catch (error) {
    console.error("Inactivity check error:", error);
    next();
  }
};
