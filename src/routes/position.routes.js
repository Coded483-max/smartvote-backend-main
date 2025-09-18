// routes/position.routes.js
const express = require("express");
const {
  getPositionsByLevel,
  createPositionTemplate,
} = require("../controllers/position.controller");
const {
  verifySuperAdmin,
  verifyAdmin,
} = require("../middlewares/auth.middleware");

const router = express.Router();

// Get available positions for a level (accessible by admins)
router.get("/by-level", verifyAdmin, getPositionsByLevel);

// Create position templates (super admin only)
router.post("/templates", verifySuperAdmin, createPositionTemplate);

module.exports = router;
