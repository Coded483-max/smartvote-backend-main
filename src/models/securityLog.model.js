const mongoose = require("mongoose");

const securityLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
    },
    event: {
      type: String,
      required: true,
      enum: [
        // ✅ Admin Events
        "Admin Login",
        "Admin Logout",
        "Super Admin Login",
        "Super Admin Logout",

        // ✅ Voter Authentication Events
        "Voter Login",
        "Voter Logout",
        "Voter Registration",
        "Email Verification",
        "Failed Login Attempt",

        // ✅ Password Management Events
        "Password Reset",
        "Password Reset Request",
        "Password Changed",

        // ✅ Profile Management Events
        "Profile Updated",
        "User Management", // ✅ Added - for general user management

        // ✅ Account Management Events
        "Account Locked",
        "Account Unlocked",
        "Voter Deactivated",
        "Voter Reactivated",
        "Voter Unverified",

        // ✅ Candidate Application Events
        "Candidate Registration", // ✅ Added - for candidate applications
        "Candidate Management", // ✅ Added - for candidate management operations
        "Candidate Approved",
        "Candidate Rejected",
        "Application Viewed",

        // ✅ Admin Management Events
        "Voter List Accessed",
        "Voter Details Accessed",
        "Voter Statistics Accessed",
        "Security Logs Accessed",
        "Data Access", // ✅ Added - for general data access

        // ✅ System Events
        "Permission Change",
        "System Settings Modified",
        "System Maintenance",
        "Data Export",
        "Backup Created",

        // ✅ Election Events
        "Election Management", // ✅ Added - for election management operations
        "Election Created",
        "Election Modified",
        "Voting Started",
        "Voting Ended",
        "Vote Cast",

        // ✅ Security Events
        "Suspicious Activity",
        "Multiple Failed Logins",
        "Invalid Access Attempt",
        "Rate Limit Exceeded",
        "Session Expired",

        // ✅ Error Events
        "System Error",
        "Database Error",
        "Validation Error",
        "Forum Activity",

        // ✅ Notification Events
        "Email Notification", // ✅ Added - for email notifications
        "Campaign Management",
      ],
    },
    user: {
      type: String,
      required: true, // Email or identifier
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userType",
    },
    userType: {
      type: String,
      enum: [
        "Admin",
        "Voter",
        "Super Admin",
        "super-admin",
        "Candidate",
        "System",
        "Public", // ✅ Added - for public/anonymous access
        "Unknown", // ✅ Added - for unknown user types
      ],
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "Success",
        "Failed",
        "Warning",
        "Critical",
        "Pending",
        "Blocked",
        "In Progress", // ✅ Added - for ongoing operations
        "Processing",
      ],
    },
    details: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Additional data
      default: {},
    },
    severity: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    category: {
      type: String,
      enum: [
        "Admin",
        "Authentication",
        "Authorization",
        "System",
        "Election",
        "Data",
        "Security",
        "Profile",
        "Application",
        "Candidate",
        "User",
        "Notification",
        "Campaign",
        "Forum",
      ],
      required: true,
    },

    // ✅ Additional Fields for Better Tracking
    sessionId: {
      type: String,
    },

    endpoint: {
      type: String,
    },

    method: {
      type: String,
      enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    },

    responseCode: {
      type: Number,
    },

    processingTime: {
      type: Number, // milliseconds
    },

    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    resolved: {
      type: Boolean,
      default: false,
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userType",
    },

    resolvedAt: {
      type: Date,
    },

    tags: {
      type: [String],
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Enhanced Indexes for Better Performance
securityLogSchema.index({ timestamp: -1 });
securityLogSchema.index({ event: 1, timestamp: -1 });
securityLogSchema.index({ user: 1, timestamp: -1 });
securityLogSchema.index({ status: 1, severity: 1 });
securityLogSchema.index({ category: 1, timestamp: -1 });
securityLogSchema.index({ sessionId: 1 });
securityLogSchema.index({ userId: 1, userType: 1 });
securityLogSchema.index({ ipAddress: 1, timestamp: -1 });
securityLogSchema.index({ riskScore: -1 });
securityLogSchema.index({ resolved: 1, severity: -1 });
securityLogSchema.index({ tags: 1 });

// ✅ Static Methods for Common Queries
securityLogSchema.statics.findByUser = function (userId, limit = 50) {
  return this.find({ userId }).sort({ timestamp: -1 }).limit(limit);
};

securityLogSchema.statics.findFailedLogins = function (timeframe = 24) {
  const startTime = new Date(Date.now() - timeframe * 60 * 60 * 1000);
  return this.find({
    event: "Failed Login Attempt",
    timestamp: { $gte: startTime },
  }).sort({ timestamp: -1 });
};

securityLogSchema.statics.findHighRiskEvents = function (riskThreshold = 70) {
  return this.find({
    riskScore: { $gte: riskThreshold },
    resolved: false,
  }).sort({ riskScore: -1, timestamp: -1 });
};

securityLogSchema.statics.getSecurityStats = function (timeframe = 24) {
  const startTime = new Date(Date.now() - timeframe * 60 * 60 * 1000);

  return this.aggregate([
    { $match: { timestamp: { $gte: startTime } } },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        successfulEvents: {
          $sum: { $cond: [{ $eq: ["$status", "Success"] }, 1, 0] },
        },
        failedEvents: {
          $sum: { $cond: [{ $eq: ["$status", "Failed"] }, 1, 0] },
        },
        criticalEvents: {
          $sum: { $cond: [{ $eq: ["$severity", "Critical"] }, 1, 0] },
        },
        uniqueUsers: { $addToSet: "$user" },
        uniqueIPs: { $addToSet: "$ipAddress" },
        avgRiskScore: { $avg: "$riskScore" },
        unresolvedIncidents: {
          $sum: { $cond: [{ $eq: ["$resolved", false] }, 1, 0] },
        },
      },
    },
  ]);
};

module.exports = mongoose.model("SecurityLog", securityLogSchema);
