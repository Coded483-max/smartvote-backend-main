const jwt = require("jsonwebtoken");
const { path } = require("../app");

// ✅ **Option A: Return token only (recommended)**
const generateToken = (userId, role = null, options = {}) => {
  const payload = {
    id: userId, // Use 'id' instead of 'userId' for consistency
    ...(role && { role }), // Include role if provided
  };

  const defaultOptions = {
    expiresIn: options.expiresIn || "24h",
    issuer: options.issuer || "smartvote-api",
    audience: options.audience || "smartvote-users",
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, defaultOptions);

  console.log("🔑 Token generated:", {
    userId,
    role,
    expiresIn: defaultOptions.expiresIn,
    tokenPreview: `${token.substring(0, 20)}...`,
  });

  return token;
};

// ✅ **Option B: Separate function that sets cookies**
const setTokenCookie = (res, token, cookieName = "token", options = {}) => {
  const defaultCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // ✅ Fixed condition
    sameSite: "lax", // ✅ Changed from 'strict' for better compatibility
    maxAge: options.maxAge || 24 * 60 * 60 * 1000, // 24 hours default
    ...options,
    path: options.path || "/", // Ensure path is set
  };

  res.cookie(cookieName, token, defaultCookieOptions);

  console.log(`🍪 Cookie set: ${cookieName}`, {
    httpOnly: defaultCookieOptions.httpOnly,
    secure: defaultCookieOptions.secure,
    sameSite: defaultCookieOptions.sameSite,
    maxAge: defaultCookieOptions.maxAge,
  });
};

module.exports = { generateToken, setTokenCookie };

// ✅ **For backward compatibility**
module.exports.default = generateToken;
