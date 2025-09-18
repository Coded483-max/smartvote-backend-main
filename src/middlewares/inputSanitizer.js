const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');

// Custom XSS sanitization function
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (typeof value === 'string') {
      obj[key] = xss(value);
    } else if (typeof value === 'object') {
      sanitizeObject(value); // Recursive for nested objects
    }
  });
};

// Custom combined sanitizer
const customSanitizer = (req, res, next) => {
  // Sanitize body and params only, NOT query
  if (req.body) sanitizeObject(req.body);
  if (req.params) sanitizeObject(req.params);

  // Use express-mongo-sanitize manually
  mongoSanitize.sanitize(req.body);
  mongoSanitize.sanitize(req.params);

  next();
};

module.exports = customSanitizer;
