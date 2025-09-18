const Admin = require("../models/admin.model");
const Candidate = require("../models/candidate.model");
const Election = require("../models/election.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const SecurityLogger = require("../services/securityLogger");

// ✅ Import generateToken utility (same as voter)
const { generateToken, setTokenCookie } = require("../utils/generateToken");
const { createSuperAdminSession } = require("../utils/sessionHelpers");

// ✅ Sanitize helpers
const {
  sanitizeString,
  sanitizeEmail,
  // sanitizeObjectId,
} = require("../utils/sanitizeInput");

// **Admin Login** (Fixed const assignment error)
exports.loginAdmin = async (req, res) => {
  try {
    // ✅ Use let instead of const for reassignment
    let { email, password } = req.body;

    // ✅ Log login attempt
    await SecurityLogger.log({
      event: "Admin Login",
      user: email || "Unknown",
      userId: null,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Admin login attempt initiated",
      severity: "High",
      category: "Authentication",
      metadata: {
        endpoint: "/api/admin/login",
        hasEmail: !!email,
        hasPassword: !!password,
        attemptTime: new Date().toISOString(),
      },
    });

    // ✅ Input validation
    if (!email || !password) {
      // ✅ Log missing credentials
      await SecurityLogger.log({
        event: "Admin Login",
        user: email || "Unknown",
        userId: null,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin login failed - missing credentials",
        severity: "Medium",
        category: "Authentication",
        metadata: {
          endpoint: "/api/admin/login",
          error: "missing_credentials",
          missingFields: {
            email: !email,
            password: !password,
          },
        },
      });

      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // ✅ Sanitize inputs
    email = sanitizeEmail(email);
    password = sanitizeString(password);

    const admin = await Admin.findOne({ email, role: "admin" });
    if (!admin) {
      // ✅ Log admin not found
      await SecurityLogger.log({
        event: "Admin Login",
        user: email,
        userId: null,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin login failed - invalid credentials",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/login",
          email: email,
          error: "invalid_credentials",
          attemptType: "admin_not_found",
          securityNote: "Potential unauthorized access attempt",
        },
      });

      return res.status(400).json({ message: "Invalid admin credentials" });
    }

    // ✅ Check if account is active
    const isActive = admin.isActive !== undefined ? admin.isActive : true;
    if (!isActive) {
      // ✅ Log inactive account access attempt
      await SecurityLogger.log({
        event: "Admin Login",
        user: email,
        userId: admin._id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin login failed - account inactive",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/login",
          adminId: admin._id,
          adminName: `${admin.firstName} ${admin.lastName}`,
          accountStatus: "inactive",
          error: "account_inactive",
          securityNote: "Inactive admin account access attempt",
        },
      });

      return res.status(403).json({ message: "Admin account is inactive" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      // ✅ Log invalid password
      await SecurityLogger.log({
        event: "Admin Login",
        user: email,
        userId: admin._id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin login failed - incorrect credentials",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/login",
          adminId: admin._id,
          adminName: `${admin.firstName} ${admin.lastName}`,
          error: "incorrect_credentials",
          securityNote: "Potential brute force or credential stuffing attempt",
        },
      });

      return res.status(400).json({ message: "Invalid email or password" });
    }

    // ✅ **Generate token with role**
    const token = generateToken(admin._id, admin.role);

    // ✅ **Set role-specific cookie**
    const cookieName =
      admin.role === "super-admin" ? "superAdminToken" : "adminToken";

    setTokenCookie(res, token, cookieName, {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    console.log("✅ Admin login successful:", {
      adminId: admin._id,
      email: admin.email,
      role: admin.role,
      cookieName,
      tokenGenerated: !!token,
    });

    // ✅ Update last login
    admin.lastLoginAt = new Date();
    await admin.save();

    // ✅ Log successful login
    await SecurityLogger.log({
      event: "Admin Login",
      user: email,
      userId: admin._id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Admin login successful",
      severity: "Medium",
      category: "Authentication",
      metadata: {
        endpoint: "/api/admin/login",
        adminId: admin._id,
        adminName: `${admin.firstName} ${admin.lastName}`,
        role: admin.role,
        lastLoginAt: admin.lastLoginAt,
        sessionDuration: "24 hours",
        cookieSet: cookieName,
      },
    });

    res.json({
      message: "Login successful",
      role: admin.role,
      admin: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Admin Login",
      user: req.body?.email || "Unknown",
      userId: null,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Admin login failed with system error",
      severity: "Critical",
      category: "System",
      metadata: {
        endpoint: "/api/admin/login",
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Super Admin Login** (Separate endpoint for enhanced security)
exports.loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ Log super admin login attempt
    await SecurityLogger.log({
      event: "Super Admin Login",
      user: email || "Unknown",
      userId: null,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Super Admin login attempt initiated",
      severity: "Critical",
      category: "Authentication",
      metadata: {
        endpoint: "/api/admin/super-login",
        hasEmail: !!email,
        hasPassword: !!password,
        attemptTime: new Date().toISOString(),
        securityNote: "Highest privilege level access attempt",
      },
    });

    // ✅ Input validation
    if (!email || !password) {
      // ✅ Log missing super admin credentials
      await SecurityLogger.log({
        event: "Super Admin Login",
        user: email || "Unknown",
        userId: null,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Super Admin login failed - missing credentials",
        severity: "High",
        category: "Authentication",
        metadata: {
          endpoint: "/api/admin/super-login",
          error: "missing_credentials",
          missingFields: {
            email: !email,
            password: !password,
          },
        },
      });

      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // ✅ Sanitize inputs
    const sanitizedEmail = sanitizeEmail(email);
    const sanitizedPassword = sanitizeString(password);

    // ✅ **Find admin and verify role - FIX: Check if admin exists first**
    const admin = await Admin.findOne({
      email: sanitizedEmail,
      role: "super-admin",
    });

    console.log(
      `🔍 Super Admin login attempt: ${sanitizedEmail} at ${new Date().toISOString()}`
    );

    // ✅ **FIX: Check if admin exists BEFORE accessing properties**
    if (!admin) {
      console.log(`❌ Super admin not found or wrong role: ${sanitizedEmail}`);

      // ✅ Log super admin not found
      await SecurityLogger.log({
        event: "Super Admin Login",
        user: sanitizedEmail,
        userId: null,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Super Admin login failed - invalid credentials",
        severity: "Critical",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/super-login",
          email: sanitizedEmail,
          error: "super_admin_not_found",
          attemptType: "unauthorized_super_admin_access",
          securityNote: "Critical: Unauthorized super admin access attempt",
          alertLevel: "IMMEDIATE_ATTENTION_REQUIRED",
        },
      });

      return res.status(400).json({
        message: "Invalid super admin credentials",
      });
    }

    // ✅ Check if account is active
    const isActive = admin.isActive !== undefined ? admin.isActive : true;
    if (!isActive) {
      console.log(`❌ Super admin account inactive: ${sanitizedEmail}`);

      // ✅ Log inactive super admin account
      await SecurityLogger.log({
        event: "Super Admin Login",
        user: sanitizedEmail,
        userId: admin._id,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Super Admin login failed - account inactive",
        severity: "Critical",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/super-login",
          superAdminId: admin._id,
          superAdminName: `${admin.firstName} ${admin.lastName}`,
          accountStatus: "inactive",
          error: "super_admin_account_inactive",
          securityNote: "Inactive super admin account access attempt",
          alertLevel: "HIGH_PRIORITY",
        },
      });

      return res.status(403).json({
        message: "Super admin account is inactive",
      });
    }

    // ✅ Verify password - NOW we know admin exists
    const isMatch = await bcrypt.compare(sanitizedPassword, admin.password);

    console.log(`🔑 Password verification for ${sanitizedEmail}:`, isMatch);

    if (!isMatch) {
      console.log(`❌ Invalid password for super admin: ${sanitizedEmail}`);

      // ✅ Log invalid super admin password
      await SecurityLogger.log({
        event: "Super Admin Login",
        user: sanitizedEmail,
        userId: admin._id,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Super Admin login failed - incorrect credentials",
        severity: "Critical",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/super-login",
          superAdminId: admin._id,
          superAdminName: `${admin.firstName} ${admin.lastName}`,
          error: "incorrect_super_admin_credentials",
          securityNote: "Critical: Super admin credential compromise attempt",
          alertLevel: "IMMEDIATE_INVESTIGATION_REQUIRED",
        },
      });

      return res.status(400).json({
        message: "Invalid super admin credentials",
      });
    }

    // ✅ **Generate token with role**
    const token = generateToken(admin._id, "super-admin");

    // ✅ **Set super-admin-specific cookie**
    setTokenCookie(res, token, "superAdminToken", {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // ✅ Log successful super admin access
    console.log(
      `✅ Super Admin login successful: ${
        admin.email
      } at ${new Date().toISOString()}`
    );

    // ✅ Update last login
    admin.lastLoginAt = new Date();
    admin.lastSuperAdminLogin = new Date(); // Track super admin specific logins
    await admin.save();

    // Create super-admin session
    const sessionData = createSuperAdminSession(req, admin);

    // ✅ Log successful super admin login
    await SecurityLogger.log({
      event: "Super Admin Login",
      user: sanitizedEmail,
      userId: admin._id,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Super Admin login successful",
      severity: "Critical",
      category: "Authentication",
      metadata: {
        endpoint: "/api/admin/super-login",
        superAdminId: admin._id,
        superAdminName: `${admin.firstName} ${admin.lastName}`,
        role: admin.role,
        lastLoginAt: admin.lastLoginAt,
        lastSuperAdminLogin: admin.lastSuperAdminLogin,
        sessionDuration: "24 hours",
        sessionData: sessionData,
        alertLevel: "SYSTEM_ADMIN_ACCESS",
        securityNote: "Highest privilege access granted",
      },
    });

    res.json({
      message: "Super Admin login successful",
      role: admin.role,
      superAdmin: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        sessionExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastActivity: new Date().toISOString(), // Set initial activity time
        ...sessionData, // Include session data
      },
    });
  } catch (error) {
    console.error("Super Admin login error:", error);

    // ✅ Log critical super admin error
    await SecurityLogger.log({
      event: "Super Admin Login",
      user: req.body?.email || "Unknown",
      userId: null,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Super Admin login failed with system error",
      severity: "Critical",
      category: "System",
      metadata: {
        endpoint: "/api/admin/super-login",
        error: error.message,
        stack: error.stack,
        alertLevel: "SYSTEM_CRITICAL_ERROR",
        securityNote: "System error during super admin authentication",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Super Admin Logout** (Clear super admin session)
exports.logoutSuperAdmin = async (req, res) => {
  try {
    const admin = req.admin;

    // ✅ Log super admin logout
    await SecurityLogger.log({
      event: "Super Admin Logout",
      user: admin?.email || "Unknown",
      userId: admin?.id,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Super Admin logout successful",
      severity: "High",
      category: "Authentication",
      metadata: {
        endpoint: "/api/admin/super-logout",
        superAdminId: admin?.id,
        superAdminName: admin
          ? `${admin.firstName} ${admin.lastName}`
          : "Unknown",
        logoutTime: new Date().toISOString(),
        sessionEnded: true,
      },
    });

    // Clear super admin cookie
    res.clearCookie("superAdminToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    // ✅ Log logout
    console.log(
      `Super Admin logout: ${req.admin?.email} at ${new Date().toISOString()}`
    );

    res.json({ message: "Super Admin logged out successfully" });
  } catch (error) {
    console.error("Super Admin logout error:", error);

    // ✅ Log logout error
    await SecurityLogger.log({
      event: "Super Admin Logout",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Super Admin logout failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/admin/super-logout",
        error: error.message,
        superAdminId: req.admin?.id,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Super Admin Logout** (Clear  admin session)
exports.logoutAdmin = async (req, res) => {
  try {
    const admin = req.admin;

    // ✅ Log super admin logout
    await SecurityLogger.log({
      event: "Admin Logout",
      user: admin?.email || "Unknown",
      userId: admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Admin logout successful",
      severity: "High",
      category: "Authentication",
      metadata: {
        endpoint: "/api/admin/logout",
        adminId: admin?.id,
        adminName: admin ? `${admin.firstName} ${admin.lastName}` : "Unknown",
        logoutTime: new Date().toISOString(),
        sessionEnded: true,
      },
    });

    // Clear admin cookie
    res.clearCookie("adminToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    // ✅ Log logout
    console.log(
      ` Admin logout: ${req.admin?.email} at ${new Date().toISOString()}`
    );

    res.json({ message: " Admin logged out successfully" });
  } catch (error) {
    console.error(" Admin logout error:", error);

    // ✅ Log logout error
    await SecurityLogger.log({
      event: " Admin Logout",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: " Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: " Admin logout failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/admin/logout",
        error: error.message,
        adminId: req.admin?.id,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// **Super Admin Creates a New Admin** (Fixed const assignment)
exports.createAdmin = async (req, res) => {
  try {
    // ✅ Use let instead of const
    let { firstName, lastName, email, password, confirmPassword, role } =
      req.body;
    const adminId = req.admin.id;
    const requestingAdmin = req.admin;

    // ✅ Log admin creation attempt
    await SecurityLogger.log({
      event: "Admin Management",
      user: requestingAdmin.email,
      userId: requestingAdmin.id,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "New admin creation initiated",
      severity: "Critical",
      category: "Admin",
      metadata: {
        endpoint: "/api/admin/create",
        requestingAdminId: adminId,
        targetEmail: email,
        targetRole: role || "admin",
        hasRequiredFields: !!(firstName && lastName && email && password),
      },
    });

    // ✅ Input validation
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      // ✅ Log missing fields
      await SecurityLogger.log({
        event: "Admin Management",
        user: requestingAdmin.email,
        userId: requestingAdmin.id,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin creation failed - missing required fields",
        severity: "Medium",
        category: "Admin",
        metadata: {
          endpoint: "/api/admin/create",
          missingFields: {
            firstName: !firstName,
            lastName: !lastName,
            email: !email,
            password: !password,
            confirmPassword: !confirmPassword,
          },
          error: "validation_failed",
        },
      });

      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ Sanitize inputs
    firstName = sanitizeString(firstName);
    lastName = sanitizeString(lastName);
    email = sanitizeEmail(email);
    password = sanitizeString(password);
    confirmPassword = sanitizeString(confirmPassword);
    role = sanitizeString(role) || "admin";

    // Verify the requester is Super Admin
    const requestingAdminData = await Admin.findById(adminId);
    if (!requestingAdminData || requestingAdminData.role !== "super-admin") {
      // ✅ Log unauthorized admin creation attempt
      await SecurityLogger.log({
        event: "Admin Management",
        user: requestingAdmin.email,
        userId: requestingAdmin.id,
        userType: requestingAdmin.role || "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin creation failed - insufficient privileges",
        severity: "Critical",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/create",
          requestingAdminId: adminId,
          requestingAdminRole: requestingAdminData?.role || "unknown",
          targetEmail: email,
          error: "insufficient_privileges",
          securityNote: "Non-super-admin attempted to create admin account",
        },
      });

      return res
        .status(403)
        .json({ message: "Access denied. Only Super Admin can add admins." });
    }

    if (password !== confirmPassword) {
      // ✅ Log password mismatch
      await SecurityLogger.log({
        event: "Admin Management",
        user: requestingAdmin.email,
        userId: requestingAdmin.id,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin creation failed - password mismatch",
        severity: "Medium",
        category: "Admin",
        metadata: {
          endpoint: "/api/admin/create",
          targetEmail: email,
          error: "password_mismatch",
        },
      });

      return res.status(400).json({ message: "Passwords do not match" });
    }

    // ✅ Enhanced password validation
    if (password.length < 8) {
      // ✅ Log weak password
      await SecurityLogger.log({
        event: "Admin Management",
        user: requestingAdmin.email,
        userId: requestingAdmin.id,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin creation failed - weak password",
        severity: "Medium",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/create",
          targetEmail: email,
          passwordLength: password.length,
          error: "weak_password",
        },
      });

      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    if (role === "super-admin") {
      // ✅ Log super admin creation attempt
      await SecurityLogger.log({
        event: "Admin Management",
        user: requestingAdmin.email,
        userId: requestingAdmin.id,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin creation failed - attempted super admin creation",
        severity: "Critical",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/create",
          targetEmail: email,
          attemptedRole: "super-admin",
          error: "super_admin_creation_blocked",
          securityNote: "Attempt to create second super admin account",
        },
      });

      return res
        .status(403)
        .json({ message: "Only one Super Admin is allowed." });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      // ✅ Log duplicate admin attempt
      await SecurityLogger.log({
        event: "Admin Management",
        user: requestingAdmin.email,
        userId: requestingAdmin.id,
        userType: "Super Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin creation failed - email already exists",
        severity: "Medium",
        category: "Admin",
        metadata: {
          endpoint: "/api/admin/create",
          targetEmail: email,
          existingAdminId: existingAdmin._id,
          existingAdminRole: existingAdmin.role,
          error: "duplicate_email",
        },
      });

      return res
        .status(400)
        .json({ message: "Admin with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: role === "super-admin" ? "admin" : role, // Force to admin if super-admin attempted
      createdBy: adminId,
      createdAt: new Date(),
    });

    await newAdmin.save();

    // ✅ Log successful admin creation
    await SecurityLogger.log({
      event: "Admin Management",
      user: requestingAdmin.email,
      userId: requestingAdmin.id,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "New admin created successfully",
      severity: "Critical",
      category: "Admin",
      metadata: {
        endpoint: "/api/admin/create",
        newAdminId: newAdmin._id,
        newAdminName: `${newAdmin.firstName} ${newAdmin.lastName}`,
        newAdminEmail: newAdmin.email,
        newAdminRole: newAdmin.role,
        createdBy: requestingAdmin.email,
        createdAt: newAdmin.createdAt,
      },
    });

    res.status(201).json({
      message: "New admin created successfully!",
      admin: {
        id: newAdmin._id,
        firstName: newAdmin.firstName,
        lastName: newAdmin.lastName,
        email: newAdmin.email,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error("Error creating admin:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Admin Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Admin creation failed with system error",
      severity: "Critical",
      category: "System",
      metadata: {
        endpoint: "/api/admin/create",
        error: error.message,
        stack: error.stack,
        targetEmail: req.body?.email,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};
// **Admin Approves a Candidate** (Enhanced)
exports.approveCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { approvalNote } = req.body;
    const admin = req.admin;

    // ✅ Log candidate approval attempt
    await SecurityLogger.log({
      event: "Candidate Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Candidate approval process initiated by admin",
      severity: "High",
      category: "Candidate",
      metadata: {
        endpoint: "/api/admin/candidates/:id/approve",
        candidateId: candidateId,
        adminId: admin.id,
        hasApprovalNote: !!approvalNote?.trim(),
      },
    });

    // Ensure admin is authenticated
    if (!req.admin) {
      // ✅ Log unauthorized access
      await SecurityLogger.log({
        event: "Candidate Management",
        user: "Unknown",
        userId: null,
        userType: "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate approval failed - no admin authentication",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/candidates/:id/approve",
          candidateId: candidateId,
          error: "unauthenticated_access",
        },
      });

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // ✅ Sanitize candidateId
    const sanitizedCandidateId = sanitizeString(candidateId);

    // Find candidate by ID
    const candidate = await Candidate.findById(sanitizedCandidateId);
    if (!candidate) {
      // ✅ Log candidate not found
      await SecurityLogger.log({
        event: "Candidate Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate approval failed - candidate not found",
        severity: "Medium",
        category: "Candidate",
        metadata: {
          endpoint: "/api/admin/candidates/:id/approve",
          candidateId: candidateId,
          error: "candidate_not_found",
        },
      });

      return res.status(404).json({ message: "Candidate not found" });
    }

    if (candidate.isApproved) {
      // ✅ Log already approved
      await SecurityLogger.log({
        event: "Candidate Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate approval failed - already approved",
        severity: "Low",
        category: "Candidate",
        metadata: {
          endpoint: "/api/admin/candidates/:id/approve",
          candidateId: candidateId,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          currentStatus: "already_approved",
          error: "duplicate_approval",
        },
      });

      return res.status(400).json({ message: "Candidate already approved" });
    }

    const election = await Election.findById(candidate.electionId);
    if (election) {
      election.syncCandidatesToTopLevel();
      await election.save();
    }

    await Election.updateOne(
      { _id: candidate.electionId },
      { $addToSet: { allowedVoters: candidate._id } }
    );

    // ✅ Update approval status with admin info
    candidate.approvalStatus = "approved";
    candidate.approvedBy = req.admin.id;
    candidate.approvedAt = new Date();
    candidate.approvalNote = approvalNote || "";

    await candidate.save();

    // ✅ Log successful approval
    await SecurityLogger.log({
      event: "Candidate Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Candidate approved successfully by admin",
      severity: "High",
      category: "Candidate",
      metadata: {
        endpoint: "/api/admin/candidates/:id/approve",
        candidateId: candidateId,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        candidateStudentId: candidate.studentId,
        electionId: candidate.electionId,
        approvedBy: admin.email,
        approvedAt: candidate.approvedAt,
        approvalNote: approvalNote || "No note provided",
      },
    });

    res.status(200).json({
      message: "Candidate approved successfully",
      candidate: {
        id: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        isApproved: candidate.approvalStatus,
        approvedAt: candidate.approvedAt,
      },
    });
  } catch (error) {
    console.error("Error approving candidate:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Candidate Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Candidate approval failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/admin/candidates/:id/approve",
        candidateId: req.params?.candidateId,
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Get All Admins** (Super Admin only)
exports.getAllAdmins = async (req, res) => {
  try {
    const requestingAdmin = req.admin;

    // ✅ Log admin list access attempt
    await SecurityLogger.log({
      event: "Data Access",
      user: requestingAdmin.email,
      userId: requestingAdmin.id,
      userType: requestingAdmin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Admin list access attempted",
      severity: "High",
      category: "Admin",
      metadata: {
        endpoint: "/api/admin/all",
        requestingAdminRole: requestingAdmin.role,
        accessType: "admin_list",
      },
    });

    if (req.admin.role !== "super-admin") {
      // ✅ Log unauthorized access
      await SecurityLogger.log({
        event: "Data Access",
        user: requestingAdmin.email,
        userId: requestingAdmin.id,
        userType: requestingAdmin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin list access denied - insufficient privileges",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/all",
          requestingAdminRole: requestingAdmin.role,
          requiredRole: "super-admin",
          error: "insufficient_privileges",
          securityNote: "Non-super-admin attempted to access admin list",
        },
      });

      return res
        .status(403)
        .json({ message: "Access denied. Super Admin only." });
    }

    const admins = await Admin.find({}, "-password -__v").sort({
      createdAt: -1,
    });

    // ✅ Log successful admin list access
    await SecurityLogger.log({
      event: "Data Access",
      user: requestingAdmin.email,
      userId: requestingAdmin.id,
      userType: "Super Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Admin list accessed successfully",
      severity: "High",
      category: "Admin",
      metadata: {
        endpoint: "/api/admin/all",
        adminCount: admins.length,
        accessedBy: requestingAdmin.email,
        adminEmails: admins.map((admin) => admin.email),
        accessType: "sensitive_admin_data",
      },
    });

    res.json({
      admins: admins.map((admin) => ({
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        lastLoginAt: admin.lastLoginAt,
        createdAt: admin.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching admins:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Admin list access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/admin/all",
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Get All Candidates for a Specific Election** (Admin/Super Admin only)
exports.getCandidatesByElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    const {
      status,
      positionId,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    const admin = req.admin;

    // ✅ Log election candidates access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: admin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Election candidates access attempted",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections/:id/candidates",
        electionId: electionId,
        filters: {
          status: status || "all",
          positionId: positionId || "all",
          page: page,
          limit: limit,
        },
        accessType: "election_candidates_data",
      },
    });

    // ✅ Ensure admin is authenticated
    if (!req.admin) {
      // ✅ Log unauthorized access
      await SecurityLogger.log({
        event: "Data Access",
        user: "Unknown",
        userId: null,
        userType: "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election candidates access denied - no authentication",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/elections/:id/candidates",
          electionId: electionId,
          error: "unauthenticated_access",
        },
      });

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // ✅ Validate electionId
    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      // ✅ Log invalid election ID
      await SecurityLogger.log({
        event: "Data Access",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election candidates access failed - invalid election ID",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/candidates",
          electionId: electionId,
          error: "invalid_election_id",
        },
      });

      return res.status(400).json({
        message: "Invalid election ID format",
        received: electionId,
      });
    }

    // ✅ Build filter query
    const filter = { electionId: new mongoose.Types.ObjectId(electionId) };

    // Optional filters
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.approvalStatus = status;
    }

    if (positionId && mongoose.Types.ObjectId.isValid(positionId)) {
      filter.positionId = new mongoose.Types.ObjectId(positionId);
    }

    // ✅ Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    // ✅ Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ✅ Get candidates with election and position details
    const candidates = await Candidate.find(filter)
      .populate("electionId", "title level startDate endDate status")
      .populate("approvedBy", "firstName lastName email")
      .populate("rejectedBy", "firstName lastName email")
      .select("-password -verificationCode -resetPasswordToken")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // ✅ Get total count for pagination
    const totalCandidates = await Candidate.countDocuments(filter);

    // ✅ Get election details including positions
    const election = await Election.findById(electionId).select(
      "title positions level"
    );
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Data Access",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election candidates access failed - election not found",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/candidates",
          electionId: electionId,
          error: "election_not_found",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    // ✅ Create position lookup map
    const positionMap = {};
    election.positions.forEach((position) => {
      positionMap[position._id.toString()] = {
        id: position._id,
        name: position.name,
        description: position.description,
        maxCandidates: position.maxCandidates,
      };
    });

    // ✅ Format candidates with position details
    const formattedCandidates = candidates.map((candidate) => {
      const position = positionMap[candidate.positionId?.toString()] || null;

      return {
        id: candidate._id,
        personalInfo: {
          name: `${candidate.firstName} ${candidate.lastName}`,
          studentId: candidate.studentId,
          email: candidate.email,
          mobileNumber: candidate.mobileNumber,
        },
        academicInfo: {
          college: candidate.college,
          department: candidate.department,
          yearOfStudy: candidate.yearOfStudy,
          gpa: candidate.gpa,
        },
        position: position,
        campaign: {
          manifesto: candidate.manifesto,
          campaignSlogan: candidate.campaignSlogan,
          photoUrl: candidate.photoUrl,
          manifestoUrl: candidate.manifestoUrl,
        },
        approval: {
          status: candidate.approvalStatus,
          statusMessage: candidate.approvalStatusMessage,
          approvedBy: candidate.approvedBy
            ? {
                name: `${candidate.approvedBy.firstName} ${candidate.approvedBy.lastName}`,
                email: candidate.approvedBy.email,
              }
            : null,
          approvedAt: candidate.approvedAt,
          approvalNote: candidate.approvalNote,
          rejectedBy: candidate.rejectedBy
            ? {
                name: `${candidate.rejectedBy.firstName} ${candidate.rejectedBy.lastName}`,
                email: candidate.rejectedBy.email,
              }
            : null,
          rejectedAt: candidate.rejectedAt,
          rejectionReason: candidate.rejectionReason,
        },
        documents: {
          photo: !!candidate.photoUrl,
          transcript: !!candidate.transcriptUrl,
          manifesto: !!candidate.manifestoUrl,
          transcriptUrl: candidate.transcriptUrl,
        },
        applicationStage: candidate.applicationStage,
        applicationSubmittedAt: candidate.applicationSubmittedAt,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      };
    });

    // ✅ Get statistics
    const stats = await Candidate.aggregate([
      { $match: { electionId: new mongoose.Types.ObjectId(electionId) } },
      {
        $group: {
          _id: "$approvalStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusStats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      total: totalCandidates,
    };

    stats.forEach((stat) => {
      statusStats[stat._id] = stat.count;
    });

    // ✅ Get candidates per position
    const positionStats = await Candidate.aggregate([
      { $match: { electionId: new mongoose.Types.ObjectId(electionId) } },
      {
        $group: {
          _id: "$positionId",
          total: { $sum: 1 },
          approved: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "approved"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$approvalStatus", "rejected"] }, 1, 0] },
          },
        },
      },
    ]);

    const positionCandidateStats = positionStats.map((stat) => {
      const position = positionMap[stat._id?.toString()];
      return {
        position: position || { name: "Unknown Position", id: stat._id },
        candidates: {
          total: stat.total,
          approved: stat.approved,
          pending: stat.pending,
          rejected: stat.rejected,
        },
      };
    });

    // ✅ Log successful data access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: admin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election candidates data accessed successfully",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections/:id/candidates",
        electionId: electionId,
        electionTitle: election.title,
        candidatesReturned: formattedCandidates.length,
        totalCandidates: totalCandidates,
        statusStats: statusStats,
        filters: {
          status: status || "all",
          positionId: positionId || "all",
          page: page,
          limit: limit,
        },
        accessType: "sensitive_candidate_data",
      },
    });

    res.json({
      message: "Candidates retrieved successfully",
      election: {
        id: election._id,
        title: election.title,
        level: election.level,
      },
      candidates: formattedCandidates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCandidates,
        totalPages: Math.ceil(totalCandidates / parseInt(limit)),
        hasNext: skip + parseInt(limit) < totalCandidates,
        hasPrev: parseInt(page) > 1,
      },
      statistics: {
        overall: statusStats,
        byPosition: positionCandidateStats,
      },
      filters: {
        status: status || "all",
        positionId: positionId || "all",
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Error fetching candidates by election:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Election candidates access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/admin/elections/:id/candidates",
        electionId: req.params?.electionId,
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ **Get Candidates by Position** (More specific filtering)
exports.getCandidatesByPosition = async (req, res) => {
  try {
    const { electionId, positionId } = req.params;
    const { status, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    const admin = req.admin;

    // ✅ Log position candidates access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: admin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Position candidates access attempted",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint:
          "/api/admin/elections/:electionId/positions/:positionId/candidates",
        electionId: electionId,
        positionId: positionId,
        statusFilter: status || "all",
        accessType: "position_candidates_data",
      },
    });

    // ✅ Ensure admin is authenticated
    if (!req.admin) {
      // ✅ Log unauthorized access
      await SecurityLogger.log({
        event: "Data Access",
        user: "Unknown",
        userId: null,
        userType: "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Position candidates access denied - no authentication",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint:
            "/api/admin/elections/:electionId/positions/:positionId/candidates",
          electionId: electionId,
          positionId: positionId,
          error: "unauthenticated_access",
        },
      });

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // ✅ Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(electionId) ||
      !mongoose.Types.ObjectId.isValid(positionId)
    ) {
      // ✅ Log invalid IDs
      await SecurityLogger.log({
        event: "Data Access",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Position candidates access failed - invalid IDs",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint:
            "/api/admin/elections/:electionId/positions/:positionId/candidates",
          electionId: electionId,
          positionId: positionId,
          error: "invalid_ids",
          electionIdValid: mongoose.Types.ObjectId.isValid(electionId),
          positionIdValid: mongoose.Types.ObjectId.isValid(positionId),
        },
      });

      return res
        .status(400)
        .json({ message: "Invalid election or position ID" });
    }

    // ✅ Build filter
    const filter = {
      electionId: new mongoose.Types.ObjectId(electionId),
      positionId: new mongoose.Types.ObjectId(positionId),
    };

    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.approvalStatus = status;
    }

    // ✅ Get candidates
    const candidates = await Candidate.find(filter)
      .populate("electionId", "title level")
      .populate("approvedBy", "firstName lastName")
      .populate("rejectedBy", "firstName lastName")
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .select("-password -verificationCode -resetPasswordToken");

    // ✅ Get election and position details
    const election = await Election.findById(electionId).select(
      "title positions"
    );
    const position = election?.positions.find(
      (p) => p._id.toString() === positionId
    );

    if (!election || !position) {
      // ✅ Log election/position not found
      await SecurityLogger.log({
        event: "Data Access",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details:
          "Position candidates access failed - election or position not found",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint:
            "/api/admin/elections/:electionId/positions/:positionId/candidates",
          electionId: electionId,
          positionId: positionId,
          electionFound: !!election,
          positionFound: !!position,
          error: "election_or_position_not_found",
        },
      });

      return res
        .status(404)
        .json({ message: "Election or position not found" });
    }

    // ✅ Log successful access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: admin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Position candidates data accessed successfully",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint:
          "/api/admin/elections/:electionId/positions/:positionId/candidates",
        electionId: electionId,
        electionTitle: election.title,
        positionId: positionId,
        positionName: position.name,
        candidatesReturned: candidates.length,
        statusFilter: status || "all",
        accessType: "position_specific_candidates",
      },
    });

    res.json({
      message: "Candidates for position retrieved successfully",
      election: {
        id: election._id,
        title: election.title,
      },
      position: {
        id: position._id,
        name: position.name,
        description: position.description,
        maxCandidates: position.maxCandidates,
      },
      candidates: candidates.map((candidate) => ({
        id: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        studentId: candidate.studentId,
        email: candidate.email,
        college: candidate.college,
        department: candidate.department,
        yearOfStudy: candidate.yearOfStudy,
        gpa: candidate.gpa,
        approvalStatus: candidate.approvalStatus,
        campaignSlogan: candidate.campaignSlogan,
        applicationSubmittedAt: candidate.applicationSubmittedAt,
        createdAt: candidate.createdAt,
      })),
      totalCandidates: candidates.length,
      statistics: {
        total: candidates.length,
        approved: candidates.filter((c) => c.approvalStatus === "approved")
          .length,
        pending: candidates.filter((c) => c.approvalStatus === "pending")
          .length,
        rejected: candidates.filter((c) => c.approvalStatus === "rejected")
          .length,
      },
    });
  } catch (error) {
    console.error("Error fetching candidates by position:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Position candidates access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint:
          "/api/admin/elections/:electionId/positions/:positionId/candidates",
        electionId: req.params?.electionId,
        positionId: req.params?.positionId,
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Update Election Status** (Admin/Super Admin only)
// ✅ **Update Election Status** (Admin/Super Admin only)
exports.updateElectionStatus = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { status, statusNote } = req.body;
    const admin = req.admin;

    // ✅ Log election status update attempt
    await SecurityLogger.log({
      event: "Election Management",
      user: admin?.email || "Unknown",
      userId: admin?.id,
      userType: admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Election status update initiated",
      severity: "Critical",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections/:id/status",
        electionId: electionId,
        requestedStatus: status,
        hasStatusNote: !!statusNote?.trim(),
        action: "update_election_status",
      },
    });

    // ✅ Ensure admin is authenticated
    if (!req.admin) {
      // ✅ Log unauthorized access attempt
      await SecurityLogger.log({
        event: "Election Management",
        user: "Unknown",
        userId: null,
        userType: "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status update failed - no admin authentication",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/elections/:id/status",
          electionId: electionId,
          requestedStatus: status,
          error: "unauthenticated_access",
          securityNote: "Attempted election status modification without auth",
        },
      });

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // ✅ Validate electionId
    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      // ✅ Log invalid election ID
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status update failed - invalid election ID",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/status",
          electionId: electionId,
          requestedStatus: status,
          error: "invalid_election_id",
        },
      });

      return res.status(400).json({
        message: "Invalid election ID format",
        received: electionId,
      });
    }

    // ✅ Validate status
    const validStatuses = [
      "draft",
      "candidate_registration",
      "campaign",
      "voting",
      "completed",
      "cancelled",
      "suspended",
    ];

    if (!status || !validStatuses.includes(status)) {
      // ✅ Log invalid status
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status update failed - invalid status value",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/status",
          electionId: electionId,
          requestedStatus: status,
          validStatuses: validStatuses,
          error: "invalid_status",
        },
      });

      return res.status(400).json({
        message: "Invalid status",
        validStatuses,
        received: status,
      });
    }

    // ✅ Find the election
    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status update failed - election not found",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/status",
          electionId: electionId,
          requestedStatus: status,
          error: "election_not_found",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    // ✅ Status transition validation
    const currentStatus = election.status;
    const statusTransitions = {
      draft: ["candidate_registration", "cancelled"],
      candidate_registration: ["campaign", "cancelled", "suspended"],
      campaign: ["voting", "cancelled", "suspended"],
      voting: ["completed", "cancelled", "suspended"],
      completed: [],
      cancelled: [],
      suspended: ["candidate_registration", "campaign", "voting", "cancelled"],
    };

    if (!statusTransitions[currentStatus]?.includes(status)) {
      // ✅ Log invalid status transition
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status update failed - invalid status transition",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/status",
          electionId: electionId,
          electionTitle: election.title,
          currentStatus: currentStatus,
          requestedStatus: status,
          allowedTransitions: statusTransitions[currentStatus] || [],
          error: "invalid_status_transition",
        },
      });

      return res.status(400).json({
        message: `Cannot change status from '${currentStatus}' to '${status}'`,
        allowedTransitions: statusTransitions[currentStatus] || [],
      });
    }

    // ✅ Additional validations based on status
    const now = new Date();

    if (status === "voting") {
      // Ensure election dates are valid for activation
      if (election.voteStart > now) {
        // ✅ Log premature voting activation
        await SecurityLogger.log({
          event: "Election Management",
          user: admin.email,
          userId: admin.id,
          userType: admin.role,
          ipAddress: SecurityLogger.getClientIP(req),
          userAgent: req.get("User-Agent") || "Unknown",
          status: "Failed",
          details: "Election voting activation failed - start date not reached",
          severity: "Medium",
          category: "Election",
          metadata: {
            endpoint: "/api/admin/elections/:id/status",
            electionId: electionId,
            electionTitle: election.title,
            currentStatus: currentStatus,
            requestedStatus: status,
            voteStart: election.voteStart,
            currentTime: now,
            error: "premature_voting_activation",
          },
        });

        return res.status(400).json({
          message: "Cannot activate election before start date",
          startDate: election.voteStart,
        });
      }
      if (election.voteEnd <= now) {
        // ✅ Log late voting activation
        await SecurityLogger.log({
          event: "Election Management",
          user: admin.email,
          userId: admin.id,
          userType: admin.role,
          ipAddress: SecurityLogger.getClientIP(req),
          userAgent: req.get("User-Agent") || "Unknown",
          status: "Failed",
          details:
            "Election voting activation failed - end date already passed",
          severity: "Medium",
          category: "Election",
          metadata: {
            endpoint: "/api/admin/elections/:id/status",
            electionId: electionId,
            electionTitle: election.title,
            currentStatus: currentStatus,
            requestedStatus: status,
            voteEnd: election.voteEnd,
            currentTime: now,
            error: "late_voting_activation",
          },
        });

        return res.status(400).json({
          message: "Cannot activate election after end date",
          endDate: election.voteEnd,
        });
      }
    }

    if (status === "candidate_registration") {
      // Ensure candidate registration period is valid
      if (election.candidateRegEnd <= now) {
        // ✅ Log late registration opening
        await SecurityLogger.log({
          event: "Election Management",
          user: admin.email,
          userId: admin.id,
          userType: admin.role,
          ipAddress: SecurityLogger.getClientIP(req),
          userAgent: req.get("User-Agent") || "Unknown",
          status: "Failed",
          details:
            "Candidate registration opening failed - registration period ended",
          severity: "Medium",
          category: "Election",
          metadata: {
            endpoint: "/api/admin/elections/:id/status",
            electionId: electionId,
            electionTitle: election.title,
            currentStatus: currentStatus,
            requestedStatus: status,
            candidateRegEnd: election.candidateRegEnd,
            currentTime: now,
            error: "late_registration_opening",
          },
        });

        return res.status(400).json({
          message:
            "Cannot open candidate registration after registration end date",
          candidateRegEnd: election.candidateRegEnd,
        });
      }
    }

    // ✅ Store previous status for audit
    const previousStatus = election.status;

    // ✅ Update election status
    election.status = status;
    election.statusUpdatedBy = req.admin.id;
    election.statusUpdatedAt = new Date();
    election.statusNote = statusNote || null;

    // ✅ Add status change to history (if you have this field)
    if (!election.statusHistory) {
      election.statusHistory = [];
    }

    election.statusHistory.push({
      previousStatus,
      newStatus: status,
      changedBy: req.admin.id,
      changedAt: new Date(),
      note: statusNote || null,
    });

    await election.save();

    // ✅ Get updated election with admin details
    const updatedElection = await Election.findById(electionId)
      .populate("statusUpdatedBy", "firstName lastName email")
      .select(
        "title status statusUpdatedBy statusUpdatedAt statusNote level startDate endDate"
      );

    // ✅ Log successful status change
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: admin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election status updated successfully",
      severity: "Critical",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections/:id/status",
        electionId: electionId,
        electionTitle: election.title,
        electionLevel: election.level,
        previousStatus: previousStatus,
        newStatus: status,
        statusNote: statusNote || "No note provided",
        updatedBy: admin.email,
        updatedAt: election.statusUpdatedAt,
        action: "election_status_changed",
        impactLevel: "high",
      },
    });

    // ✅ Log status change for audit
    console.log(
      `Election status changed: ${
        election.title
      } from '${previousStatus}' to '${status}' by ${
        req.admin.email
      } at ${new Date().toISOString()}`
    );

    res.json({
      message: `Election status updated to '${status}' successfully`,
      election: {
        id: updatedElection._id,
        title: updatedElection.title,
        level: updatedElection.level,
        previousStatus,
        currentStatus: updatedElection.status,
        statusUpdatedBy: updatedElection.statusUpdatedBy
          ? {
              name: `${updatedElection.statusUpdatedBy.firstName} ${updatedElection.statusUpdatedBy.lastName}`,
              email: updatedElection.statusUpdatedBy.email,
            }
          : null,
        statusUpdatedAt: updatedElection.statusUpdatedAt,
        statusNote: updatedElection.statusNote,
        startDate: updatedElection.startDate,
        endDate: updatedElection.endDate,
      },
    });
  } catch (error) {
    console.error("Error updating election status:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Election status update failed with system error",
      severity: "Critical",
      category: "System",
      metadata: {
        endpoint: "/api/admin/elections/:id/status",
        electionId: req.params?.electionId,
        requestedStatus: req.body?.status,
        error: error.message,
        stack: error.stack,
        action: "update_election_status",
      },
    });

    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ **Get Election Status History** (Admin only)
exports.getElectionStatusHistory = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    // ✅ Log status history access attempt
    await SecurityLogger.log({
      event: "Data Access",
      user: admin?.email || "Unknown",
      userId: admin?.id,
      userType: admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Election status history access attempted",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections/:id/status/history",
        electionId: electionId,
        accessType: "election_status_history",
      },
    });

    // ✅ Ensure admin is authenticated
    if (!req.admin) {
      // ✅ Log unauthorized access
      await SecurityLogger.log({
        event: "Data Access",
        user: "Unknown",
        userId: null,
        userType: "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status history access denied - no authentication",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/elections/:id/status/history",
          electionId: electionId,
          error: "unauthenticated_access",
          securityNote: "Attempted access to sensitive election history",
        },
      });

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // ✅ Validate electionId
    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      // ✅ Log invalid election ID
      await SecurityLogger.log({
        event: "Data Access",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status history access failed - invalid election ID",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/status/history",
          electionId: electionId,
          error: "invalid_election_id",
        },
      });

      return res.status(400).json({
        message: "Invalid election ID format",
        received: electionId,
      });
    }

    // ✅ Get election with status history
    const election = await Election.findById(electionId)
      .populate("statusHistory.changedBy", "firstName lastName email")
      .populate("statusUpdatedBy", "firstName lastName email")
      .select(
        "title status statusHistory statusUpdatedBy statusUpdatedAt level"
      );

    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Data Access",
        user: admin.email,
        userId: admin.id,
        userType: admin.role,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election status history access failed - election not found",
        severity: "Medium",
        category: "Election",
        metadata: {
          endpoint: "/api/admin/elections/:id/status/history",
          electionId: electionId,
          error: "election_not_found",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    // ✅ Log successful history access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: admin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election status history accessed successfully",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections/:id/status/history",
        electionId: electionId,
        electionTitle: election.title,
        electionLevel: election.level,
        currentStatus: election.status,
        historyEntries: election.statusHistory?.length || 0,
        accessType: "sensitive_election_audit_data",
        accessedBy: admin.email,
      },
    });

    res.json({
      message: "Election status history retrieved successfully",
      election: {
        id: election._id,
        title: election.title,
        level: election.level,
        currentStatus: election.status,
        lastUpdatedBy: election.statusUpdatedBy
          ? {
              name: `${election.statusUpdatedBy.firstName} ${election.statusUpdatedBy.lastName}`,
              email: election.statusUpdatedBy.email,
            }
          : null,
        lastUpdatedAt: election.statusUpdatedAt,
      },
      statusHistory:
        election.statusHistory?.map((history) => ({
          previousStatus: history.previousStatus,
          newStatus: history.newStatus,
          changedBy: history.changedBy
            ? {
                name: `${history.changedBy.firstName} ${history.changedBy.lastName}`,
                email: history.changedBy.email,
              }
            : null,
          changedAt: history.changedAt,
          note: history.note,
        })) || [],
    });
  } catch (error) {
    console.error("Error fetching election status history:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Election status history access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/admin/elections/:id/status/history",
        electionId: req.params?.electionId,
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Get All Elections with Status Info** (Admin only)
exports.getAllElectionsForAdmin = async (req, res) => {
  try {
    const {
      status,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    const admin = req.admin;

    // ✅ Log admin elections list access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin?.email || "Unknown",
      userId: admin?.id,
      userType: admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Admin elections list access attempted",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections",
        filters: {
          status: status || "all",
          page: page,
          limit: limit,
          sortBy: sortBy,
          sortOrder: sortOrder,
        },
        accessType: "admin_elections_overview",
      },
    });

    // ✅ Ensure admin is authenticated
    if (!req.admin) {
      // ✅ Log unauthorized access
      await SecurityLogger.log({
        event: "Data Access",
        user: "Unknown",
        userId: null,
        userType: "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin elections list access denied - no authentication",
        severity: "High",
        category: "Security",
        metadata: {
          endpoint: "/api/admin/elections",
          error: "unauthenticated_access",
          securityNote: "Attempted access to admin elections overview",
        },
      });

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // ✅ Build filter
    const filter = {};
    if (status) {
      filter.status = status;
    }

    // ✅ Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    // ✅ Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ✅ Get elections
    const elections = await Election.find(filter)
      .populate("createdBy", "firstName lastName email")
      .populate("statusUpdatedBy", "firstName lastName email")
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "title level status startDate endDate candidateRegStart candidateRegEnd createdBy statusUpdatedBy statusUpdatedAt positions"
      );

    const totalElections = await Election.countDocuments(filter);

    // ✅ Format response
    const formattedElections = elections.map((election) => ({
      id: election._id,
      title: election.title,
      level: election.level,
      status: election.status,
      startDate: election.startDate,
      endDate: election.endDate,
      candidateRegStart: election.candidateRegStart,
      candidateRegEnd: election.candidateRegEnd,
      positionCount: election.positions?.length || 0,
      createdBy: election.createdBy
        ? {
            name: `${election.createdBy.firstName} ${election.createdBy.lastName}`,
            email: election.createdBy.email,
          }
        : null,
      statusUpdatedBy: election.statusUpdatedBy
        ? {
            name: `${election.statusUpdatedBy.firstName} ${election.statusUpdatedBy.lastName}`,
            email: election.statusUpdatedBy.email,
          }
        : null,
      statusUpdatedAt: election.statusUpdatedAt,
      createdAt: election.createdAt,
    }));

    // ✅ Get status distribution for logging
    const statusCounts = await Election.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // ✅ Log successful elections list access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: admin.role,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Admin elections list accessed successfully",
      severity: "Medium",
      category: "Election",
      metadata: {
        endpoint: "/api/admin/elections",
        electionsReturned: formattedElections.length,
        totalElections: totalElections,
        filters: {
          status: status || "all",
          page: page,
          limit: limit,
          sortBy: sortBy,
          sortOrder: sortOrder,
        },
        statusDistribution: statusCounts.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        accessType: "comprehensive_elections_data",
        accessedBy: admin.email,
      },
    });

    res.json({
      message: "Elections retrieved successfully",
      elections: formattedElections,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalElections,
        totalPages: Math.ceil(totalElections / parseInt(limit)),
        hasNext: skip + parseInt(limit) < totalElections,
        hasPrev: parseInt(page) > 1,
      },
      availableStatuses: [
        "draft",
        "candidate_registration",
        "upcoming",
        "active",
        "completed",
        "cancelled",
        "suspended",
      ],
    });
  } catch (error) {
    console.error("Error fetching elections for admin:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Admin elections list access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/admin/elections",
        error: error.message,
        stack: error.stack,
        filters: {
          status: req.query?.status,
          page: req.query?.page,
          limit: req.query?.limit,
        },
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};
