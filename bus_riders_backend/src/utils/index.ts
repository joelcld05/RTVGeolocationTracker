import mongoose, { Schema, Types } from "mongoose";
import { Request } from "express";
import cache from "memory-cache";

/**
 * name: @toObjectId
 */

function splitString(str: string) {
  const middle = Math.ceil(str.length / 2);
  const s2 = str.slice(middle);
  return s2;
}

function binarySearch(arr: Array<any>, attrName: string, target: string) {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const guess = arr[mid];
    if (guess[attrName] === target) {
      return guess;
    } else if (guess[attrName] > target) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return {};
}

function toObjectId(
  key?: string | Schema.Types.ObjectId | Types.ObjectId | undefined,
) {
  if (key) return new mongoose.Types.ObjectId(`${key}`);
  else return new mongoose.Types.ObjectId();
}

function getCache(key: string) {
  return cache.get(key);
}

function setCache(key: string, value: any) {
  cache.put(key, value);
}

function getReqOrigin(req: Request): string | undefined {
  if (process.env.ENVIROMENT === "dev") {
    return req.get("host");
  }
  if (req.get("origin")) {
    const url: string = req.get("origin") || "";
    const domain = new URL(url);
    return domain.hostname;
  }
  return req.get("host");
}

function getMainDomain(hostname: string | undefined) {
  const parts = (hostname || "").split(".");
  if (parts.length > 2) {
    return parts.slice(-2).join(".");
  }
  return hostname;
}

function wait(milleseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milleseconds));
}
function clean_string(s: string) {
  return s
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

export * from "./common";
export * from "./helpers/NumberToLetter";
export * from "./helpers/dataFromating";
export * from "./helpers/errorHandling";

export {
  setCache,
  getCache,
  binarySearch,
  getReqOrigin,
  wait,
  getMainDomain,
  toObjectId,
  splitString,
  clean_string,
};
