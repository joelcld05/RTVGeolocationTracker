import { MessageResponse } from "@/utils/types";

export const OK = 200;
export const CREATED = 201;
export const ACCEPTED = 202;
export const NON_AUTHORITATIVE_INFORMATION = 203;
export const NO_CONTENT = 204;
export const BAD_REQUEST = 400;
export const UNAUTHORIZED = 401;
export const FORBIDDEN = 403;
export const NOT_FOUND = 404;
export const METHOD_NOT_ALLOWED = 405;
export const NOT_ACCEPTABLE = 406;
export const UNPROCESSABLE_ENTITY = 422;

export const NO_CONFIGURATION: MessageResponse = {
  message: "NO_CONFIGURATION",
  code: 10000,
};
export const FORM_INCOMPLETE: MessageResponse = {
  message: "MISSING_DATA",
  code: 10010,
};
export const TOO_MANY_ATTEMPTS: MessageResponse = {
  message: "TOO_MANY_ATTEMPTS",
  code: 10020,
};
export const ACTION_NOT_ALLOWED: MessageResponse = {
  message: "ACTION_NOT_ALLOWED",
  code: 10030,
};
export const DATA_VALIDATION: MessageResponse = {
  message: "DATA_VALIDATION",
  code: 10040,
};
export const NOT_FOUND_RESPONSE: MessageResponse = {
  message: "NOT_FOUND",
  code: 10050,
};

//permissions
export const DATA_NOT_ACCESS: MessageResponse = {
  message: "DATA_NOT_ACCESS",
  code: 10060,
};
export const NO_ACCESS_ALLOW: MessageResponse = {
  message: "NO_ACCESS_ALLOW",
  code: 10070,
};
export const NO_VALID_ID: MessageResponse = {
  message: "NO_VALID_ID",
  code: 10080,
};

export * from "./200-email";
export * from "./100-user";
