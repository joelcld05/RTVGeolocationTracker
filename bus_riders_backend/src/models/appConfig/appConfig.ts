import { model, Schema, InferSchemaType } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

export const schema = new Schema(
  {
    name: { type: String, index: true },
    hostDomain: { type: String, index: true },
    subDomainApp: { type: String, index: true },
    subDomainAdmin: { type: String, index: true },

    language: {
      lang: { type: String, index: true },
      pages: {
        page: { type: String, index: true },
        translation: { type: Object },
      },
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

const modelName = "_Business";
export type AppConfigType = InferSchemaType<typeof schema> & ObjectIdExtendType;
export default model(modelName, schema, modelName);
export { modelName };
