// routes/session.routes.js
const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/session.controller");

// ✅ Public routes (no authentication required)
router.get("/status", sessionController.getSessionStatus);

// ✅ Protected routes (require active session)
router.post("/refresh", sessionController.refreshSession);
router.post("/extend", sessionController.extendSession);
router.get("/access", sessionController.checkAccess);
router.get("/activity", sessionController.getSessionActivity);
router.post("/destroy", sessionController.destroySession);
router.get("/active", sessionController.getActiveSessions);

module.exports = router;
