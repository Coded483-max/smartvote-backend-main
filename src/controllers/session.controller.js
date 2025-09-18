// controllers/session.controller.js
const {
  // getCurrentUser,
  getCurrentAdmin,
  isAuthenticated,
  isAdminAuthenticated,
  updateSessionActivity,
  updateAdminActivity,
  isSessionExpiredFromInactivity,
  getTimeUntilInactivityExpiry,
  destroySession,
  clearExpiredSession,
} = require("../utils/sessionHelpers");

const getCurrentUser = (req) => {
  // Check for regular users (voters, candidates)
  if (req.session?.user) {
    return {
      type: "user",
      data: req.session.user,
    };
  }

  // Check for admins
  if (req.session?.admin) {
    return {
      type: "admin",
      data: req.session.admin,
    };
  }

  // ✅ Add super-admin check
  if (req.session?.superAdmin) {
    return {
      type: "super-admin",
      data: req.session.superAdmin,
    };
  }

  // ✅ Alternative: Check if admin has super-admin role
  if (req.session?.admin && req.session.admin.role === "super-admin") {
    return {
      type: "super-admin",
      data: req.session.admin,
    };
  }

  return null;
};
/**
 * Get current session status with detailed information
 */
exports.getSessionStatus = (req, res) => {
  try {
    const isUserAuth = isAuthenticated(req);
    const isAdminAuth = isAdminAuthenticated(req);

    const response = {
      isAuthenticated: isUserAuth || isAdminAuth,
      sessionId: req.sessionID,
      sessionExpiry: req.session?.cookie?.expires || null,
      inactivityExpiry: null,
      timeUntilInactivityExpiry: 0,
      expiringSoon: false,
      warning: null,
      user: null,
      admin: null,
      userType: null,
    };

    if (isUserAuth) {
      const user = getCurrentUser(req);
      response.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        userType: user.userType,
        studentId: user.studentId,
        isVerified: user.isVerified,
        department: user.department,
        college: user.college,
        loginTime: user.loginTime,
        lastActivity: user.lastActivity,
      };
      response.userType = user.userType;

      // Calculate inactivity expiry
      const timeoutMinutes = user.inactivityTimeoutMinutes || 30;
      const lastActivity = new Date(user.lastActivity);
      response.inactivityExpiry = new Date(
        lastActivity.getTime() + timeoutMinutes * 60 * 1000
      );
      response.timeUntilInactivityExpiry = getTimeUntilInactivityExpiry(req);

      // Update activity for this status check
      updateSessionActivity(req);
    }

    if (isAdminAuth) {
      const admin = getCurrentAdmin(req);
      response.admin = {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        permissions: admin.permissions,
        loginTime: admin.loginTime,
        lastActivity: admin.lastActivity,
      };
      response.userType = "admin";

      // Calculate admin inactivity expiry
      const timeoutMinutes = admin.inactivityTimeoutMinutes || 15;
      const lastActivity = new Date(admin.lastActivity);
      response.inactivityExpiry = new Date(
        lastActivity.getTime() + timeoutMinutes * 60 * 1000
      );
      response.timeUntilInactivityExpiry = Math.max(
        0,
        response.inactivityExpiry.getTime() - Date.now()
      );

      updateAdminActivity(req);
    }

    // Add warning if session is expiring soon
    const timeUntilExpiry = response.timeUntilInactivityExpiry;
    const warningThreshold = 5 * 60 * 1000; // 5 minutes

    if (timeUntilExpiry > 0 && timeUntilExpiry < warningThreshold) {
      const minutesLeft = Math.floor(timeUntilExpiry / 60000);
      response.expiringSoon = true;
      response.warning = {
        type: "inactivity_warning",
        message: `Your session will expire in ${minutesLeft} minutes due to inactivity`,
        timeLeft: timeUntilExpiry,
        action: "extend_session",
      };
    }

    res.json({
      success: true,
      ...response,
    });
  } catch (error) {
    console.error("Session status error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking session status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Refresh/extend session by updating activity
 */
exports.refreshSession = (req, res) => {
  try {
    const isUserAuth = isAuthenticated(req);
    const isAdminAuth = isAdminAuthenticated(req);

    if (isUserAuth || isAdminAuth) {
      // Touch the session to extend it
      req.session.touch();

      if (isUserAuth) {
        updateSessionActivity(req);
        const user = getCurrentUser(req);
        const timeoutMinutes = user.inactivityTimeoutMinutes || 30;
        const newExpiryTime = new Date(Date.now() + timeoutMinutes * 60 * 1000);

        res.json({
          success: true,
          message: "Session refreshed successfully",
          newInactivityExpiry: newExpiryTime,
          sessionExpiry: req.session.cookie.expires,
          sessionId: req.sessionID,
          userType: user.userType,
        });
      } else {
        updateAdminActivity(req);
        const admin = getCurrentAdmin(req);
        const timeoutMinutes = admin.inactivityTimeoutMinutes || 15;
        const newExpiryTime = new Date(Date.now() + timeoutMinutes * 60 * 1000);

        res.json({
          success: true,
          message: "Admin session refreshed successfully",
          newInactivityExpiry: newExpiryTime,
          sessionExpiry: req.session.cookie.expires,
          sessionId: req.sessionID,
          userType: "admin",
        });
      }
    } else {
      res.status(401).json({
        success: false,
        message: "No active session to refresh",
        requiresLogin: true,
      });
    }
  } catch (error) {
    console.error("Session refresh error:", error);
    res.status(500).json({
      success: false,
      message: "Error refreshing session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Extend session - alias for refreshSession with user activity update
 */
exports.extendSession = (req, res) => {
  try {
    const isUserAuth = isAuthenticated(req);
    const isAdminAuth = isAdminAuthenticated(req);

    if (isUserAuth || isAdminAuth) {
      // Extend session by updating activity
      if (isUserAuth) {
        updateSessionActivity(req);
        const user = getCurrentUser(req);
        console.log(`🔄 Session extended for user: ${user.email}`);
      } else {
        updateAdminActivity(req);
        const admin = getCurrentAdmin(req);
        console.log(`🔄 Session extended for admin: ${admin.email}`);
      }

      req.session.touch(); // Update session store

      res.json({
        success: true,
        message: "Session extended successfully",
        extendedAt: new Date(),
        sessionId: req.sessionID,
      });
    } else {
      res.status(401).json({
        success: false,
        message: "No active session to extend",
        requiresLogin: true,
      });
    }
  } catch (error) {
    console.error("Session extension error:", error);
    res.status(500).json({
      success: false,
      message: "Error extending session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Check if user can access a specific resource
 */
exports.checkAccess = (req, res) => {
  try {
    const { resource, action } = req.query;
    // const user = getCurrentUser(req) || getCurrentAdmin(req);

    if (!user) {
      return res.status(401).json({
        hasAccess: false,
        message: "Not authenticated",
        requiresLogin: true,
      });
    }

    // Basic access control logic
    let hasAccess = true;
    let accessLevel = "user";

    // Determine access level
    if (user.role === "super-admin") {
      accessLevel = "super-admin";
    } else if (user.role === "admin") {
      accessLevel = "admin";
    } else if (user.userType === "candidate" || user.role === "candidate") {
      accessLevel = "candidate";
    } else {
      accessLevel = "voter";
    }

    // Access control rules
    if (resource === "admin" && !["admin", "super-admin"].includes(user.role)) {
      hasAccess = false;
    }

    if (resource === "super-admin" && user.role !== "super-admin") {
      hasAccess = false;
    }

    if (
      resource === "election-management" &&
      !["admin", "super-admin"].includes(user.role)
    ) {
      hasAccess = false;
    }

    if (
      resource === "candidate" &&
      user.userType !== "candidate" &&
      user.role !== "candidate"
    ) {
      hasAccess = false;
    }

    res.json({
      hasAccess,
      accessLevel,
      user: {
        id: user.id,
        role: user.role,
        userType: user.userType || "voter",
        email: user.email,
      },
      resource,
      action,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Access check error:", error);
    res.status(500).json({
      hasAccess: false,
      message: "Error checking access",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get session activity history (for debugging/monitoring)
 */
exports.getSessionActivity = (req, res) => {
  try {
    const isUserAuth = isAuthenticated(req);
    const isAdminAuth = isAdminAuthenticated(req);

    if (!isUserAuth && !isAdminAuth) {
      return res.status(401).json({
        success: false,
        message: "No active session",
        requiresLogin: true,
      });
    }

    const sessionData = req.session;
    const user = getCurrentUser(req) || getCurrentAdmin(req);

    const activity = {
      sessionId: req.sessionID,
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType || "admin",
      },
      times: {
        loginTime: user.loginTime,
        lastActivity: user.lastActivity,
        sessionCreated: sessionData.createdAt,
        sessionExpiry: sessionData.cookie?.expires,
      },
      inactivity: {
        timeoutMinutes: user.inactivityTimeoutMinutes,
        timeUntilExpiry: isUserAuth ? getTimeUntilInactivityExpiry(req) : null,
        isExpired: isSessionExpiredFromInactivity(req),
      },
      metadata: {
        userAgent: req.get("User-Agent"),
        ip: req.ip || req.connection.remoteAddress,
        cookies: Object.keys(req.cookies || {}),
        sessionStore: sessionData.store ? "connected" : "disconnected",
      },
    };

    res.json({
      success: true,
      activity,
    });
  } catch (error) {
    console.error("Session activity error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving session activity",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Manually destroy session (logout)
 */
exports.destroySession = async (req, res) => {
  try {
    const user = getCurrentUser(req) || getCurrentAdmin(req);
    const userEmail = user?.email || "unknown";

    await destroySession(req);
    clearExpiredSession(res);

    res.json({
      success: true,
      message: "Session destroyed successfully",
      user: userEmail,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Session destruction error:", error);
    res.status(500).json({
      success: false,
      message: "Error destroying session",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get all active sessions for current user (for multi-device management)
 */
exports.getActiveSessions = async (req, res) => {
  try {
    const user = getCurrentUser(req) || getCurrentAdmin(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No active session",
        requiresLogin: true,
      });
    }

    // This would require additional session tracking in MongoDB
    // For now, return current session info
    const sessions = [
      {
        sessionId: req.sessionID,
        current: true,
        userAgent: req.get("User-Agent"),
        ip: req.ip || req.connection.remoteAddress,
        loginTime: user.loginTime,
        lastActivity: user.lastActivity,
        expiresAt: req.session.cookie?.expires,
      },
    ];

    res.json({
      success: true,
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    console.error("Active sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving active sessions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
