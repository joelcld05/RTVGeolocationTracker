import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";
import { modelName as _UserModelName } from "@/models/_User";

export const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: _UserModelName, index: true },
    deviceId: { type: String, index: true },
    token: { type: String, index: true, required: true },
    origin: { type: String, index: true },
    active: { type: Boolean, index: true, default: true },
    logged_with: {
      type: String,
      enum: ["password", "microsoft", "google", "admin-token"],
    },
    admin_access: {
      type: Schema.Types.ObjectId,
      ref: _UserModelName,
      index: true,
    },
    admin_token: { type: String, index: true },
    admin_active: { type: Boolean, index: true },
    refresh: { type: String, index: true, required: true },
    refresh_active: { type: Boolean, index: true, default: true },
    ip: { type: String, index: true, required: true },
    device: { type: Object },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

type SessionType = InferSchemaType<typeof schema> & ObjectIdExtendType;

const modelName = "_Session";
export default model(modelName, schema, modelName);
export { modelName };
export type { SessionType };
