import { modelName as RouteModelName } from "@/models/Bus/routes";
import { modelName as UserModelName } from "@/models/_User";
import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

const DIRECTION_VALUES = ["FORWARD", "BACKWARD", "BOTH"] as const;
const PERMISSION_VALUES = ["MONITOR", "DISPATCH", "CONTROL"] as const;

export const schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: UserModelName,
      required: true,
      index: true,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      ref: RouteModelName,
      required: true,
      index: true,
    },
    directions: {
      type: [String],
      enum: DIRECTION_VALUES,
      default: ["BOTH"],
      required: true,
    },
    permissions: {
      type: [String],
      enum: PERMISSION_VALUES,
      default: ["MONITOR"],
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

schema.index({ userId: 1, routeId: 1 }, { unique: true });
schema.index({ userId: 1, active: 1 });
schema.index({ routeId: 1, active: 1 });

type RouteAdminScopeType = InferSchemaType<typeof schema> & ObjectIdExtendType;

const modelName = "bo_route_admin_scope";

export default model(modelName, schema, modelName);
export type { RouteAdminScopeType };
export { modelName };
