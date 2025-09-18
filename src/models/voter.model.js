const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const voterSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },

    studentId: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{8}$/, "Student ID must be exactly 8 digits"],
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [
        /^[a-z0-9]+@st\.ug\.edu\.gh$/,
        "E-mail must be a valid University of Ghana student address",
      ],
    },

    mobileNumber: {
      type: String,
      required: true,
      match: [/^\+?[0-9\s]{10,15}$/, "Mobile number is invalid"],
    },

    role: {
      type: String,
      enum: ["voter", "candidate", "admin", "superadmin"],
      default: "voter",
    },

    /* ————————————————— Academic Information ————————————————— */
    department: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "Computer Science",
        "Information Technology",
        "Mathematics",
        "Statistics",
        "Physics",
        "Chemistry",
        "Biology",
        "Geology",
        "Geography",
        "Economics",
        "Political Science",
        "Sociology",
        "Psychology",
        "English",
        "French",
        "Akan",
        "History",
        "Philosophy",
        "Religious Studies",
        "Fine Arts",
        "Music",
        "Theatre Arts",
        "Dance",
        "Nursing",
        "Medicine",
        "Pharmacy",
        "Dentistry",
        "Veterinary Medicine",
        "Agriculture",
        "Food Science",
        "Engineering",
        "Architecture",
        "Planning",
        "Law",
        "Business",
        "Accounting",
        "Marketing",
        "Management",
        "Finance",
      ],
    },

    college: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "College of Basic And Applied Sciences",
        "College of Humanities",
        "College of Health Sciences",
        "College of Agriculture and Consumer Sciences",
        "College of Engineering",
        "School of Law",
        "Business School",
      ],
    },

    yearOfStudy: {
      type: String,
      required: true,
      enum: ["Level 100", "Level 200", "Level 300", "Level 400"],
    },
    password: { type: String, required: true, minlength: 6 },
    isVerified: { type: Boolean, default: false },

    verificationCode: {
      type: String,
      validate: {
        validator: function (value) {
          return this.isVerified || /^\d{6}$/.test(value);
        },
        message: "Verification code must be a 6-digit number.",
      },
      default: function () {
        return this.isVerified
          ? null
          : crypto.randomInt(100000, 1000000).toString(); // inclusive/exclusive bounds
      },
    },

    // Enhanced security fields
    verificationAttempts: { type: Number, default: 0 },
    lastVerificationAttempt: { type: Date },
    verificationLocked: { type: Boolean, default: false },
    verificationLockExpires: { type: Date },

    // Password reset security
    resetAttempts: { type: Number, default: 0 },
    lastResetAttempt: { type: Date },
    resetLocked: { type: Boolean, default: false },
    resetLockExpires: { type: Date },

    verificationCodeExpires: Date,

    /* ————————————————— Password reset ————————————————— */
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  { timestamps: true }
);

voterSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const Voter = mongoose.model("Voter", voterSchema);
module.exports = Voter;
