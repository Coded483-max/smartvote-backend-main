// src/routes/voter.dashboard.routes.js

const express = require("express");
const router = express.Router();
const { getVoterDashboardData } = require("../dashboards/voter.dashboard");
const { verifyVoter } = require("../controllers/voter.controller"); // Import verifyVoter from the voter controller

/**
 * @swagger
 * /api/voter/dashboard:
 *   get:
 *     summary: Get voter dashboard data
 *     description: Get the dashboard data for the authenticated voter.
 *     responses:
 *       200:
 *         description: Successfully fetched voter dashboard data.
 *       401:
 *         description: Unauthorized access.
 */
router.get("/dashboard", verifyVoter, getVoterDashboardData);

module.exports = router;
