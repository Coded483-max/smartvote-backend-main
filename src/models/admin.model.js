const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: ["super-admin", "admin"],
      default: "admin",
    },
    // ✅ **Add the missing isActive field**
    isActive: {
      type: Boolean,
      default: true, // New admins are active by default
    },
    // ✅ **Optional: Add more admin management fields**
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    permissions: [
      {
        type: String,
        enum: [
          "manage_elections",
          "manage_candidates",
          "manage_voters",
          "manage_admins",
          "view_reports",
          "system_settings",
        ],
      },
    ],
  },
  { timestamps: true }
);

// ✅ **Add virtual for full name**
adminSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ✅ **Add method to check if account is locked**
adminSchema.methods.isLocked = function () {
  return !!(this.lockedUntil && this.lockedUntil > Date.now());
};

// ✅ **Add method to increment login attempts**
adminSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockedUntil && this.lockedUntil < Date.now()) {
    return this.updateOne({
      $unset: {
        lockedUntil: 1,
      },
      $set: {
        loginAttempts: 1,
      },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = {
      lockedUntil: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    };
  }

  return this.updateOne(updates);
};

// ✅ **Reset login attempts on successful login**
adminSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: {
      loginAttempts: 1,
      lockedUntil: 1,
    },
    $set: {
      lastLogin: new Date(),
    },
  });
};

// Hash Password Before Saving
// adminSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   this.password = await bcrypt.hash(this.password, 10);
//   next();
// });

// ✅ **Don't return password in JSON**
adminSchema.methods.toJSON = function () {
  const admin = this.toObject();
  delete admin.password;
  delete admin.__v;
  return admin;
};

const Admin = mongoose.model("Admin", adminSchema);
module.exports = Admin;
