const mongoose = require("mongoose");
const { Schema } = mongoose;

const positionTemplateSchema = new Schema(
  {
    level: {
      type: String,
      enum: ["departmental", "college", "university", "custom"],
      required: true,
    },
    levelSpecific: { type: String }, // e.g., "Computer Science" for departmental

    positions: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        defaultRequirements: {
          minGPA: { type: Number, min: 0, max: 4.0, default: 0 },
          minYear: { type: Number, default: 1 },
          additionalRequirements: [String],
        },
        order: { type: Number, default: 1 },
      },
    ],

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PositionTemplate", positionTemplateSchema);
