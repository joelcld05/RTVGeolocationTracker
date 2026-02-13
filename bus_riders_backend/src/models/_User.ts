import { modelName as _RoleModelName } from "@/models/_Role";
import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

import bcrypt from "bcrypt";

export const schema = new Schema(
  {
    _roles: [{ type: Schema.Types.ObjectId, ref: _RoleModelName }],
    _hashed_password: { type: String, required: true },
    _salt: { type: String },

    access: { type: [String], index: true, default: [] },
    username: { type: String, index: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      min: 6,
      max: 1024,
      index: true,
    },
    name: { type: String, required: true },

    valid: { type: Boolean, default: false },
    status: { type: Number, default: 0 },

    emailVerified: { type: Boolean, default: false },

    logged_with: {
      type: String,
      enum: ["password", "microsoft", "google", "admin-token"],
    },

    requestConfirmLink: { type: Date, default: Date.now },
    requestPasswordLink: { type: Date, default: Date.now },
    idPasswordConfirmation: { type: String, index: true },

    otp_last_verified: { type: Date, default: Date.now }, //just see
    otp_verified: { type: Boolean }, //just see
    otp_enabled: { type: Boolean }, //just see
    logInAttempts: { type: Number, default: 0 }, //just see

    blockedUser: { type: Boolean, default: false }, //not allowed to edit
    otp_auth_url: { type: String }, //not allowed to see
    otp_base32: { type: String }, //not allowed to see
    idEmailConfirmation: { type: String, index: true }, //not allowed to see
    idEmailChanging: { type: String, index: true }, //not allowed to see
    newEmail: { type: String, index: true }, //not allowed to see
    conected: { type: Boolean, default: false }, //not allowed to see
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);
schema.index({ created_at: 1 });
schema.index({ updated_at: 1 });
schema.pre("save", async function (next) {
  try {
    if (this.isModified("_hashed_password")) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(this._hashed_password, salt);
      this._hashed_password = hashedPassword;
      this._salt = salt;
    }
    next();
  } catch (error) {
    return next();
  }
});

schema.methods.isValidPassword = async function (password: string) {
  return await bcrypt.compare(password, this._hashed_password);
};

const modelName = "_User";
type _UserType = InferSchemaType<typeof schema> &
  ObjectIdExtendType & { role?: string };
export default model(modelName, schema, modelName);
export type { _UserType };
export { modelName };
