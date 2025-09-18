const express = require("express");
const securityLogsController = require("../controllers/securityLogs.controller");
const { verifySuperAdmin } = require("../middlewares/auth.middleware");

const router = express.Router();

// Get security logs (admin only)
router.get("/", verifySuperAdmin, securityLogsController.getSecurityLogs);

// Get security statistics (admin only)
router.get("/stats", verifySuperAdmin, securityLogsController.getSecurityStats);

router.get("/threats-alerts", securityLogsController.getThreatAlerts);

router.get("/security-overview", securityLogsController.getSecurityOverview);

// router.get("/export-logs", securityLogsController.exportSecurityLogs);
router.get("/security-report", securityLogsController.generateSecurityReport);
router.get("/blocked-ips", securityLogsController.getBlockedIPs);

module.exports = router;
