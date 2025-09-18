const express = require("express");
const router = express.Router();
const candidateDashboard = require("../dashboards/candidate.dashboard");

// Swagger (Optional for now)
/**
 * @swagger
 * /api/candidate-dashboard/{id}:
 *   get:
 *     summary: Get candidate dashboard
 *     description: View the candidate's personal dashboard details.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Candidate ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 */
router.get("/:id", candidateDashboard.getCandidateDashboard);

module.exports = router;
