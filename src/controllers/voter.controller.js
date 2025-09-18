/* ──────────────────────  Voter Controller  ────────────────────── */
const Voter = require("../models/voter.model");
const Candidate = require("../models/candidate.model");
const Election = require("../models/election.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { createUserSession } = require("../utils/sessionHelpers");

const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../utils/emailService");

const { generateToken, setTokenCookie } = require("../utils/generateToken");
const { sanitizeString } = require("../utils/sanitizeInput");

const ForumQuestion = require("../models/forumQuestion.model");

// ✅ Import Security Logger
const SecurityLogger = require("../services/securityLogger");

/* ─────────────────────────── Register ─────────────────────────── */

// **Voter Registration**
exports.registerVoter = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      studentId,
      email,
      mobileNumber,
      department,
      college,
      yearOfStudy,
      password,
      confirmPassword,
    } = req.body;

    /* Basic validations */
    if (
      !firstName ||
      !lastName ||
      !studentId ||
      !email ||
      !mobileNumber ||
      !department ||
      !college ||
      !yearOfStudy ||
      !password ||
      !confirmPassword
    ) {
      // ✅ Updated SecurityLogger call
      await SecurityLogger.log({
        event: "Voter Registration",
        user: email || "Unknown",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Voter registration failed - missing required fields",
        severity: "Medium",
        category: "Authentication",
        metadata: {
          reason: "Missing required fields",
          providedFields: Object.keys(req.body).filter((key) => req.body[key]),
        },
      });

      return res.status(400).json({ message: "All fields are required" });
    }

    // Password mismatch check
    if (password !== confirmPassword) {
      await SecurityLogger.log({
        event: "Voter Registration",
        user: email,
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Voter registration failed - password mismatch",
        severity: "Medium",
        category: "Authentication",
        metadata: { reason: "Password mismatch" },
      });

      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Student ID validation
    if (!/^\d{8}$/.test(studentId)) {
      await SecurityLogger.log({
        event: "Voter Registration",
        user: email,
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Voter registration failed - invalid student ID format",
        severity: "Medium",
        category: "Authentication",
        metadata: {
          reason: "Invalid student ID format",
          studentId: studentId,
        },
      });

      return res
        .status(400)
        .json({ message: "Student ID must be exactly 8 digits" });
    }

    // Email validation
    if (!/^[a-z0-9]+@st\.ug\.edu\.gh$/.test(email.toLowerCase())) {
      await SecurityLogger.log({
        event: "Voter Registration",
        user: email,
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Voter registration failed - invalid email domain",
        severity: "Medium",
        category: "Authentication",
        metadata: {
          reason: "Invalid email domain",
          email: email,
        },
      });

      return res
        .status(400)
        .json({ message: "E-mail must be a valid UG student address" });
    }

    /* Duplicate checks */
    const existingStudentId = await Voter.findOne({ studentId });
    if (existingStudentId) {
      await SecurityLogger.log({
        event: "Voter Registration",
        user: email,
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Voter registration failed - duplicate student ID",
        severity: "Medium",
        category: "Authentication",
        metadata: {
          reason: "Duplicate student ID",
          studentId: studentId,
        },
      });

      return res.status(400).json({ message: "Student ID already exists" });
    }

    const existingEmail = await Voter.findOne({ email });
    if (existingEmail) {
      await SecurityLogger.log({
        event: "Voter Registration",
        user: email,
        userId: existingEmail._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Voter registration failed - duplicate email",
        severity: "Medium",
        category: "Authentication",
        metadata: {
          reason: "Duplicate email",
          existingUserId: existingEmail._id,
        },
      });

      return res.status(400).json({ message: "Email already registered" });
    }

    // ✅ Better: 8-digit codes with better entropy
    const generateSecureCode = (length = 8) => {
      const digits = "0123456789";
      let code = "";

      for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, digits.length);
        code += digits[randomIndex];
      }

      return code;
    };

    const verificationCode = generateSecureCode(6); // 100 million combinations

    const verificationCodeExpires = Date.now() + 15 * 60 * 1000;

    /* Create new voter */
    const newVoter = await Voter.create({
      firstName,
      lastName,
      studentId,
      email,
      department,
      college,
      yearOfStudy,
      mobileNumber,
      password,
      verificationCode,
      verificationCodeExpires,
      isVerified: false,
    });

    await newVoter.save();
    await sendVerificationEmail(email, verificationCode);

    // ✅ Log successful registration
    await SecurityLogger.log({
      event: "Voter Registration",
      user: newVoter.email,
      userId: newVoter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Voter registration completed successfully",
      severity: "Medium",
      category: "Authentication",
      metadata: {
        studentId: studentId,
        department: department,
        college: college,
        verificationCodeSent: true,
      },
    });

    res.status(201).json({
      _id: newVoter._id,
      firstName: newVoter.firstName,
      lastName: newVoter.lastName,
      studentId: newVoter.studentId,
      email: newVoter.email,
      department: newVoter.department,
      college: newVoter.college,
      mobileNumber: newVoter.mobileNumber,
      isVerified: newVoter.isVerified,
      message:
        "Registration successful. Check your UG mail for the verification code.",
    });
  } catch (err) {
    console.error("Register voter error:", err);

    // ✅ Log system error
    await SecurityLogger.log({
      event: "Voter Registration",
      user: req.body?.email || "Unknown",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Voter registration failed with system error",
      severity: "Critical",
      category: "System",
      metadata: {
        reason: "System error",
        error: err.message,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ─────────────────────── Verify e-mail ─────────────────────── */
exports.verifyVoter = async (req, res) => {
  try {
    const { email, code } = req.body;
    const voter = await Voter.findOne({ email });

    if (!voter) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Check if verification is locked
    if (
      voter.verificationLocked &&
      voter.verificationLockExpires > Date.now()
    ) {
      const remainingTime = Math.ceil(
        (voter.verificationLockExpires - Date.now()) / (1000 * 60)
      );

      await SecurityLogger.log({
        event: "Email Verification",
        user: voter.email,
        userId: voter._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Verification attempt while locked",
        severity: "High",
        category: "Authentication",
        metadata: {
          reason: "Account locked",
          remainingLockTime: remainingTime,
          totalAttempts: voter.verificationAttempts,
        },
      });

      return res.status(429).json({
        message: `Too many failed attempts. Try again in ${remainingTime} minutes.`,
        lockedUntil: voter.verificationLockExpires,
      });
    }

    // ✅ Check code validity
    const isValidCode =
      voter.verificationCode === code &&
      Date.now() < voter.verificationCodeExpires;

    if (!isValidCode) {
      // Increment failed attempts
      voter.verificationAttempts += 1;
      voter.lastVerificationAttempt = new Date();

      // ✅ Lock after 5 failed attempts
      if (voter.verificationAttempts >= 5) {
        voter.verificationLocked = true;
        voter.verificationLockExpires = Date.now() + 30 * 60 * 1000; // 30 minutes

        await voter.save();

        await SecurityLogger.log({
          event: "Email Verification",
          user: voter.email,
          userId: voter._id,
          userType: "Voter",
          ipAddress: SecurityLogger.getClientIP(req),
          userAgent: req.get("User-Agent") || "Unknown",
          status: "Failed",
          details:
            "Account locked due to too many failed verification attempts",
          severity: "High",
          category: "Authentication",
          metadata: {
            totalAttempts: voter.verificationAttempts,
            lockDuration: "30 minutes",
            lastAttemptedCode: code,
          },
        });

        return res.status(429).json({
          message:
            "Account locked due to too many failed attempts. Try again in 30 minutes.",
          lockedUntil: voter.verificationLockExpires,
        });
      }

      await voter.save();

      await SecurityLogger.log({
        event: "Email Verification",
        user: voter.email,
        userId: voter._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid verification code attempt",
        severity: "High",
        category: "Authentication",
        metadata: {
          reason:
            voter.verificationCode !== code ? "Invalid code" : "Expired code",
          attemptNumber: voter.verificationAttempts,
          remainingAttempts: 5 - voter.verificationAttempts,
        },
      });

      return res.status(400).json({
        message: "Invalid or expired code",
        attemptsRemaining: 5 - voter.verificationAttempts,
      });
    }

    // ✅ Successful verification - reset attempts
    voter.isVerified = true;
    voter.verificationCode = null;
    voter.verificationCodeExpires = null;
    voter.verificationAttempts = 0;
    voter.verificationLocked = false;
    voter.verificationLockExpires = null;
    await voter.save();

    await SecurityLogger.log({
      event: "Email Verification",
      user: voter.email,
      userId: voter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Email verification completed successfully",
      severity: "Medium",
      category: "Authentication",
      metadata: {
        verifiedAt: new Date(),
        totalAttempts: voter.verificationAttempts + 1,
      },
    });

    res.json({
      _id: voter._id,
      firstName: voter.firstName,
      lastName: voter.lastName,
      email: voter.email,
      isVerified: voter.isVerified,
      message: "Email verified successfully",
    }); // ✅ User must still login separately
  } catch (err) {
    console.error("Verify voter error:", err);

    await SecurityLogger.log({
      event: "Email Verification",
      user: req.body?.email || "Unknown",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Email verification failed with system error",
      severity: "Critical",
      category: "System",
      metadata: {
        reason: "System error",
        error: err.message,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ─────────────────────────── Login ─────────────────────────── */
exports.loginVoter = async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      // ✅ Use correct enum values from your model
      await SecurityLogger.log({
        event: "Failed Login Attempt", // ✅ From your enum
        user: studentId || "Unknown",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed", // ✅ From your enum (not "FAILED")
        details:
          "Missing credentials - Student ID and/or password not provided",
        severity: "Medium", // ✅ From your enum
        category: "Authentication", // ✅ From your enum (not "AUTH")
        metadata: {
          providedStudentId: !!studentId,
          providedPassword: !!password,
        },
      });

      return res
        .status(400)
        .json({ message: "Student ID and password are required" });
    }

    const voter = await Voter.findOne({ studentId });
    if (!voter) {
      await SecurityLogger.log({
        event: "Failed Login Attempt",
        user: studentId,
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Login attempt with non-existent student ID",
        severity: "Medium",
        category: "Authentication",
        metadata: { attemptedStudentId: studentId },
      });

      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!voter.isVerified) {
      await SecurityLogger.log({
        event: "Failed Login Attempt",
        user: voter.email,
        userId: voter._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Login attempt with unverified email address",
        severity: "Medium",
        category: "Authentication",
        metadata: { studentId: studentId, email: voter.email },
      });

      return res.status(400).json({ message: "Email not verified" });
    }

    const isMatch = await bcrypt.compare(password, voter.password);
    if (!isMatch) {
      await SecurityLogger.log({
        event: "Failed Login Attempt",
        user: voter.email,
        userId: voter._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Login attempt with incorrect password",
        severity: "High",
        category: "Authentication",
        metadata: { studentId: studentId, email: voter.email },
      });

      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ Create session
    const sessionUser = createUserSession(req, voter, "voter");

    // ✅ ALWAYS set voter token first
    const voterToken = generateToken(voter._id, "voter", {
      sessionId: req.sessionID,
    });
    setTokenCookie(res, voterToken, "voterToken", {
      maxAge: 24 * 60 * 60 * 1000,
    });

    // ✅ Additionally set candidate token if user is an approved candidate
    let candidateTokenSet = false;
    if (voter.role === "candidate") {
      const candidate = await Candidate.findOne({
        email: voter.email,
        approvalStatus: "approved",
      });

      if (candidate) {
        const candidateToken = generateToken(candidate._id, "candidate", {
          sessionId: req.sessionID,
        });
        setTokenCookie(res, candidateToken, "candidateToken", {
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        candidateTokenSet = true;
      }
    }

    // ✅ Log successful login - Note: no "Admin Login" in enum, so create custom event
    await SecurityLogger.log({
      event: "Suspicious Activity", // ✅ We'll use this temporarily, or add "Voter Login" to enum
      user: voter.email,
      userId: voter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Voter logged in successfully",
      severity: "Low",
      category: "Authentication",
      metadata: {
        studentId: studentId,
        role: voter.role,
        sessionId: req.sessionID,
        candidateTokenSet: candidateTokenSet,
        loginMethod: "studentId/password",
      },
    });

    // Update last login
    voter.lastLoginAt = new Date();
    await voter.save();

    res.json({
      _id: voter._id,
      firstName: voter.firstName,
      lastName: voter.lastName,
      studentId: voter.studentId,
      email: voter.email,
      mobileNumber: voter.mobileNumber,
      isVerified: voter.isVerified,
      role: voter.role,
      message: "Login successful",
      tokens: {
        voterToken: "set",
        candidateToken:
          voter.role === "candidate" ? "conditional" : "not_applicable",
      },
      session: {
        id: req.sessionID,
        expiresAt: req.session.cookie.expires,
      },
    });
  } catch (err) {
    console.error("Login voter error:", err);

    await SecurityLogger.log({
      event: "System Maintenance", // ✅ Using existing enum for system errors
      user: req.body?.studentId || "Unknown",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "System error during voter login process",
      severity: "Critical",
      category: "System",
      metadata: { error: err.message, endpoint: "/api/voters/login" },
    });

    res.status(500).json({ message: "Server error" });
  }
};
/* ───────────────────── Logout voter ───────────────────── */
exports.logoutVoter = async (req, res) => {
  try {
    const user = req.voter || req.user;

    // Clear the voter token cookie
    res.cookie("voterToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: 0,
    });

    // Clear the candidate token cookie
    res.cookie("candidateToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });

    // ✅ Log successful logout
    await SecurityLogger.log({
      event: "Voter Logout",
      user: req.voter?.email || "Unknown",
      userId: req.voter?.id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Voter logged out successfully",
      category: "Authentication",
      metadata: {
        endpoint: "/api/voters/logout",
        sessionEnded: new Date().toISOString(),
      },
    });

    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("Logout voter error:", err);

    await SecurityLogger.log({
      event: "Voter Logout",
      user: req.voter?.email || "Unknown",
      userId: req.voter?.id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Voter logout failed with system error",
      category: "Authentication",
      metadata: {
        endpoint: "/api/voters/logout",
        error: err.message,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────── Update profile ───────────────────── */
exports.updateVoterProfile = async (req, res) => {
  try {
    const { firstName, lastName, studentId, email, mobileNumber } = req.body;
    const voter = await Voter.findById(req.user.id);

    const originalData = {
      firstName: voter.firstName,
      lastName: voter.lastName,
      studentId: voter.studentId,
      email: voter.email,
      mobileNumber: voter.mobileNumber,
    };

    voter.firstName = firstName || voter.firstName;
    voter.lastName = lastName || voter.lastName;
    voter.studentId = studentId || voter.studentId;
    voter.email = email || voter.email;
    voter.mobileNumber = mobileNumber || voter.mobileNumber;

    await voter.save();

    // ✅ Log profile update
    await SecurityLogger.log(
      "USER_UPDATE",
      voter,
      req,
      "SUCCESS",
      {
        updatedFields: Object.keys(req.body).filter((key) => req.body[key]),
        originalData: originalData,
        newData: {
          firstName: voter.firstName,
          lastName: voter.lastName,
          studentId: voter.studentId,
          email: voter.email,
          mobileNumber: voter.mobileNumber,
        },
      },
      "MEDIUM",
      "AUTH"
    );

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Update profile error:", err);

    await SecurityLogger.log(
      "USER_UPDATE",
      req.user,
      req,
      "FAILED",
      {
        reason: "System error",
        error: err.message,
        attemptedFields: Object.keys(req.body),
      },
      "MEDIUM",
      "AUTH"
    );

    res.status(500).json({ message: "Server error" });
  }
};

/* ─────────────────── Change password ─────────────────── */
exports.changeVoterPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const voter = await Voter.findById(req.user.id);

    const isMatch = await bcrypt.compare(oldPassword, voter.password);
    if (!isMatch) {
      await SecurityLogger.log("PASSWORD_CHANGE", voter, req, false, {
        reason: "Incorrect old password",
        userId: voter._id,
      });

      return res.status(400).json({ message: "Old password is incorrect" });
    }

    voter.password = newPassword;
    await voter.save();

    // ✅ Log successful password change
    await SecurityLogger.log("PASSWORD_CHANGE", voter, req, true, {
      userId: voter._id,
      email: voter.email,
      changedAt: new Date(),
    });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);

    await SecurityLogger.log("PASSWORD_CHANGE", req.user, req, false, {
      reason: "System error",
      error: err.message,
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ───── Deactivate / Reactivate (admin only) ───── */
exports.deactivateVoter = async (req, res) => {
  try {
    if (!["admin", "super-admin"].includes(req.user.role)) {
      await SecurityLogger.logAdmin(
        "VOTER_DEACTIVATE",
        req.user,
        req,
        req.params.voterId,
        false,
        {
          reason: "Access denied - insufficient permissions",
          userRole: req.user.role,
        }
      );

      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    const voter = await Voter.findById(req.params.voterId);
    if (!voter) {
      await SecurityLogger.logAdmin(
        "VOTER_DEACTIVATE",
        req.user,
        req,
        req.params.voterId,
        false,
        {
          reason: "Voter not found",
          targetVoterId: req.params.voterId,
        }
      );

      return res.status(404).json({ message: "Voter not found" });
    }

    const wasActive = voter.isVerified;
    voter.isVerified = false;
    await voter.save();

    // ✅ Log voter deactivation
    await SecurityLogger.logAdmin(
      "VOTER_DEACTIVATE",
      req.user,
      req,
      voter._id,
      true,
      {
        targetVoter: {
          id: voter._id,
          email: voter.email,
          studentId: voter.studentId,
        },
        wasActive: wasActive,
        deactivatedBy: req.user.id,
      }
    );

    res.json({ message: "Voter account deactivated" });
  } catch (err) {
    console.error("Deactivate voter error:", err);

    await SecurityLogger.logAdmin(
      "VOTER_DEACTIVATE",
      req.user,
      req,
      req.params.voterId,
      false,
      {
        reason: "System error",
        error: err.message,
      }
    );

    res.status(500).json({ message: "Server error" });
  }
};

exports.reactivateVoter = async (req, res) => {
  try {
    if (!["admin", "super-admin"].includes(req.user.role)) {
      await SecurityLogger.logAdmin(
        "VOTER_REACTIVATE",
        req.user,
        req,
        req.params.voterId,
        false,
        {
          reason: "Access denied - insufficient permissions",
          userRole: req.user.role,
        }
      );

      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    const voter = await Voter.findById(req.params.voterId);
    if (!voter) {
      await SecurityLogger.logAdmin(
        "VOTER_REACTIVATE",
        req.user,
        req,
        req.params.voterId,
        false,
        {
          reason: "Voter not found",
          targetVoterId: req.params.voterId,
        }
      );

      return res.status(404).json({ message: "Voter not found" });
    }

    const wasInactive = !voter.isVerified;
    voter.isVerified = true;
    await voter.save();

    // ✅ Log voter reactivation
    await SecurityLogger.logAdmin(
      "VOTER_REACTIVATE",
      req.user,
      req,
      voter._id,
      true,
      {
        targetVoter: {
          id: voter._id,
          email: voter.email,
          studentId: voter.studentId,
        },
        wasInactive: wasInactive,
        reactivatedBy: req.user.id,
      }
    );

    res.json({ message: "Voter account reactivated" });
  } catch (err) {
    console.error("Reactivate voter error:", err);

    await SecurityLogger.logAdmin(
      "VOTER_REACTIVATE",
      req.user,
      req,
      req.params.voterId,
      false,
      {
        reason: "System error",
        error: err.message,
      }
    );

    res.status(500).json({ message: "Server error" });
  }
};

/* ───── Forgot password ───── */
// Better token generation
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

// ✅ Enhanced password reset
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const voter = await Voter.findOne({ email });
    if (!voter) {
      // ✅ Don't reveal if email exists or not
      return res.json({
        message:
          "If an account with this email exists, you will receive a password reset link.",
      });
    }

    // ✅ Check rate limiting for password reset
    if (voter.resetLocked && voter.resetLockExpires > Date.now()) {
      const remainingTime = Math.ceil(
        (voter.resetLockExpires - Date.now()) / (1000 * 60)
      );

      await SecurityLogger.log({
        event: "Password Reset Request",
        user: voter.email,
        userId: voter._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Password reset request while locked",
        severity: "High",
        category: "Authentication",
        metadata: {
          reason: "Rate limited",
          remainingLockTime: remainingTime,
        },
      });

      return res.status(429).json({
        message: `Too many reset attempts. Try again in ${remainingTime} minutes.`,
      });
    }

    // ✅ Generate secure 64-character token
    const resetToken = generateSecureToken(32); // 64 chars hex
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    voter.resetPasswordToken = resetTokenHash; // Store hashed version
    voter.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    voter.resetAttempts = 0; // Reset attempts on new token
    await voter.save();

    const FE_URL = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${FE_URL}/reset-password/${resetToken}`; // Send plain token

    await sendPasswordResetEmail(voter.email, resetUrl);

    await SecurityLogger.log({
      event: "Password Reset Request",
      user: voter.email,
      userId: voter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Password reset email sent successfully",
      severity: "Medium",
      category: "Authentication",
      metadata: {
        tokenHashPrefix: resetTokenHash.substring(0, 8),
        expiresAt: new Date(voter.resetPasswordExpires),
      },
    });

    res.json({
      message:
        "If an account with this email exists, you will receive a password reset link.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Enhanced password reset verification
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash the provided token to compare with stored hash
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const voter = await Voter.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!voter) {
      await SecurityLogger.log({
        event: "Password Reset",
        user: "Unknown",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid or expired reset token",
        severity: "High",
        category: "Authentication",
        metadata: {
          tokenHashPrefix: resetTokenHash.substring(0, 8),
          timestamp: new Date(),
        },
      });

      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // ✅ Update password and clear reset fields
    voter.password = password; // This will be hashed by your pre-save middleware
    voter.resetPasswordToken = undefined;
    voter.resetPasswordExpires = undefined;
    voter.resetAttempts = 0;
    voter.resetLocked = false;
    voter.resetLockExpires = null;
    await voter.save();

    await SecurityLogger.log({
      event: "Password Reset",
      user: voter.email,
      userId: voter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Password reset completed successfully",
      severity: "Medium",
      category: "Authentication",
      metadata: {
        resetAt: new Date(),
        tokenHashPrefix: resetTokenHash.substring(0, 8),
      },
    });

    res.json({ message: "Password reset successful. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// **Get All Voters** (Admin only)
exports.getAllVoters = async (req, res) => {
  try {
    // Ensure admin is authenticated
    if (!req.admin) {
      await SecurityLogger.logAdmin(
        "VOTERS_VIEW_ALL",
        req.user,
        req,
        null,
        false,
        {
          reason: "Access denied - not admin",
        }
      );

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const {
      page = 1,
      limit = 50,
      status,
      search,
      department,
      college,
      yearOfStudy,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Build query filters
    let query = {};

    if (status) {
      if (status === "verified") {
        query.isVerified = true;
      } else if (status === "unverified") {
        query.isVerified = false;
      }
    }

    if (department) {
      query.department = sanitizeString(department);
    }

    if (college) {
      query.college = sanitizeString(college);
    }

    if (yearOfStudy) {
      query.yearOfStudy = parseInt(yearOfStudy);
    }

    if (search) {
      const sanitizedSearch = sanitizeString(search);
      query.$or = [
        { firstName: { $regex: sanitizedSearch, $options: "i" } },
        { lastName: { $regex: sanitizedSearch, $options: "i" } },
        { email: { $regex: sanitizedSearch, $options: "i" } },
        { studentId: { $regex: sanitizedSearch, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = order === "desc" ? -1 : 1;

    const voters = await Voter.find(query, "-password -__v")
      .populate("firstName lastName email")
      .sort(sortOptions)
      .limit(limit * 1)
      .skip(skip);

    const totalVoters = await Voter.countDocuments(query);
    const verifiedCount = await Voter.countDocuments({ isVerified: true });
    const unverifiedCount = await Voter.countDocuments({ isVerified: false });

    const departmentCounts = await Voter.aggregate([
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const collegeCounts = await Voter.aggregate([
      {
        $group: {
          _id: "$college",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // ✅ Log admin viewing all voters
    await SecurityLogger.logAdmin(
      "VOTERS_VIEW_ALL",
      req.admin,
      req,
      null,
      true,
      {
        filters: { status, search, department, college, yearOfStudy },
        pagination: { page, limit },
        resultCount: voters.length,
        totalVoters: totalVoters,
      }
    );

    res.json({
      message: "Voters retrieved successfully",
      voters: voters.map((voter) => ({
        id: voter._id,
        firstName: voter.firstName,
        lastName: voter.lastName,
        name: `${voter.firstName} ${voter.lastName}`,
        email: voter.email,
        studentId: voter.studentId,
        phoneNumber: voter.phoneNumber,
        department: voter.department,
        college: voter.college,
        isVerified: voter.isVerified,
        lastLoginAt: voter.lastLoginAt,
        createdAt: voter.createdAt,
        updatedAt: voter.updatedAt,
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalVoters / limit),
        totalVoters,
        limit: parseInt(limit),
        hasNextPage: page < Math.ceil(totalVoters / limit),
        hasPrevPage: page > 1,
      },
      summary: {
        total: totalVoters,
        verified: verifiedCount,
        unverified: unverifiedCount,
        departments: departmentCounts,
        colleges: collegeCounts,
      },
    });
  } catch (error) {
    console.error("Error fetching voters:", error);

    await SecurityLogger.logAdmin(
      "VOTERS_VIEW_ALL",
      req.admin,
      req,
      null,
      false,
      {
        reason: "System error",
        error: error.message,
      }
    );

    res.status(500).json({ message: "Server error" });
  }
};

// **Get Single Voter** (Admin only)
exports.getVoterById = async (req, res) => {
  try {
    if (!req.admin) {
      await SecurityLogger.logAdmin(
        "VOTER_VIEW",
        req.user,
        req,
        req.params.voterId,
        false,
        {
          reason: "Access denied - not admin",
        }
      );

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { voterId } = req.params;
    const sanitizedVoterId = sanitizeString(voterId);

    const voter = await Voter.findById(
      sanitizedVoterId,
      "-password -__v"
    ).populate("verifiedBy", "firstName lastName email role");

    if (!voter) {
      await SecurityLogger.logAdmin(
        "VOTER_VIEW",
        req.admin,
        req,
        voterId,
        false,
        {
          reason: "Voter not found",
          voterId: voterId,
        }
      );

      return res.status(404).json({ message: "Voter not found" });
    }

    // ✅ Log admin viewing specific voter
    await SecurityLogger.logAdmin(
      "VOTER_VIEW",
      req.admin,
      req,
      voter._id,
      true,
      {
        targetVoter: {
          id: voter._id,
          email: voter.email,
          studentId: voter.studentId,
          isVerified: voter.isVerified,
        },
      }
    );

    res.json({
      message: "Voter retrieved successfully",
      voter: {
        id: voter._id,
        firstName: voter.firstName,
        lastName: voter.lastName,
        email: voter.email,
        studentId: voter.studentId,
        phoneNumber: voter.phoneNumber,
        department: voter.department,
        college: voter.college,
        lastLoginAt: voter.lastLoginAt,
        createdAt: voter.createdAt,
        updatedAt: voter.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching voter:", error);

    await SecurityLogger.logAdmin(
      "VOTER_VIEW",
      req.admin,
      req,
      req.params.voterId,
      false,
      {
        reason: "System error",
        error: error.message,
      }
    );

    res.status(500).json({ message: "Server error" });
  }
};

// **Unverify Voter** (Admin only)
exports.unverifyVoter = async (req, res) => {
  try {
    if (!req.admin) {
      await SecurityLogger.logAdmin(
        "VOTER_UNVERIFY",
        req.user,
        req,
        req.params.voterId,
        false,
        {
          reason: "Access denied - not admin",
        }
      );

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { voterId } = req.params;
    const { reason } = req.body;

    const voter = await Voter.findById(voterId);

    if (!voter) {
      await SecurityLogger.logAdmin(
        "VOTER_UNVERIFY",
        req.admin,
        req,
        voterId,
        false,
        {
          reason: "Voter not found",
          voterId: voterId,
        }
      );

      return res.status(404).json({ message: "Voter not found" });
    }

    if (!voter.isVerified) {
      await SecurityLogger.logAdmin(
        "VOTER_UNVERIFY",
        req.admin,
        req,
        voter._id,
        false,
        {
          reason: "Voter already unverified",
          voterEmail: voter.email,
        }
      );

      return res.status(400).json({ message: "Voter is not verified" });
    }

    voter.isVerified = false;
    voter.unverifiedBy = req.admin.id;
    voter.unverifiedAt = new Date();
    voter.unverificationReason = reason || "No reason provided";

    await voter.save();

    // ✅ Log voter unverification
    await SecurityLogger.logAdmin(
      "VOTER_UNVERIFY",
      req.admin,
      req,
      voter._id,
      true,
      {
        targetVoter: {
          id: voter._id,
          email: voter.email,
          studentId: voter.studentId,
        },
        reason: reason,
        unverifiedBy: req.admin.id,
      }
    );

    res.json({
      message: "Voter unverified successfully",
      voter: {
        id: voter._id,
        name: `${voter.firstName} ${voter.lastName}`,
        email: voter.email,
        isVerified: voter.isVerified,
        unverifiedAt: voter.unverifiedAt,
      },
    });
  } catch (error) {
    console.error("Error unverifying voter:", error);

    await SecurityLogger.logAdmin(
      "VOTER_UNVERIFY",
      req.admin,
      req,
      req.params.voterId,
      false,
      {
        reason: "System error",
        error: error.message,
      }
    );

    res.status(500).json({ message: "Server error" });
  }
};

// **Get Voter Statistics** (Admin only)
exports.getVoterStats = async (req, res) => {
  try {
    if (!req.admin) {
      await SecurityLogger.logAdmin("VOTER_STATS", req.user, req, null, false, {
        reason: "Access denied - not admin",
      });

      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const totalVoters = await Voter.countDocuments();
    const verifiedVoters = await Voter.countDocuments({ isVerified: true });
    const unverifiedVoters = await Voter.countDocuments({ isVerified: false });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentRegistrations = await Voter.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    const departmentStats = await Voter.aggregate([
      {
        $group: {
          _id: "$department",
          total: { $sum: 1 },
          verified: { $sum: { $cond: ["$isVerified", 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const yearStats = await Voter.aggregate([
      {
        $group: {
          _id: "$yearOfStudy",
          total: { $sum: 1 },
          verified: { $sum: { $cond: ["$isVerified", 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ✅ Log admin viewing voter statistics
    await SecurityLogger.logAdmin("VOTER_STATS", req.admin, req, null, true, {
      statsGenerated: {
        totalVoters,
        verifiedVoters,
        unverifiedVoters,
        recentRegistrations,
      },
    });

    res.json({
      message: "Voter statistics retrieved successfully",
      stats: {
        totals: {
          total: totalVoters,
          verified: verifiedVoters,
          unverified: unverifiedVoters,
          recentRegistrations,
        },
        departments: departmentStats,
        years: yearStats,
        verificationRate:
          totalVoters > 0
            ? Math.round((verifiedVoters / totalVoters) * 100)
            : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching voter statistics:", error);

    await SecurityLogger.logAdmin("VOTER_STATS", req.admin, req, null, false, {
      reason: "System error",
      error: error.message,
    });

    res.status(500).json({ message: "Server error" });
  }
};

// Add this method for voter to apply as candidate
exports.applyAsCandidate = async (req, res) => {
  try {
    const voterId = req.voter.id;
    const {
      electionId,
      positionId,
      manifesto,
      qualifications = [],
      experience = [],
      socialLinks = {},
      campaignSlogan,
    } = req.body;

    const voter = await Voter.findById(voterId);
    if (!voter || !voter.isVerified) {
      await SecurityLogger.log(
        "CANDIDATE_APPLICATION",
        voter,
        req,
        "FAILED",
        {
          reason: "Voter not verified",
          voterId: voterId,
          electionId: electionId,
        },
        "MEDIUM",
        "VOTING"
      );

      return res.status(400).json({
        message: "Only verified voters can apply as candidates",
      });
    }

    const election = await Election.findById(electionId);
    if (!election) {
      await SecurityLogger.log(
        "CANDIDATE_APPLICATION",
        voter,
        req,
        "FAILED",
        {
          reason: "Election not found",
          electionId: electionId,
        },
        "MEDIUM",
        "VOTING"
      );

      return res.status(404).json({ message: "Election not found" });
    }

    if (election.stage === "completed" || election.stage === "voting") {
      await SecurityLogger.log(
        "CANDIDATE_APPLICATION",
        voter,
        req,
        "FAILED",
        {
          reason: "Application period ended",
          electionId: electionId,
          electionStage: election.stage,
        },
        "LOW",
        "VOTING"
      );

      return res.status(400).json({
        message: "Application period has ended for this election",
      });
    }

    const position = election.positions.id(positionId);
    if (!position) {
      await SecurityLogger.log(
        "CANDIDATE_APPLICATION",
        voter,
        req,
        "FAILED",
        {
          reason: "Position not found",
          electionId: electionId,
          positionId: positionId,
        },
        "MEDIUM",
        "VOTING"
      );

      return res
        .status(404)
        .json({ message: "Position not found in this election" });
    }

    const existingApplication = await Candidate.findOne({
      email: voter.email,
      electionId: electionId,
    });

    if (existingApplication) {
      await SecurityLogger.log(
        "CANDIDATE_APPLICATION",
        voter,
        req,
        "FAILED",
        {
          reason: "Duplicate application",
          electionId: electionId,
          existingApplicationId: existingApplication._id,
          existingStatus: existingApplication.approvalStatus,
        },
        "MEDIUM",
        "VOTING"
      );

      return res.status(400).json({
        message: "You have already applied for this election",
        applicationStatus: existingApplication.approvalStatus,
      });
    }

    // Check position requirements
    if (position.requirements) {
      const { minGPA, minYear, department } = position.requirements;

      if (minGPA && voter.gpa < minGPA) {
        await SecurityLogger.log(
          "CANDIDATE_APPLICATION",
          voter,
          req,
          "FAILED",
          {
            reason: "GPA requirement not met",
            requiredGPA: minGPA,
            voterGPA: voter.gpa,
          },
          "LOW",
          "VOTING"
        );

        return res.status(400).json({
          message: `This position requires a minimum GPA of ${minGPA}`,
        });
      }

      if (minYear && voter.yearOfStudy < minYear) {
        await SecurityLogger.log(
          "CANDIDATE_APPLICATION",
          voter,
          req,
          "FAILED",
          {
            reason: "Year requirement not met",
            requiredYear: minYear,
            voterYear: voter.yearOfStudy,
          },
          "LOW",
          "VOTING"
        );

        return res.status(400).json({
          message: `This position requires minimum year ${minYear}`,
        });
      }

      if (department && voter.department !== department) {
        await SecurityLogger.log(
          "CANDIDATE_APPLICATION",
          voter,
          req,
          "FAILED",
          {
            reason: "Department requirement not met",
            requiredDepartment: department,
            voterDepartment: voter.department,
          },
          "LOW",
          "VOTING"
        );

        return res.status(400).json({
          message: `This position is only for ${department} students`,
        });
      }
    }

    const candidateApplication = new Candidate({
      firstName: voter.firstName,
      lastName: voter.lastName,
      studentId: voter.studentId,
      email: voter.email,
      phoneNumber: voter.phoneNumber || voter.mobileNumber,
      department: voter.department,
      college: voter.college,
      yearOfStudy: voter.yearOfStudy,
      gpa: voter.gpa,
      position: position.name,
      electionId: electionId,
      positionId: positionId,
      manifesto,
      qualifications,
      experience,
      socialLinks,
      campaignSlogan,
      approvalStatus: "pending",
      applicationStage: "review_pending",
      applicationSubmittedAt: new Date(),
      photoUrl: voter.photoUrl,
      registrationIP: req.ip,
      userAgent: req.get("User-Agent"),
    });

    await candidateApplication.save();

    // ✅ Log successful candidate application
    await SecurityLogger.log(
      "CANDIDATE_APPLICATION",
      voter,
      req,
      "SUCCESS",
      {
        candidateApplicationId: candidateApplication._id,
        electionId: electionId,
        positionId: positionId,
        position: position.name,
        electionTitle: election.title,
      },
      "MEDIUM",
      "VOTING"
    );

    res.status(201).json({
      message: "Candidate application submitted successfully",
      application: {
        id: candidateApplication._id,
        position: position.name,
        election: election.title,
        status: candidateApplication.approvalStatus,
        submittedAt: candidateApplication.applicationSubmittedAt,
      },
    });
  } catch (error) {
    console.error("applyAsCandidate error:", error);

    await SecurityLogger.log(
      "CANDIDATE_APPLICATION",
      req.voter,
      req,
      "FAILED",
      {
        reason: "System error",
        error: error.message,
        electionId: req.body?.electionId,
      },
      "High",
      "VOTING"
    );

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({ message: "Server error" });
  }
};

// Get voter's candidate applications
exports.getMyApplications = async (req, res) => {
  try {
    const voterId = req.voter.id;

    const voterOrCandidate =
      (await Voter.findById(voterId)) || (await Candidate.findById(voterId));
    if (!voterOrCandidate) {
      await SecurityLogger.log(
        "APPLICATIONS_VIEW",
        null,
        req,
        "FAILED",
        {
          reason: "Voter/Candidate not found",
          requestedId: voterId,
        },
        "MEDIUM",
        "VOTING"
      );

      return res.status(404).json({ message: "Voter or Candidate not found" });
    }

    const applications = await Candidate.find({
      email: voterOrCandidate.email.toLowerCase(),
    })
      .populate(
        "electionId",
        "title level startDate endDate status description stage candidateRegStart candidateRegEnd"
      )
      .sort({ createdAt: -1 });

    // ✅ Log applications view
    await SecurityLogger.log(
      "APPLICATIONS_VIEW",
      voterOrCandidate,
      req,
      "SUCCESS",
      {
        applicationsCount: applications.length,
        voterEmail: voterOrCandidate.email,
      },
      "LOW",
      "VOTING"
    );

    const formattedApplications = applications.map((app) => ({
      id: app._id,
      name: app.firstName + " " + app.lastName,
      email: app.email,
      qualifications: app.qualifications,
      experience: app.experience,
      socialLinks: app.socialLinks,
      campaignSlogan: app.campaignSlogan,
      contact: app.mobileNumber || app.phoneNumber,
      studentId: app.studentId,
      department: app.department,
      gpa: app.gpa,
      yearOfStudy: app.yearOfStudy,
      position: app.position,
      positionId: app.positionId,
      photoUrl: app.photoUrl,
      election: app.electionId
        ? {
            id: app.electionId._id,
            title: app.electionId.title,
            level: app.electionId.level,
            description: app.electionId.description,
            stage: app.electionId.stage,
            status: app.electionId.status,
            startDate: app.electionId.startDate,
            endDate: app.electionId.endDate,
            candidateRegStart: app.electionId.candidateRegStart,
            candidateRegEnd: app.electionId.candidateRegEnd,
          }
        : null,
      status: app.approvalStatus,
      submittedAt: app.applicationSubmittedAt,
      reviewedAt: app.approvedAt || app.rejectedAt,
      rejectionReason: app.rejectionReason,
      canCampaign:
        app.approvalStatus === "approved" &&
        app.electionId &&
        app.electionId.status === "campaign",
    }));

    res.json({
      message: "Applications retrieved successfully",
      applications: formattedApplications,
      summary: {
        total: applications.length,
        pending: applications.filter((a) => a.approvalStatus === "pending")
          .length,
        approved: applications.filter((a) => a.approvalStatus === "approved")
          .length,
        rejected: applications.filter((a) => a.approvalStatus === "rejected")
          .length,
      },
    });
  } catch (error) {
    console.error("getMyApplications error:", error);

    await SecurityLogger.log(
      "APPLICATIONS_VIEW",
      req.voter,
      req,
      "FAILED",
      {
        reason: "System error",
        error: error.message,
      },
      "MEDIUM",
      "VOTING"
    );

    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/voters/forum/my-questions
 * Get questions asked by the authenticated voter
 */
exports.getMyQuestions = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (!voter) {
      return res.status(404).json({ message: "Voter not found" });
    }

    // Find questions asked by this voter
    const questions = await ForumQuestion.find({ voter: voter._id })
      .populate("candidate", "firstName lastName position")
      .populate("election", "title")
      .sort({ createdAt: -1 });

    await SecurityLogger.log({
      event: "Forum Activity",
      user: voter.email,
      userId: voter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Retrieved my questions from forum",
      severity: "Low",
      category: "Forum",
      metadata: {
        questionCount: questions.length,
      },
    });

    res.json({
      success: true,
      message: "Questions retrieved successfully",
      questions: questions.map((q) => ({
        id: q._id,
        title:
          q.question.substring(0, 60) + (q.question.length > 60 ? "..." : ""),
        content: q.question,
        candidateName: `${q.candidate.firstName} ${q.candidate.lastName}`,
        candidatePosition: q.candidate.position,
        electionTitle: q.election?.title || "General",
        status: q.status,
        answer: q.answer,
        createdAt: q.createdAt,
        answeredAt: q.answeredAt,
        timeAgo: getTimeAgo(q.createdAt),
      })),
    });
  } catch (error) {
    console.error("Error fetching my questions:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * POST /api/voters/forum/ask-question
 * Ask a question to a candidate
 */
exports.askQuestion = async (req, res) => {
  try {
    const { candidateId, electionId, question } = req.body;

    // Validate required fields
    if (!candidateId || !question) {
      return res.status(400).json({
        success: false,
        message: "Candidate ID and question are required",
      });
    }

    if (question.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Question must be at least 10 characters long",
      });
    }

    if (question.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Question must be less than 1000 characters",
      });
    }

    const voter = await Voter.findById(req.voter.id);
    if (!voter) {
      return res.status(404).json({
        success: false,
        message: "Voter not found",
      });
    }

    // Verify candidate exists
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
      });
    }

    // Check if election exists (if provided)
    let election = null;
    if (electionId) {
      election = await Election.findById(electionId);
      if (!election) {
        return res.status(404).json({
          success: false,
          message: "Election not found",
        });
      }
    }

    // Check rate limiting - max 5 questions per day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const questionsToday = await ForumQuestion.countDocuments({
      voter: voter._id,
      createdAt: { $gte: today },
    });

    if (questionsToday >= 5) {
      await SecurityLogger.log({
        event: "Forum Activity",
        user: voter.email,
        userId: voter._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Question rate limit exceeded",
        severity: "Medium",
        category: "Forum",
        metadata: {
          questionsToday: questionsToday,
          limit: 5,
          targetCandidateId: candidateId,
        },
      });

      return res.status(429).json({
        success: false,
        message:
          "You can only ask 5 questions per day. Please try again tomorrow.",
      });
    }

    // Create the question
    const forumQuestion = await ForumQuestion.create({
      voter: voter._id,
      candidate: candidateId,
      election: electionId || null,
      question: sanitizeString(question.trim()),
      status: "pending",
    });

    // Populate the created question
    const populatedQuestion = await ForumQuestion.findById(forumQuestion._id)
      .populate("voter", "firstName lastName")
      .populate("candidate", "firstName lastName position")
      .populate("election", "title");

    // Log the activity
    await SecurityLogger.log({
      event: "Forum Activity",
      user: voter.email,
      userId: voter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Question asked to candidate",
      severity: "Low",
      category: "Forum",
      metadata: {
        questionId: forumQuestion._id,
        targetCandidateId: candidateId,
        electionId: electionId,
        questionLength: question.length,
      },
    });

    // Optional: Send notification email to candidate
    try {
      const candidateVoter = await Voter.findOne({ email: candidate.email });
      if (candidateVoter) {
        await sendEmail(
          candidate.email,
          "New Question from Voter - SmartVote",
          `You have received a new question from ${voter.firstName} ${voter.lastName}`,
          `
          <h2>New Question Received!</h2>
          <p>Dear ${candidate.firstName},</p>
          <p>You have received a new question from <strong>${voter.firstName} ${voter.lastName}</strong>:</p>
          <blockquote style="background: #f3f4f6; padding: 15px; border-left: 4px solid #2563eb;">
            ${question}
          </blockquote>
          <p>Please log in to your candidate dashboard to respond.</p>
          <a href="${process.env.FRONTEND_URL}/candidate/dashboard" 
             style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Answer Question
          </a>
          `
        );
      }
    } catch (emailError) {
      console.error("Failed to send question notification:", emailError);
    }

    res.status(201).json({
      success: true,
      message: "Question submitted successfully",
      question: {
        id: populatedQuestion._id,
        content: populatedQuestion.question,
        candidateName: `${populatedQuestion.candidate.firstName} ${populatedQuestion.candidate.lastName}`,
        status: populatedQuestion.status,
        createdAt: populatedQuestion.createdAt,
        electionTitle: populatedQuestion.election?.title,
      },
    });
  } catch (error) {
    console.error("Error asking question:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * GET /api/voters/forum/recent
 * Get recent forum discussions (public)
 */
exports.getRecentDiscussions = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get recent answered questions (public)
    const recentQuestions = await ForumQuestion.find({
      status: "answered",
      answer: { $exists: true, $ne: null },
    })
      .populate("voter", "firstName lastName")
      .populate("candidate", "firstName lastName position")
      .populate("election", "title")
      .sort({ answeredAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      discussions: recentQuestions.map((q) => ({
        id: q._id,
        title:
          q.question.substring(0, 60) + (q.question.length > 60 ? "..." : ""),
        content: q.question,
        author: {
          name: `${q.voter.firstName} ${q.voter.lastName}`,
          type: "Voter",
        },
        candidate: {
          name: `${q.candidate.firstName} ${q.candidate.lastName}`,
          position: q.candidate.position,
        },
        electionTitle: q.election?.title,
        replyCount: q.answer ? 1 : 0,
        timeAgo: getTimeAgo(q.answeredAt || q.createdAt),
        status: q.status,
      })),
    });
  } catch (error) {
    console.error("Error fetching recent discussions:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Helper function to sanitize string input
// function sanitizeString(str) {
//   return str
//     .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove scripts
//     .replace(/<[^>]*>/g, "") // Remove HTML tags
//     .trim();
// }

// Helper function for time formatting
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return new Date(date).toLocaleDateString();
}

module.exports = exports;
