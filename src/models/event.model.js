const mongoose = require("mongoose");

const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    title:   { type: String, required: true, trim: true },
    dateTime:{ type: Date,   required: true },          // both date & time
    venue:   { type: String, required: true, trim: true },

    /* ——— Relationships ——— */
    candidate: { type: Schema.Types.ObjectId, ref: "Candidate", required: true },
    election:  { type: Schema.Types.ObjectId, ref: "Election",  required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);
