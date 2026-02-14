import { modelName as _UserModelName } from "@/models/_User";
import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

function isCoordinatePair(entry: unknown): boolean {
  if (!Array.isArray(entry) || entry.length < 2) {
    return false;
  }

  const lng = Number(entry[0]);
  const lat = Number(entry[1]);
  return Number.isFinite(lng) && Number.isFinite(lat);
}

function hasMinCoordinatePairs(value: unknown, minPairs: number): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  const pairs = value.filter((entry) => isCoordinatePair(entry));
  return pairs.length >= minPairs;
}

function createGeometrySchema(
  typeEnum: string[],
  minPairs: number,
  coordinatesLabel: string,
) {
  return new Schema(
    {
      type: {
        type: String,
        enum: typeEnum,
        required: true,
      },
      coordinates: {
        type: [[Number]],
        required: true,
        validate: {
          validator: (value: unknown) => hasMinCoordinatePairs(value, minPairs),
          message: `Invalid ${coordinatesLabel} coordinates`,
        },
      },
    },
    { _id: false },
  );
}

const pointSchema = createGeometrySchema(["Point"], 1, "point");
const routeLineSchema = createGeometrySchema(
  ["LineString", "Point"],
  2,
  "route",
);
const endZoneSchema = createGeometrySchema(["Polygon"], 3, "end_zone");

export const schema = new Schema(
  {
    access: { type: [String], index: true, default: [] },
    name: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    direction: { type: String, enum: ["FORWARD", "BACKWARD"] },
    // start_point: {
    //   type: pointSchema,
    //   required: true,
    // },
    // end_point: {
    //   type: pointSchema,
    //   required: true,
    // },
    route: {
      type: routeLineSchema,
      required: true,
    },
    end_zone: {
      type: endZoneSchema,
      required: false,
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
