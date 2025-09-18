// utils/sessionHelpers.js
const { INACTIVITY_TIMEOUT } = require("../config/session");

/**
 * Enhanced session utilities with inactivity tracking
 */
// Create super-admin session
exports.createSuperAdminSession = (req, superAdmin) => {
  const now = new Date();

  req.session.superAdmin = {
    id: superAdmin._id.toString(),
    email: superAdmin.email,
    firstName: superAdmin.firstName,
    lastName: superAdmin.lastName,
    role: "super-admin",
    permissions: superAdmin.permissions || ["all"],
    loginTime: now,
    lastActivity: now,
    inactivityTimeoutMinutes:
      INACTIVITY_TIMEOUT["super-admin"] || INACTIVITY_TIMEOUT.admin,
  };

  req.session.isSuperAdminAuthenticated = true;

  req.session.save((err) => {
    if (err) console.error("Super-admin session save error:", err);
  });

  console.log(
    `✅ Super-admin session created: ${superAdmin.email} (timeout: ${
      INACTIVITY_TIMEOUT["super-admin"] || INACTIVITY_TIMEOUT.admin
    }m)`
  );
  return req.session.superAdmin;
};

// Enhanced super-admin authentication check
exports.isSuperAdminAuthenticated = (req) => {
  // Check dedicated super-admin session
  if (req.session?.isSuperAdminAuthenticated && req.session?.superAdmin) {
    // Check super-admin inactivity
    if (req.session.superAdmin?.lastActivity) {
      const now = new Date();
      const lastActivity = new Date(req.session.superAdmin.lastActivity);
      const timeoutMs =
        (INACTIVITY_TIMEOUT["super-admin"] || INACTIVITY_TIMEOUT.admin) *
        60 *
        1000;
      const inactiveTime = now.getTime() - lastActivity.getTime();

      if (inactiveTime > timeoutMs) {
        console.log(
          `⏰ Super-admin session expired for ${req.session.superAdmin.email}`
        );
        exports.destroySession(req);
        return false;
      }
    }
    return true;
  }

  // Alternative: Check if admin has super-admin role
  if (
    req.session?.isAdminAuthenticated &&
    req.session?.admin?.role === "super-admin"
  ) {
    return exports.isAdminAuthenticated(req);
  }

  return false;
};

// Update super-admin activity
exports.updateSuperAdminActivity = (req) => {
  if (req.session?.superAdmin) {
    req.session.superAdmin.lastActivity = new Date();
    req.session.touch();
  } else if (req.session?.admin?.role === "super-admin") {
    exports.updateAdminActivity(req);
  }
};

// Create user session with activity tracking
exports.createUserSession = (req, user, userType = "voter") => {
  const now = new Date();

  req.session.user = {
    id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role || userType,
    userType: userType,
    studentId: user.studentId,
    isVerified: user.isVerified,
    department: user.department,
    college: user.college,
    loginTime: now,
    lastActivity: now,
    inactivityTimeoutMinutes:
      INACTIVITY_TIMEOUT[userType] || INACTIVITY_TIMEOUT.voter,
  };

  req.session.isAuthenticated = true;
  req.session.createdAt = now;

  // Save session immediately
  req.session.save((err) => {
    if (err) console.error("Session save error:", err);
  });

  console.log(
    `✅ Session created for ${userType}: ${user.email} (timeout: ${req.session.user.inactivityTimeoutMinutes}m)`
  );
  return req.session.user;
};

// Update session activity
exports.updateSessionActivity = (req) => {
  if (req.session?.user) {
    req.session.user.lastActivity = new Date();
    req.session.touch(); // Update session store

    // Optional: Log activity for debugging
    console.log(`🔄 Activity updated for ${req.session.user.email}`);
  }
};

// Check if session has expired due to inactivity
exports.isSessionExpiredFromInactivity = (req) => {
  if (!req.session?.user?.lastActivity) return true;

  const now = new Date();
  const lastActivity = new Date(req.session.user.lastActivity);
  const timeoutMinutes =
    req.session.user.inactivityTimeoutMinutes || INACTIVITY_TIMEOUT.voter;
  const timeoutMs = timeoutMinutes * 60 * 1000;

  const inactiveTime = now.getTime() - lastActivity.getTime();
  const isExpired = inactiveTime > timeoutMs;

  if (isExpired) {
    console.log(
      `⏰ Session expired for ${
        req.session.user.email
      } - inactive for ${Math.floor(inactiveTime / 60000)} minutes`
    );
  }

  return isExpired;
};

// Get time until session expires from inactivity
exports.getTimeUntilInactivityExpiry = (req) => {
  if (!req.session?.user?.lastActivity) return 0;

  const now = new Date();
  const lastActivity = new Date(req.session.user.lastActivity);
  const timeoutMinutes =
    req.session.user.inactivityTimeoutMinutes || INACTIVITY_TIMEOUT.voter;
  const timeoutMs = timeoutMinutes * 60 * 1000;

  const inactiveTime = now.getTime() - lastActivity.getTime();
  const timeRemaining = timeoutMs - inactiveTime;

  return Math.max(0, timeRemaining);
};

// Enhanced authentication check with inactivity
exports.isAuthenticated = (req) => {
  if (!req.session || !req.session.isAuthenticated || !req.session.user) {
    return false;
  }

  // Check for inactivity expiry
  if (exports.isSessionExpiredFromInactivity(req)) {
    exports.destroySession(req);
    return false;
  }

  return true;
};

// Enhanced admin authentication check
exports.isAdminAuthenticated = (req) => {
  if (!req.session || !req.session.isAdminAuthenticated || !req.session.admin) {
    return false;
  }

  // Check admin inactivity (use admin timeout)
  if (req.session.admin?.lastActivity) {
    const now = new Date();
    const lastActivity = new Date(req.session.admin.lastActivity);
    const timeoutMs = INACTIVITY_TIMEOUT.admin * 60 * 1000;
    const inactiveTime = now.getTime() - lastActivity.getTime();

    if (inactiveTime > timeoutMs) {
      console.log(`⏰ Admin session expired for ${req.session.admin.email}`);
      exports.destroySession(req);
      return false;
    }
  }

  return true;
};

// Clear expired sessions and tokens
exports.clearExpiredSession = (res) => {
  // Clear all authentication cookies
  const cookiesToClear = [
    "voterToken",
    "candidateToken",
    "adminToken",
    "smartvote.sid",
  ];

  cookiesToClear.forEach((cookieName) => {
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });
  });

  console.log("🧹 Cleared all authentication cookies due to inactivity");
};

// Destroy session
exports.destroySession = (req) => {
  return new Promise((resolve, reject) => {
    const userEmail =
      req.session?.user?.email || req.session?.admin?.email || "unknown";

    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction failed:", err);
        reject(err);
      } else {
        console.log(`✅ Session destroyed for ${userEmail}`);
        resolve(true);
      }
    });
  });
};

// Get session status with inactivity info
exports.getSessionStatus = (req) => {
  const isUserAuth = exports.isAuthenticated(req);
  const isAdminAuth = exports.isAdminAuthenticated(req);
  const isSuperAdminAuth = exports.isSuperAdminAuthenticated(req);

  const status = {
    isAuthenticated: isUserAuth || isAdminAuth || isSuperAdminAuth,
    sessionId: req.sessionID,
    sessionExpiry: req.session?.cookie?.expires || null,
    inactivityExpiry: null,
    timeUntilInactivityExpiry: 0,
    user: null,
    admin: null,
    superAdmin: null,
  };

  if (isUserAuth && req.session.user) {
    status.user = req.session.user;
    status.timeUntilInactivityExpiry =
      exports.getTimeUntilInactivityExpiry(req);

    const timeoutMinutes = req.session.user.inactivityTimeoutMinutes;
    const lastActivity = new Date(req.session.user.lastActivity);
    status.inactivityExpiry = new Date(
      lastActivity.getTime() + timeoutMinutes * 60 * 1000
    );
  }

  if (isAdminAuth && req.session.admin) {
    status.admin = req.session.admin;
    if (req.session.admin.lastActivity) {
      const lastActivity = new Date(req.session.admin.lastActivity);
      const timeout =
        req.session.admin.role === "super-admin"
          ? INACTIVITY_TIMEOUT["super-admin"]
          : INACTIVITY_TIMEOUT.admin;
      status.inactivityExpiry = new Date(
        lastActivity.getTime() + timeout * 60 * 1000
      );
      status.timeUntilInactivityExpiry = Math.max(
        0,
        status.inactivityExpiry.getTime() - Date.now()
      );
    }
  }

  // ✅ Add super-admin status
  if (isSuperAdminAuth && req.session.superAdmin) {
    status.superAdmin = req.session.superAdmin;
    if (req.session.superAdmin.lastActivity) {
      const lastActivity = new Date(req.session.superAdmin.lastActivity);
      const timeout =
        INACTIVITY_TIMEOUT["super-admin"] || INACTIVITY_TIMEOUT.admin;
      status.inactivityExpiry = new Date(
        lastActivity.getTime() + timeout * 60 * 1000
      );
      status.timeUntilInactivityExpiry = Math.max(
        0,
        status.inactivityExpiry.getTime() - Date.now()
      );
    }
  }

  return status;
};

// Create admin session with activity tracking
exports.createAdminSession = (req, admin) => {
  const now = new Date();

  req.session.admin = {
    id: admin._id.toString(),
    email: admin.email,
    firstName: admin.firstName,
    lastName: admin.lastName,
    role: admin.role,
    permissions: admin.permissions || [],
    loginTime: now,
    lastActivity: now,
    inactivityTimeoutMinutes: INACTIVITY_TIMEOUT.admin,
  };

  req.session.isAdminAuthenticated = true;

  req.session.save((err) => {
    if (err) console.error("Admin session save error:", err);
  });

  console.log(
    `✅ Admin session created: ${admin.email} (timeout: ${INACTIVITY_TIMEOUT.admin}m)`
  );
  return req.session.admin;
};

// Update admin activity
exports.updateAdminActivity = (req) => {
  if (req.session?.admin) {
    req.session.admin.lastActivity = new Date();
    req.session.touch();
  }
};

module.exports = exports;
