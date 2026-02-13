import { modelName as _UserModelName } from "@/models/_User";
import { model, Schema, InferSchemaType } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

export const schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: _UserModelName,
      index: true,
      require: false,
    },
    log: Object,
    requestId: { type: String, index: true },
    origin: { type: String },
    req_ip: { type: String },
    url: { type: String },
    data: { type: Object },
    headers: { type: Object },
    method: { type: String },
    query: { type: Object },
    param: { type: Object },
    timeTaken: { type: Number },
    memoryRssStart: { type: Number },
    memoryRssEnd: { type: Number },
    cpuUsageStartUser: { type: Number },
    cpuUsageStartSystem: { type: Number },
    cpuUsageEndUser: { type: Number },
    cpuUsageEndSystem: { type: Number },
    memoryHeapTotalStart: { type: Number },
    memoryHeapUsedStart: { type: Number },
    memoryHeapTotalEnd: { type: Number },
    memoryHeapUsedEnd: { type: Number },
    responseCode: { type: Number },
    responseData: { type: Object },
    startAt: { type: Date },
    endAt: { type: Date },
    // endEvent: { type: String },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

export const modelName = "app_logs";
export type AppLogsType = InferSchemaType<typeof schema> & ObjectIdExtendType;
export default model(modelName, schema, modelName);
