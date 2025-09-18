const { body, param, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

const voteValidation = [
  body("electionId").isMongoId().withMessage("Invalid election ID"),
  body("votes").isArray({ min: 1, max: 20 }).withMessage("Invalid votes array"),
  body("votes.*.positionId").isMongoId().withMessage("Invalid position ID"),
  body("votes.*.candidateIds")
    .isArray({ min: 1, max: 10 })
    .withMessage("Invalid candidates"),
  body("useZKProof")
    .optional()
    .isBoolean()
    .withMessage("useZKProof must be boolean"),
  validateRequest,
];

module.exports = { voteValidation, validateRequest };
