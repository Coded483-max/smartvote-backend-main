const SecurityLog = require("../models/securityLog.model");

class SecurityLogger {
  static getClientIP(req) {
    // ✅ Enhanced IP detection with multiple fallbacks

    // 1. Check X-Forwarded-For header (most common for proxies)
    const xForwardedFor = req.headers["x-forwarded-for"];
    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
      const ips = xForwardedFor.split(",").map((ip) => ip.trim());
      const clientIP = ips[0]; // First IP is the original client
      if (clientIP && clientIP !== "unknown") {
        return this.cleanIP(clientIP);
      }
    }

    // 2. Check other common proxy headers
    const headers = [
      "x-real-ip", // Nginx
      "x-client-ip", // Apache
      "cf-connecting-ip", // Cloudflare
      "true-client-ip", // Akamai
      "x-cluster-client-ip", // Cluster
      "x-forwarded", // General
      "forwarded-for", // RFC 7239
      "forwarded", // RFC 7239
    ];

    for (const header of headers) {
      const ip = req.headers[header];
      if (ip && ip !== "unknown") {
        return this.cleanIP(ip);
      }
    }

    // 3. Express built-in IP (works when trust proxy is set)
    if (req.ip && req.ip !== "::1") {
      return this.cleanIP(req.ip);
    }

    // 4. Connection-level IP addresses
    const connectionIPs = [
      req.connection?.remoteAddress,
      req.socket?.remoteAddress,
      req.info?.remoteAddress,
    ];

    for (const ip of connectionIPs) {
      if (ip && ip !== "::1") {
        return this.cleanIP(ip);
      }
    }

    // 5. Default fallback
    return "127.0.0.1";
  }

  static cleanIP(ip) {
    if (!ip) return "127.0.0.1";

    // ✅ Handle IPv6 mapped IPv4 addresses
    if (ip.startsWith("::ffff:")) {
      ip = ip.substring(7);
    }

    // ✅ Handle common localhost variations
    if (ip === "::1") return "127.0.0.1"; // IPv6 localhost
    if (ip === "127.0.0.1") return "127.0.0.1"; // IPv4 localhost

    // ✅ Remove port numbers if present
    if (ip.includes(":") && !ip.includes("::")) {
      ip = ip.split(":")[0];
    }

    // ✅ Validate IP format (basic check)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    if (ipv4Regex.test(ip) || ipv6Regex.test(ip)) {
      return ip;
    }

    // ✅ If all else fails, return localhost
    return "127.0.0.1";
  }

  // ✅ Debug method to see all IP sources
  static debugIP(req) {
    return {
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "x-real-ip": req.headers["x-real-ip"],
      "x-client-ip": req.headers["x-client-ip"],
      "cf-connecting-ip": req.headers["cf-connecting-ip"],
      "true-client-ip": req.headers["true-client-ip"],
      "req.ip": req.ip,
      "req.ips": req.ips,
      "connection.remoteAddress": req.connection?.remoteAddress,
      "socket.remoteAddress": req.socket?.remoteAddress,
      detected: this.getClientIP(req),
    };
  }

  static async getRecentLogs(filters = {}) {
    try {
      const {
        limit = 50,
        page = 1,
        severity,
        category,
        event,
        user,
        status,
        startDate,
        endDate,
        sortBy = "timestamp",
        sortOrder = "desc",
      } = filters;

      // Build query
      const query = {};

      if (severity) query.severity = severity;
      if (category) query.category = category;
      if (event) query.event = event;
      if (user) query.user = { $regex: user, $options: "i" };
      if (status) query.status = status;

      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build sort object
      const sortObj = {};
      sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Execute query
      const logs = await SecurityLog.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(); // Use lean() for better performance

      // Get total count for pagination
      const totalCount = await SecurityLog.countDocuments(query);

      return {
        logs,
        pagination: {
          current: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit)),
          hasNext: skip + parseInt(limit) < totalCount,
          hasPrev: parseInt(page) > 1,
        },
      };
    } catch (error) {
      console.error("❌ Error fetching recent logs:", error);
      throw error;
    }
  }

  // ✅ **Get Security Stats**
  static async getSecurityStats(timeframe = 24) {
    try {
      const startTime = new Date(Date.now() - timeframe * 60 * 60 * 1000);

      const stats = await SecurityLog.aggregate([
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
            highSeverityEvents: {
              $sum: { $cond: [{ $eq: ["$severity", "High"] }, 1, 0] },
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

      // Get category breakdown
      const categoryStats = await SecurityLog.aggregate([
        { $match: { timestamp: { $gte: startTime } } },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);

      // Get event breakdown
      const eventStats = await SecurityLog.aggregate([
        { $match: { timestamp: { $gte: startTime } } },
        {
          $group: {
            _id: "$event",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]);

      return {
        timeframe: `${timeframe} hours`,
        summary: stats[0] || {
          totalEvents: 0,
          successfulEvents: 0,
          failedEvents: 0,
          criticalEvents: 0,
          highSeverityEvents: 0,
          uniqueUsers: [],
          uniqueIPs: [],
          avgRiskScore: 0,
          unresolvedIncidents: 0,
        },
        categoryBreakdown: categoryStats,
        topEvents: eventStats,
      };
    } catch (error) {
      console.error("❌ Error fetching security stats:", error);
      throw error;
    }
  }

  // ✅ **Get Failed Login Attempts**
  static async getFailedLogins(timeframe = 24, limit = 50) {
    try {
      const startTime = new Date(Date.now() - timeframe * 60 * 60 * 1000);

      return await SecurityLog.find({
        event: "Failed Login Attempt",
        timestamp: { $gte: startTime },
      })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      console.error("❌ Error fetching failed logins:", error);
      throw error;
    }
  }

  // ✅ **Get High Risk Events**
  static async getHighRiskEvents(riskThreshold = 70, limit = 50) {
    try {
      return await SecurityLog.find({
        riskScore: { $gte: riskThreshold },
        resolved: false,
      })
        .sort({ riskScore: -1, timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      console.error("❌ Error fetching high risk events:", error);
      throw error;
    }
  }

  // ✅ **Get Logs by User**
  static async getLogsByUser(userId, limit = 50) {
    try {
      return await SecurityLog.find({ userId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      console.error("❌ Error fetching user logs:", error);
      throw error;
    }
  }

  // ✅ **Search Logs**
  static async searchLogs(searchTerm, limit = 50) {
    try {
      const query = {
        $or: [
          { user: { $regex: searchTerm, $options: "i" } },
          { details: { $regex: searchTerm, $options: "i" } },
          { event: { $regex: searchTerm, $options: "i" } },
          { ipAddress: { $regex: searchTerm, $options: "i" } },
        ],
      };

      return await SecurityLog.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      console.error("❌ Error searching logs:", error);
      throw error;
    }
  }

  static async log(logData) {
    try {
      // ✅ Validate required fields
      const requiredFields = ["event", "user", "status", "details", "category"];
      const missingFields = requiredFields.filter((field) => !logData[field]);

      if (missingFields.length > 0) {
        console.error(
          "❌ SecurityLogger: Missing required fields:",
          missingFields
        );
        return;
      }

      // ✅ Get IP address with fallback
      const ipAddress =
        logData.ipAddress || this.getClientIP(logData.req || {});

      const securityLog = new SecurityLog({
        event: logData.event,
        user: logData.user,
        userId: logData.userId || null,
        userType: logData.userType || "Unknown",
        ipAddress: ipAddress,
        userAgent: logData.userAgent || "Unknown",
        status: logData.status,
        details: logData.details,
        metadata: logData.metadata || {},
        severity: logData.severity || "Medium",
        category: logData.category,
        sessionId: logData.sessionId || null,
        endpoint: logData.endpoint || null,
        method: logData.method || null,
        responseCode: logData.responseCode || null,
        processingTime: logData.processingTime || null,
        riskScore: logData.riskScore || 0,
        tags: logData.tags || [],
        timestamp: new Date(),
      });

      await securityLog.save();
    } catch (error) {
      console.error("❌ Security logging failed:", error);
      // ✅ Log the problematic data for debugging
      console.error("❌ Failed log data:", {
        event: logData.event,
        user: logData.user,
        status: logData.status,
        details: logData.details,
        category: logData.category,
        userType: logData.userType,
      });
    }
  }
}

module.exports = SecurityLogger;
