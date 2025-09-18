const express = require("express");
const {
  registerVoter,
  verifyVoter,
  loginVoter,
  logoutVoter,
  updateVoterProfile,
  changeVoterPassword,
  forgotPassword,
  resetPassword,
  deactivateVoter,
  reactivateVoter,
  getAllVoters,
  getVoterById,
  applyAsCandidate,
  getMyApplications,
  askQuestion,
  listQuestions,
  getMyQuestions,
  getRecentDiscussions,

  unverifyVoter,
  getVoterStats,
} = require("../controllers/voter.controller");

const {
  allowOnlyAdminOrSuperAdmin,
  verifyVoter: verifyVoterMiddleware,
  verifyVoterOrCandidate,
} = require("../middlewares/auth.middleware");
const { authLimiter } = require("../middlewares/rateLimiter");

const { check } = require("express-validator");
const validate = require("../middlewares/validate"); // your existing helper

const router = express.Router();

/* ─────────────── Register ─────────────── */
router.post(
  "/register",

  [
    check("firstName").trim().notEmpty().withMessage("First name is required"),
    check("lastName").trim().notEmpty().withMessage("Last name is required"),
    check("studentId")
      .matches(/^\d{8}$/)
      .withMessage("Student ID must be exactly 8 digits"),
    check("email")
      .matches(/^[a-z0-9]+@st\.ug\.edu\.gh$/)
      .withMessage("Must use your UG school e-mail (@st.ug.edu.gh)"),
    check("mobileNumber")
      .isMobilePhone()
      .withMessage("Valid mobile number required"),
    check("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    check("confirmPassword")
      .custom((val, { req }) => val === req.body.password)
      .withMessage("Passwords do not match"),
  ],
  validate,
  registerVoter
);

/* ───────────── Email verification ───────────── */
router.post(
  "/verify",
  authLimiter,
  [
    check("email").isEmail().withMessage("E-mail is required"),
    check("code")
      .isLength({ min: 6, max: 6 })
      .withMessage("Code must be 6 digits"),
  ],
  validate,
  verifyVoter
);

/* ─────────────── Login ─────────────── */
router.post("/login", loginVoter);

/* ─────────────── Logout ─────────────── */
router.post("/logout", logoutVoter);

/* ───────────── Update profile ───────────── */
router.put("/profile", authLimiter, updateVoterProfile);

/* ───────────── Change password ───────────── */
router.put("/change-password", authLimiter, changeVoterPassword);

/* ─────────── Deactivate / Reactivate (admins) ─────────── */
router.put("/:voterId/deactivate", allowOnlyAdminOrSuperAdmin, deactivateVoter);
router.put("/:voterId/reactivate", allowOnlyAdminOrSuperAdmin, reactivateVoter);

/* ─────────── Forgot / Reset password ─────────── */
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword);

// Get all voters (with filtering and pagination)
router.get("/", allowOnlyAdminOrSuperAdmin, getAllVoters);

// Get voter statistics
router.get("/stats", allowOnlyAdminOrSuperAdmin, getVoterStats);

// Voter dashboard routes

router.get("/applications", verifyVoterOrCandidate, getMyApplications);
router.post("/apply-candidate", verifyVoterOrCandidate, applyAsCandidate);

// Get single voter
router.get("/:voterId", allowOnlyAdminOrSuperAdmin, getVoterById);

// Unverify voter
router.patch("/:voterId/unverify", allowOnlyAdminOrSuperAdmin, unverifyVoter);

router.post("/ask-question", verifyVoterOrCandidate, askQuestion);

// router.get("/questions", verifyVoterOrCandidate, listQuestions);

router.get("/questions/my-questions", verifyVoterOrCandidate, getMyQuestions);

router.get("/discussions/recent", verifyVoterOrCandidate, getRecentDiscussions);

module.exports = router;
