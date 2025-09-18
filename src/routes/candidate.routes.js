const express = require("express");
const router = express.Router();

const candidateCtrl = require("../controllers/candidate.controller");
const upload = require("../utils/fileUpload");

const {
  verifyAdmin,
  verifyVoterOrCandidate,
  verifyVoter,
} = require("../middlewares/auth.middleware");

const { authLimiter } = require("../middlewares/rateLimiter");
const { getMyApplications } = require("../controllers/voter.controller");

/* ───────────────────────── Multer error handler ───────────────────────── */
function multerErrorHandler(err, req, res, next) {
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File size too large. Max 5MB allowed." });
    }
    return res.status(400).json({ error: err.message });
  }
  next();
}

/* ───────────────────────── PUBLIC ROUTES (NO AUTH) ───────────────────────── */

// ✅ **Registration - no auth required**

const candidateUpload = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "transcript", maxCount: 1 },
  { name: "manifesto", maxCount: 1 },
  { name: "additionalDocs", maxCount: 5 },
]);

router.post(
  "/register",
  candidateUpload,
  multerErrorHandler,
  candidateCtrl.registerCandidate
);

router.post("/logout", candidateCtrl.logoutCandidate);

// ✅ **Check candidate status - no auth required**
router.post("/status", authLimiter, candidateCtrl.getCandidateStatus);

/* ───────────────────────── SPECIFIC ROUTES (BEFORE PARAMETERIZED) ───────────────────────── */

// ✅ **Campaign events - specific paths**
router.post(
  "/events",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.createEvent
);
router.get(
  "/events",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.listEvents
);

// ✅ **Campaign promises - specific paths**
router.post(
  "/promises/add",
  // authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.addPromise
);

router.get(
  "/promises",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.listPromises
);

// ✅ **File uploads - specific path**
router.post(
  "/documents",
  authLimiter,
  verifyVoterOrCandidate,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "transcript", maxCount: 1 },
    { name: "manifesto", maxCount: 1 },
  ]),
  candidateCtrl.uploadDocuments
);

// ✅ **Social links - specific path**
router.put(
  "/social-links",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.updateSocialLinks
);

// ✅ **ADMIN ROUTES - SPECIFIC PATHS FIRST**
// Get all candidates (MUST BE BEFORE /:candidateId)
router.get("/", verifyAdmin, candidateCtrl.getAllCandidates);

// ✅ **Debug route for testing auth (temporary)**
router.get("/debug-auth", verifyAdmin, (req, res) => {
  res.json({
    message: "Authentication successful",
    admin: {
      id: req.admin._id || req.admin.id,
      email: req.admin.email,
      role: req.admin.role,
    },
    timestamp: new Date().toISOString(),
  });
});

/* ───────────────────────── PARAMETERIZED ROUTES (MUST BE LAST) ───────────────────────── */

// ✅ **Admin parameterized routes**
router.patch(
  "/:id/approve",
  authLimiter,
  verifyAdmin,
  candidateCtrl.approveCandidate
);
router.patch(
  "/:id/reject",
  authLimiter,
  verifyAdmin,
  candidateCtrl.rejectCandidate
);
router.get(
  "/:id/status",
  authLimiter,
  verifyAdmin,
  candidateCtrl.adminGetCandidateStatus
);

// ✅ **Campaign events with IDs**
router.put(
  "/events/:eventId",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.updateEvent
);
router.delete(
  "/events/:eventId",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.deleteEvent
);

// ✅ **Campaign promises with IDs**
router.put(
  "/promises/:promiseId",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.updatePromise
);
router.delete(
  "/promises/:promiseId",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.deletePromise
);

// ✅ **Promise comments**
router.post(
  "/promises/:promiseId/comment",
  authLimiter,
  verifyVoter,
  candidateCtrl.commentOnPromise
);

// ✅ **Forum Q&A with candidate IDs**
router.post(
  "/:candidateId/questions",
  authLimiter,
  verifyVoter,
  candidateCtrl.askQuestion
);
router.get("/:candidateId/questions", authLimiter, candidateCtrl.listQuestions);

// ✅ **Answer questions with question IDs**
router.put(
  "/questions/:questionId/answer",
  authLimiter,
  verifyVoterOrCandidate,
  candidateCtrl.answerQuestion
);

// ✅ **Get single candidate - MUST BE ABSOLUTELY LAST**
router.get("/:candidateId", verifyAdmin, candidateCtrl.getCandidateById);

//Forum routes
router.get(
  "/forum/questions/pending",
  verifyVoterOrCandidate,
  candidateCtrl.getPendingQuestions
);
router.post(
  "/forum/questions/:questionId/answer",
  verifyVoterOrCandidate,
  candidateCtrl.answerForumQuestion
);
router.get(
  "/forum/questions/answered",
  verifyVoterOrCandidate,
  candidateCtrl.getAnsweredQuestions
);

router.get(
  "/forum/questions/stats",
  verifyVoterOrCandidate,
  candidateCtrl.getForumStats
);

// ✅ **Get single candidate profile (PUBLIC)**
router.get("/profile/:candidateId", candidateCtrl.getCandidateProfile);

// ✅ **Get candidate's stats (PUBLIC)**
// router.get("/:candidateId/vote-stats", candidateCtrl.getCandidateVoteStats);

// ✅ **Get candidate's stats (PRIVATE)**
router.get(
  "/me/vote-stats",
  verifyVoterOrCandidate,
  candidateCtrl.getMyVoteStats
);
// router.get("/profile/:candidateId/events", candidateCtrl.getCandidateEventStats);

module.exports = router;
