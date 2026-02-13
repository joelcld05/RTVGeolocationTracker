import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

const schema = new Schema(
  {
    name: { type: String, unique: true, index: true },
    code: { type: String, unique: true, index: true },
    accessType: { type: Array<number>, index: true, default: [3] },
    originAllow: { type: Array<string>, index: true, default: [] },
    actions: { type: Array<string>, index: true, default: [] },
    superAccess: { type: Boolean, default: false },
    sysAccount: { type: Boolean, default: false },
    hd_role: { type: String, enum: ["SUPPORT", "USER"], default: "USER" },
    permissions: [
      {
        model: { type: String, index: true },
        global: {
          get: { type: Boolean, default: false },
          retrieve: { type: Boolean, default: false },
          view: { type: Boolean, default: false },
          edit: { type: Boolean, default: false },
          create: { type: Boolean, default: false },
          delete: { type: Boolean, default: false },
        },
        access: [
          {
            action: {
              type: String,
              enum: ["get", "retrieve", "view", "edit", "create", "delete"],
            },
            restrict: { type: Array<string> },
            restrictWay: { type: Boolean, default: false },
          },
        ],
      },
    ],
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

export type _RoleType = InferSchemaType<typeof schema> & ObjectIdExtendType;
export const UserRole = "USER";
export const AffiliateRole = "AFFILIATE";
export const PublicRole = "PUBLIC";
export const AdminRole = "ADMIN";
export const modelName = "_Role";
export default model(modelName, schema, modelName);
