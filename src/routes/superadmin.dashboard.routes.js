const express = require("express");
const router = express.Router();
const { getSuperAdminDashboard } = require("../dashboards/superadmin.dashboard");
const { verifySuperAdmin } = require("../middlewares/auth.middleware");

/**
 * @swagger
 * /api/superadmin/dashboard:
 *   get:
 *     summary: Super Admin dashboard statistics
 *     description: Get full dashboard data including admin counts.
 *     responses:
 *       200:
 *         description: Dashboard data fetched successfully.
 */
router.get("/dashboard", verifySuperAdmin, getSuperAdminDashboard);

module.exports = router;
