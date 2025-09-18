const express = require("express");
const router = express.Router();
const { getAdminDashboard } = require("../dashboards/admin.dashboard");
const { verifyAdmin } = require("../middlewares/auth.middleware");

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Admin dashboard statistics
 *     description: Get total voters, candidates, elections, active elections, and pending candidates.
 *     responses:
 *       200:
 *         description: Dashboard data fetched successfully.
 */
router.get("/dashboard", verifyAdmin, getAdminDashboard);

module.exports = router;
