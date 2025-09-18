// middlewares/auth.middleware.js
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const Candidate = require("../models/candidate.model");
const Voter = require("../models/voter.model");

// ✅ Import session utilities
const {
  isAuthenticated,
  isAdminAuthenticated,
  updateSessionActivity,
  updateAdminActivity,
  clearExpiredSession,
  isSessionExpiredFromInactivity,
} = require("../utils/sessionHelpers");

/* ───────────────────────── Enhanced Helper for Different User Types ───────────────────────── */
const getToken = (req, userType = "any") => {
  let token = null;
  let tokenSource = null;

  // ✅ **Check specific cookie based on user type**
  switch (userType) {
    case "voter":
      // Check voter-specific sources
      if (req.cookies?.voterToken) {
        token = req.cookies.voterToken;
        tokenSource = "voterToken-cookie";
      } else if (req.cookies?.jwt) {
        // Fallback for existing voters
        token = req.cookies.jwt;
        tokenSource = "jwt-cookie";
      }
      break;

    case "admin":
      // Check admin-specific sources
      if (req.cookies?.adminToken) {
        token = req.cookies.adminToken;
        tokenSource = "adminToken-cookie";
      }
      break;

    case "super-admin":
      // Check super-admin specific sources
      if (req.cookies?.superAdminToken) {
        token = req.cookies.superAdminToken;
        tokenSource = "superAdminToken-cookie";
      }
      break;

    default:
      // Check all possible sources for backward compatibility
      if (req.cookies?.voterToken) {
        token = req.cookies.voterToken;
        tokenSource = "voterToken-cookie";
      } else if (req.cookies?.adminToken) {
        token = req.cookies.adminToken;
        tokenSource = "adminToken-cookie";
      } else if (req.cookies?.superAdminToken) {
        token = req.cookies.superAdminToken;
        tokenSource = "superAdminToken-cookie";
      } else if (req.cookies?.jwt) {
        token = req.cookies.jwt;
        tokenSource = "jwt-cookie";
      } else if (req.cookies?.token) {
        token = req.cookies.token;
        tokenSource = "token-cookie";
      }
  }

  // ✅ **Fallback to Authorization header for API clients**
  if (
    !token &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
    tokenSource = "authorization-header";
  }

  // ✅ **Debug logging (reduce verbosity in production)**
  if (process.env.NODE_ENV === "development") {
    console.log(`🔍 Token search for ${userType}:`, {
      voterToken: req.cookies?.voterToken ? "present" : "missing",
      adminToken: req.cookies?.adminToken ? "present" : "missing",
      superAdminToken: req.cookies?.superAdminToken ? "present" : "missing",
      jwtCookie: req.cookies?.jwt ? "present" : "missing",
      tokenCookie: req.cookies?.token ? "present" : "missing",
      authHeader: req.headers.authorization ? "present" : "missing",
      allCookies: Object.keys(req.cookies || {}),
      tokenFound: !!token,
      tokenSource,
    });
  }

  return token;
};

/* ───────────────────────── Enhanced Voter Authentication with Session Support ───────────────────────── */
exports.verifyVoter = async (req, res, next) => {
  try {
    // ✅ **PRIORITY 1: Check session-based authentication first**
    if (isAuthenticated(req)) {
      const sessionUser = req.session.user;

      // Verify user still exists and is active
      const voter = await Voter.findById(sessionUser.id);
      if (!voter || !voter.isVerified) {
        clearExpiredSession(res);
        req.session.destroy();
        return res.status(401).json({
          message: "Session invalid - user not found or inactive",
          requiresLogin: true,
        });
      }

      req.voter = voter;
      updateSessionActivity(req); // ✅ Update activity timestamp
      console.log(`✅ Session auth successful: ${voter.email}`);
      return next();
    }

    // ✅ **PRIORITY 2: Fallback to JWT token authentication**
    const token = getToken(req, "voter");

    if (process.env.NODE_ENV === "development") {
      console.log("🔍 Voter token check:", {
        voterToken: req.cookies?.voterToken ? "Found" : "Not found",
        fallbackJwt: req.cookies?.jwt ? "Found" : "Not found",
        authHeader: req.headers.authorization ? "Found" : "Not found",
        finalToken: token ? "Found" : "Not found",
      });
    }

    if (!token) {
      return res.status(401).json({
        message: "Access denied. No voter token provided.",
        expectedCookie: "voterToken",
        receivedCookies: Object.keys(req.cookies || {}),
        requiresLogin: true,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const voterId = decoded.id || decoded.userId;

    if (!voterId) {
      return res.status(401).json({
        message: "Invalid token structure.",
        requiresLogin: true,
      });
    }

    // ✅ Check if it's a voter token (if role is present)
    if (decoded.role && decoded.role !== "voter") {
      return res.status(403).json({
        message: "Access denied. Voter access required.",
        requiresLogin: true,
      });
    }

    const voter = await Voter.findById(voterId);
    if (!voter) {
      return res.status(401).json({
        message: "Invalid token. Voter not found.",
        requiresLogin: true,
      });
    }

    if (!voter.isVerified) {
      return res.status(401).json({
        message: "Please verify your account first.",
        requiresLogin: true,
      });
    }

    console.log("✅ JWT Voter verified:", voter.email);
    req.voter = voter;
    next();
  } catch (error) {
    console.error("❌ Voter verification error:", error.message);
    clearExpiredSession(res);
    res.status(401).json({
      message: "Invalid token.",
      requiresLogin: true,
    });
  }
};

/* ───────────────────────── Enhanced Admin Authentication with Session Support ───────────────────────── */
exports.verifyAdmin = async (req, res, next) => {
  try {
    // ✅ **PRIORITY 1: Check session-based authentication first**
    if (isAdminAuthenticated(req)) {
      const sessionAdmin = req.session.admin;

      // Verify admin still exists and is active
      const admin = await Admin.findById(sessionAdmin.id);
      if (!admin || (admin.isActive !== undefined && !admin.isActive)) {
        clearExpiredSession(res);
        req.session.destroy();
        return res.status(401).json({
          message: "Admin session invalid",
          requiresLogin: true,
        });
      }

      req.admin = admin;
      updateAdminActivity(req); // ✅ Update admin activity
      console.log(`✅ Admin session auth successful: ${admin.email}`);
      return next();
    }

    // ✅ **PRIORITY 2: Fallback to JWT token authentication**
    let token = getToken(req, "admin");

    // ✅ If no admin token, check for super-admin token
    if (!token) {
      token = getToken(req, "super-admin");
    }

    if (process.env.NODE_ENV === "development") {
      console.log("🔍 Admin verification:", {
        adminToken: req.cookies?.adminToken ? "Found" : "Not found",
        superAdminToken: req.cookies?.superAdminToken ? "Found" : "Not found",
        authHeader: req.headers.authorization ? "Found" : "Not found",
        finalToken: token ? "Found" : "Not found",
      });
    }

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access",
        expectedCookies: ["adminToken", "superAdminToken"],
        receivedCookies: Object.keys(req.cookies || {}),
        requiresLogin: true,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (!admin || !["admin", "super-admin"].includes(admin.role)) {
      return res.status(403).json({
        message: "Access denied. Admins only.",
        requiresLogin: true,
      });
    }

    // ✅ Handle missing isActive field gracefully
    const isActive = admin.isActive !== undefined ? admin.isActive : true;
    if (!isActive) {
      return res.status(403).json({
        message: "Admin account is inactive.",
        requiresLogin: true,
      });
    }

    console.log("✅ JWT Admin verified:", {
      id: admin._id,
      email: admin.email,
      role: admin.role,
      isActive: isActive,
    });

    req.admin = admin;
    next();
  } catch (err) {
    console.error("❌ Admin verification error:", err);
    clearExpiredSession(res);
    return res.status(401).json({
      message: "Invalid or expired token",
      requiresLogin: true,
    });
  }
};

/* ───────────────────────── Enhanced Super-admin with Session Support ───────────────────────── */
exports.verifySuperAdmin = async (req, res, next) => {
  try {
    // ✅ **PRIORITY 1: Check session-based authentication first**
    if (isAdminAuthenticated(req) && req.session.admin.role === "super-admin") {
      const sessionAdmin = req.session.admin;

      // Verify super-admin still exists and is active
      const admin = await Admin.findById(sessionAdmin.id);
      if (
        !admin ||
        admin.role !== "super-admin" ||
        (admin.isActive !== undefined && !admin.isActive)
      ) {
        clearExpiredSession(res);
        req.session.destroy();
        return res.status(401).json({
          message: "Super-admin session invalid",
          requiresLogin: true,
        });
      }

      req.admin = admin;
      updateAdminActivity(req);
      console.log(`✅ Super-admin session auth successful: ${admin.email}`);
      return next();
    }

    // ✅ **PRIORITY 2: Fallback to JWT token authentication**
    const token = getToken(req, "super-admin");

    if (process.env.NODE_ENV === "development") {
      console.log("🔍 Super Admin token check:", {
        superAdminToken: req.cookies?.superAdminToken ? "Found" : "Not found",
        authHeader: req.headers.authorization ? "Found" : "Not found",
        finalToken: token ? "Found" : "Not found",
      });
    }

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access",
        expectedCookie: "superAdminToken",
        receivedCookies: Object.keys(req.cookies || {}),
        requiresLogin: true,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (!admin || admin.role !== "super-admin") {
      return res.status(403).json({
        message: "Access denied. Super Admin only.",
        requiresLogin: true,
      });
    }

    // ✅ Handle missing isActive field gracefully
    const isActive = admin.isActive !== undefined ? admin.isActive : true;
    if (!isActive) {
      return res.status(403).json({
        message: "Super Admin account is inactive.",
        requiresLogin: true,
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    console.error("Super admin verification error:", err.message);
    clearExpiredSession(res);
    return res.status(401).json({
      message: "Invalid or expired token",
      requiresLogin: true,
    });
  }
};

/* ───────────────────────── Enhanced Candidate Authentication with Session Support ───────────────────────── */
exports.verifyCandidate = async (req, res, next) => {
  try {
    // ✅ **PRIORITY 1: Check session-based authentication first**
    if (isAuthenticated(req)) {
      const sessionUser = req.session.user;

      if (
        sessionUser.userType === "candidate" ||
        sessionUser.role === "candidate"
      ) {
        const candidate = await Candidate.findOne({
          email: sessionUser.email,
          approvalStatus: "approved",
        });

        if (!candidate) {
          return res.status(403).json({
            message: "Candidate profile not found or not approved",
            requiresLogin: true,
          });
        }

        req.candidate = candidate;
        req.voter = await Voter.findById(sessionUser.id); // For compatibility
        updateSessionActivity(req);
        console.log(`✅ Candidate session auth successful: ${candidate.email}`);
        return next();
      }
    }

    // ✅ **PRIORITY 2: Fallback to JWT token authentication**
    const token =
      req.cookies?.candidateToken ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    if (!token) {
      return res.status(401).json({
        message: "Candidate token required.",
        requiresLogin: true,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "candidate") {
      return res.status(403).json({
        message: "Candidate access only.",
        requiresLogin: true,
      });
    }

    const candidate = await Candidate.findById(decoded.id);
    if (!candidate || candidate.approvalStatus !== "approved") {
      return res.status(403).json({
        message: "Candidate not approved.",
        requiresLogin: true,
      });
    }

    req.candidate = candidate;
    next();
  } catch (err) {
    console.error("Candidate verification error:", err.message);
    clearExpiredSession(res);
    return res.status(401).json({
      message: "Invalid or expired candidate token.",
      requiresLogin: true,
    });
  }
};

/* ───────────────────────── Enhanced Voter or Candidate with Session Support ───────────────────────── */
exports.verifyVoterOrCandidate = async (req, res, next) => {
  try {
    // ✅ **PRIORITY 1: Check session-based authentication first**
    if (isAuthenticated(req)) {
      const sessionUser = req.session.user;

      // Find voter by session ID
      const voter = await Voter.findById(sessionUser.id);
      if (!voter || !voter.isVerified) {
        clearExpiredSession(res);
        req.session.destroy();
        return res.status(401).json({
          message: "Session invalid - voter not found",
          requiresLogin: true,
        });
      }

      req.voter = voter;
      updateSessionActivity(req);
      console.log(`✅ Voter/Candidate session auth successful: ${voter.email}`);
      return next();
    }

    // ✅ **PRIORITY 2: Fallback to JWT token authentication**
    const voterToken = req.cookies.voterToken;
    const candidateToken = req.cookies.candidateToken;

    if (voterToken) {
      const decoded = jwt.verify(voterToken, process.env.JWT_SECRET);
      const voter = await Voter.findById(decoded.id);
      if (!voter) {
        return res.status(401).json({
          message: "Voter not found",
          requiresLogin: true,
        });
      }
      req.voter = voter;
      return next();
    }

    if (candidateToken) {
      const decoded = jwt.verify(candidateToken, process.env.JWT_SECRET);
      const candidate = await Candidate.findById(decoded.id);
      if (!candidate) {
        return res.status(401).json({
          message: "Candidate not found",
          requiresLogin: true,
        });
      }
      req.voter = candidate; // For compatibility with controller
      return next();
    }

    return res.status(401).json({
      message: "Not authenticated",
      requiresLogin: true,
    });
  } catch (error) {
    console.error("Voter/Candidate verification error:", error.message);
    clearExpiredSession(res);
    return res.status(401).json({
      message: "Invalid token",
      requiresLogin: true,
    });
  }
};

/* ───────────────────────── Enhanced Generic RBAC helpers with Session Support ───────────────────────── */
exports.allowOnlyAdminOrSuperAdmin = async (req, res, next) => {
  try {
    // ✅ **PRIORITY 1: Check session-based authentication first**
    if (isAdminAuthenticated(req)) {
      const sessionAdmin = req.session.admin;

      if (["admin", "super-admin"].includes(sessionAdmin.role)) {
        const admin = await Admin.findById(sessionAdmin.id);
        if (!admin || (admin.isActive !== undefined && !admin.isActive)) {
          clearExpiredSession(res);
          req.session.destroy();
          return res.status(401).json({
            message: "Admin session invalid",
            requiresLogin: true,
          });
        }

        req.admin = admin;
        updateAdminActivity(req);
        return next();
      }
    }

    // ✅ **PRIORITY 2: Fallback to JWT token authentication**
    let token = getToken(req, "admin");

    if (!token) {
      token = getToken(req, "super-admin");
    }

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access",
        requiresLogin: true,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (admin && ["admin", "super-admin"].includes(admin.role)) {
      const isActive = admin.isActive !== undefined ? admin.isActive : true;
      if (!isActive) {
        return res.status(403).json({
          message: "Admin account is inactive.",
          requiresLogin: true,
        });
      }

      req.admin = admin;
      return next();
    }

    return res.status(403).json({
      message: "Access denied. Only Admins or Super Admins allowed.",
      requiresLogin: true,
    });
  } catch (err) {
    clearExpiredSession(res);
    return res.status(401).json({
      message: "Invalid or expired token",
      requiresLogin: true,
    });
  }
};

exports.verifyRuleManager = async (req, res, next) => {
  try {
    // ✅ **Use the same logic as allowOnlyAdminOrSuperAdmin but with different error message**
    return exports.allowOnlyAdminOrSuperAdmin(req, res, (error) => {
      if (error) return next(error);

      // If we reach here, admin is verified
      next();
    });
  } catch (err) {
    clearExpiredSession(res);
    return res.status(401).json({
      message: "Access denied for election configuration.",
      requiresLogin: true,
    });
  }
};
module.exports = exports;
