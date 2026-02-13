import { modelName as _UserModelName } from "@/models/_User";
import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

const pointSchema = new Schema({
  type: {
    type: String,
    enum: ["Point"],
    required: true,
  },
  coordinates: {
    type: [[Number]],
    required: true,
  },
});

export const schema = new Schema(
  {
    access: { type: [String], index: true, default: [] },
    name: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    direction: { type: String, enum: ["FORWARD", "BACKWARD"] },
    start_point: {
      type: pointSchema,
      required: true,
    },
    end_point: {
      type: pointSchema,
      required: true,
    },
    route: {
      type: pointSchema,
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

type BusType = InferSchemaType<typeof schema> & ObjectIdExtendType;

const modelName = "bu_routes";
export default model(modelName, schema, modelName);
export type { BusType };
export { modelName };
