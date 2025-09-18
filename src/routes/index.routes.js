const express = require("express");
const router = express.Router();
const healthController = require("../controllers/health.controller");

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check API health status
 *     description: Simple health check endpoint to check if the API is running.
 *     responses:
 *       200:
 *         description: API is running.
 */
router.get("/health", healthController.checkHealth);

module.exports = router;
