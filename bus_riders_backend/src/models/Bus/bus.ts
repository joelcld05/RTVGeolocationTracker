import { modelName as _UserModelName } from "@/models/_User";
import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";
import Routes from "./routes";

export const schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: _UserModelName,
      index: true,
      unique: true,
      required: true,
    },
    route: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: Routes,
    },
    access: { type: [String], index: true, default: [] },
    status: { type: Number, index: true, default: -1, enum: [-1, 0, 1] },
    name: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    plate: { type: String, trim: true },
    phone: { type: String, trim: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

schema.index({ userId: 1 }, { unique: true });

type BusType = InferSchemaType<typeof schema> & ObjectIdExtendType;

const modelName = "bu_bus";
export default model(modelName, schema, modelName);
export type { BusType };
export { modelName };
