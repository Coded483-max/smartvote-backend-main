const express = require("express");
const router = express.Router();
const electionDashboard = require("../dashboards/election.dashboard");
const { verifyAdmin } = require("../middlewares/auth.middleware");

/**
 * @swagger
 * /api/dashboard/elections/summary:
 *   get:
 *     summary: Get election statistics
 *     description: Returns total elections and count by status.
 *     responses:
 *       200:
 *         description: Summary data
 */
router.get("/summary", verifyAdmin, electionDashboard.getElectionSummary);

/**
 * @swagger
 * /api/dashboard/elections/status:
 *   get:
 *     summary: Get elections grouped by status
 *     description: Lists upcoming, ongoing, and completed elections.
 *     responses:
 *       200:
 *         description: Grouped elections
 */
router.get("/status", verifyAdmin, electionDashboard.getElectionsByStatus);

module.exports = router;
