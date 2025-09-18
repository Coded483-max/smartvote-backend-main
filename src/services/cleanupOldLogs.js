const SecurityLogger = require("../services/securityLogger");

// Run this daily
const cleanupOldLogs = async () => {
  try {
    const deleted = await SecurityLogger.cleanOldLogs(90); // Keep 90 days
    console.log(`🧹 Cleaned up ${deleted} old security logs`);
  } catch (error) {
    console.error("Log cleanup failed:", error);
  }
};

module.exports = { cleanupOldLogs };
