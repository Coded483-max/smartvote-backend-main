

const { validationResult } = require("express-validator");

module.exports = function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(422).json({
    message: "Validation failed",
    errors: errors.array().map(({ param, msg }) => ({ field: param, msg })),
  });
};
