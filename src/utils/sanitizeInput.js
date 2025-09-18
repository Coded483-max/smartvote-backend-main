const validator = require("validator");

/**
 * Sanitize and trim a string input
 * @param {string} input
 * @returns {string}
 */
function sanitizeString(input) {
  if (typeof input !== "string") return input;
  return validator.escape(validator.trim(input));
}

/**
 * Sanitize an email address
 * @param {string} email
 * @returns {string}
 */
function sanitizeEmail(email) {
  if (typeof email !== "string") return email;
  return validator.normalizeEmail(sanitizeString(email));
}

/**
 * Sanitize a phone number
 * @param {string} phone
 * @returns {string}
 */
function sanitizePhoneNumber(phone) {
  if (typeof phone !== "string") return phone;
  return validator.isMobilePhone(phone, 'any', { strictMode: false }) ? sanitizeString(phone) : phone;
}

/**
 * Sanitize an object recursively
 * @param {object} obj
 * @returns {object}
 */
function sanitizeObject(obj) {
  const sanitized = {};

  for (const key in obj) {
    if (typeof obj[key] === "string") {
      sanitized[key] = sanitizeString(obj[key]);
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitized[key] = sanitizeObject(obj[key]); // Recursively sanitize nested objects
    } else if (Array.isArray(obj[key])) {
      sanitized[key] = obj[key].map(item => sanitizeString(item)); // Handle arrays of strings
    } else {
      sanitized[key] = obj[key];
    }
  }

  return sanitized;
}

/**
 * Log sanitization actions for debugging
 * @param {string} action
 * @param {any} value
 */
function logSanitization(action, value) {
  console.log(`Sanitization Action: ${action}`, value);
}

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizeEmail,
  sanitizePhoneNumber,
  logSanitization
};
