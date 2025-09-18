const SecurityLogger = require("../services/securityLogger");
const SecurityLogs = require("../models/securityLog.model");
const PDFDocument = require("pdfkit");

const BlockedIP = require("../models/blockedIp.model");

exports.getSecurityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      severity,
      category,
      event,
      user,
      status,
      startDate,
      endDate,
      sortBy = "timestamp",
      sortOrder = "desc",
    } = req.query;

    // ✅ Log security logs access
    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Security logs accessed by admin",
      severity: "Medium",
      category: "Data",
      metadata: {
        endpoint: "/api/security-logs",
        filters: {
          page,
          limit,
          severity,
          category,
          event,
          user,
          status,
          startDate,
          endDate,
          sortBy,
          sortOrder,
        },
        accessedBy: req.admin?.email,
      },
    });

    // ✅ Get logs using the SecurityLogger method
    const result = await SecurityLogger.getRecentLogs({
      page,
      limit,
      severity,
      category,
      event,
      user,
      status,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    });

    // ✅ Extract logs array from the result object
    const logs = result.logs || [];
    const pagination = result.pagination || {};

    // ✅ Format the logs for response
    const formattedLogs = logs.map((log) => ({
      id: log._id,
      timestamp: log.timestamp,
      event: log.event,
      user: log.user,
      userId: log.userId,
      userType: log.userType,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      status: log.status,
      details: log.details,
      severity: log.severity,
      category: log.category,
      metadata: log.metadata,
      sessionId: log.sessionId,
      endpoint: log.endpoint,
      method: log.method,
      responseCode: log.responseCode,
      processingTime: log.processingTime,
      riskScore: log.riskScore,
      resolved: log.resolved,
      tags: log.tags,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
    }));

    res.json({
      message: "Security logs retrieved successfully",
      logs: formattedLogs,
      pagination: pagination,
      filters: {
        severity,
        category,
        event,
        user,
        status,
        startDate,
        endDate,
        sortBy,
        sortOrder,
      },
      totalRecords: pagination.total || 0,
    });
  } catch (error) {
    console.error("Error fetching security logs:", error);

    // ✅ Log the error
    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Security logs access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/security-logs",
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({
      message: "Error fetching security logs",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ **Get Security Stats**
exports.getSecurityStats = async (req, res) => {
  try {
    const { timeframe = 24 } = req.query;

    // ✅ Log security stats access
    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Security statistics accessed by admin",
      severity: "Medium",
      category: "Data",
      metadata: {
        endpoint: "/api/security-logs/stats",
        timeframe: timeframe,
        accessedBy: req.admin?.email,
      },
    });

    const stats = await SecurityLogger.getSecurityStats(parseInt(timeframe));

    res.json({
      message: "Security statistics retrieved successfully",
      stats: stats,
    });
  } catch (error) {
    console.error("Error fetching security stats:", error);

    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Security statistics access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/security-logs/stats",
        error: error.message,
      },
    });

    res.status(500).json({
      message: "Error fetching security statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ **Search Security Logs**
exports.searchSecurityLogs = async (req, res) => {
  try {
    const { q: searchTerm, limit = 50 } = req.query;

    if (!searchTerm) {
      return res.status(400).json({ message: "Search term is required" });
    }

    // ✅ Log search access
    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Security logs search performed by admin",
      severity: "Medium",
      category: "Data",
      metadata: {
        endpoint: "/api/security-logs/search",
        searchTerm: searchTerm,
        limit: limit,
        accessedBy: req.admin?.email,
      },
    });

    const logs = await SecurityLogger.searchLogs(searchTerm, parseInt(limit));

    const formattedLogs = logs.map((log) => ({
      id: log._id,
      timestamp: log.timestamp,
      event: log.event,
      user: log.user,
      ipAddress: log.ipAddress,
      status: log.status,
      details: log.details,
      severity: log.severity,
      category: log.category,
      metadata: log.metadata,
    }));

    res.json({
      message: "Security logs search completed successfully",
      searchTerm: searchTerm,
      results: formattedLogs,
      count: formattedLogs.length,
    });
  } catch (error) {
    console.error("Error searching security logs:", error);

    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Security logs search failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/security-logs/search",
        searchTerm: req.query.q,
        error: error.message,
      },
    });

    res.status(500).json({
      message: "Error searching security logs",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ **Get Failed Login Attempts**
exports.getFailedLogins = async (req, res) => {
  try {
    const { timeframe = 24, limit = 50 } = req.query;

    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Failed login attempts accessed by admin",
      severity: "Medium",
      category: "Data",
      metadata: {
        endpoint: "/api/security-logs/failed-logins",
        timeframe: timeframe,
        limit: limit,
        accessedBy: req.admin?.email,
      },
    });

    const failedLogins = await SecurityLogger.getFailedLogins(
      parseInt(timeframe),
      parseInt(limit)
    );

    res.json({
      message: "Failed login attempts retrieved successfully",
      timeframe: `${timeframe} hours`,
      failedLogins: failedLogins,
      count: failedLogins.length,
    });
  } catch (error) {
    console.error("Error fetching failed logins:", error);

    await SecurityLogger.log({
      event: "Security Logs Accessed",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: req.admin?.role || "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Failed",
      details: "Failed login attempts access failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/security-logs/failed-logins",
        error: error.message,
      },
    });

    res.status(500).json({
      message: "Error fetching failed login attempts",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ Get Threat Alerts dynamically
exports.getThreatAlerts = async (req, res) => {
  try {
    // 1. Look for multiple failed logins in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const failedAttempts = await SecurityLogs.aggregate([
      {
        $match: {
          event: "Login Attempt",
          status: "Failed",
          timestamp: { $gte: fiveMinutesAgo },
        },
      },
      {
        $group: {
          _id: "$ipAddress",
          count: { $sum: 1 },
          latestTimestamp: { $max: "$timestamp" },
        },
      },
      { $match: { count: { $gte: 5 } } }, // threshold: 5 failed attempts
    ]);

    // 2. Convert results into alerts
    const alerts = failedAttempts.map((attempt) => ({
      id: attempt._id,
      type: "failed_login",
      severity: "High",
      description: "Multiple Failed Login Attempts",
      ipAddress: attempt._id,
      details: `${attempt.count} attempts in last 5 minutes`,
      timestamp: attempt.latestTimestamp,
      actions: ["Block IP"],
    }));

    // Example: system scan complete (static for now)
    alerts.push({
      id: "scan_1",
      type: "scan_complete",
      severity: "Low",
      description: "System Scan Complete",
      details: "No threats detected - Last scan: 2 hours ago",
      timestamp: new Date(),
      actions: ["View Report"],
    });

    res.json({
      message: "Threat alerts retrieved successfully",
      alerts,
    });
  } catch (error) {
    console.error("Error fetching threat alerts:", error);
    res.status(500).json({ message: "Error fetching threat alerts" });
  }
};

// ✅ Get all blocked IPs
exports.getBlockedIPs = async (req, res) => {
  try {
    const blockedIPs = await BlockedIP.find().sort({ blockedAt: -1 });

    res.json({
      message: "Blocked IPs retrieved successfully",
      blockedIPs,
    });
  } catch (error) {
    console.error("Error fetching blocked IPs:", error);
    res.status(500).json({ message: "Error fetching blocked IPs" });
  }
};

exports.getSecurityOverview = async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Total login attempts (last 24h)
    const loginAttempts = await SecurityLogs.countDocuments({
      event: "Login Attempt",
      timestamp: { $gte: last24h },
    });

    // Failed logins (last 24h)
    const failedLogins = await SecurityLogs.countDocuments({
      event: "Login Attempt",
      status: "Failed",
      timestamp: { $gte: last24h },
    });

    // Active sessions (could be tracked differently, but example using logs)
    const activeSessions = await SecurityLogs.distinct("sessionId", {
      event: "Login Success",
      timestamp: { $gte: last24h },
    });

    // Security Score (simple calculation → success vs failures ratio)
    const successLogins = loginAttempts - failedLogins;
    const securityScore =
      loginAttempts > 0
        ? Math.round((successLogins / loginAttempts) * 100)
        : 100;

    res.json({
      message: "Security overview retrieved successfully",
      overview: {
        loginAttempts,
        failedLogins,
        activeSessions: activeSessions.length,
        securityScore,
      },
    });
  } catch (error) {
    console.error("Error fetching security overview:", error);

    await SecurityLogger.log({
      event: "Security Overview Fetch Failed",
      user: req.admin?.email || "Unknown",
      status: "Failed",
      severity: "High",
      category: "System",
      details: "Error fetching security overview",
      metadata: { error: error.message },
    });

    res.status(500).json({ message: "Error fetching security overview" });
  }
};

exports.generateSecurityReport = async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 📊 Metrics
    const loginAttempts = await SecurityLogs.countDocuments({
      event: "Login Attempt",
      timestamp: { $gte: last24h },
    });

    const failedLogins = await SecurityLogs.countDocuments({
      event: "Login Attempt",
      status: "Failed",
      timestamp: { $gte: last24h },
    });

    const activeSessions = await SecurityLogs.distinct("sessionId", {
      event: "Login Success",
      timestamp: { $gte: last24h },
    });

    const successLogins = loginAttempts - failedLogins;
    const securityScore =
      loginAttempts > 0
        ? Math.round((successLogins / loginAttempts) * 100)
        : 100;

    // 📊 Top 5 failed IPs
    const topFailedIPs = await SecurityLogs.aggregate([
      {
        $match: {
          event: "Login Attempt",
          status: "Failed",
          timestamp: { $gte: last24h },
        },
      },
      {
        $group: {
          _id: "$ipAddress",
          attempts: { $sum: 1 },
        },
      },
      { $sort: { attempts: -1 } },
      { $limit: 5 },
    ]);

    // 📄 PDF generation
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=security-report.pdf"
    );
    doc.pipe(res);

    // Header
    doc.fontSize(18).text("Security Report", { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Date: ${new Date().toLocaleString()}`);
    doc.moveDown();

    // Summary stats
    doc.fontSize(14).text("Summary Metrics", { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(12).text(`Login Attempts (24h): ${loginAttempts}`);
    doc.text(`Failed Logins (24h): ${failedLogins}`);
    doc.text(`Active Sessions: ${activeSessions.length}`);
    doc.text(`Security Score: ${securityScore}%`);
    doc.moveDown();

    // Top failed IPs
    doc.fontSize(14).text("Top Failed IPs (24h)", { underline: true });
    doc.moveDown(0.5);

    if (topFailedIPs.length > 0) {
      doc.fontSize(12).text("IP Address          Attempts", { bold: true });
      doc.moveDown(0.3);

      topFailedIPs.forEach((ip) => {
        doc.text(`${ip._id || "Unknown"}          ${ip.attempts}`);
      });
    } else {
      doc.text("No failed login attempts in the last 24 hours.");
    }

    doc.end();
  } catch (error) {
    console.error("Error generating security report:", error);
    res.status(500).json({ message: "Error generating security report" });
  }
};
