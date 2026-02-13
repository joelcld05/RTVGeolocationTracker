import {
  getReqOrigin,
  FORBIDDEN,
  AUTH_ERROR,
  DATA_NOT_ACCESS,
  NO_VALID_ID,
  EXPIRED_SESSION,
  EXPIRED_SESSION_REFRESH,
  NO_SESSION,
  UNAUTHORIZED,
} from "@/utils";
import { Request, Response, NextFunction } from "express";
import { validateOpt } from "@/services/Authentication";
import _Role, { PublicRole } from "@/models/_Role";
import { body, param } from "express-validator";
import { isValidObjectId } from "mongoose";
import { _UserType } from "@/models/_User";
import { ExtractJwt } from "passport-jwt";
import { isEmpty } from "lodash";
import passport from "passport";
import config from "@/config";
import axios from "axios";

type ActionsList =
  | "ADMIN_USER_ACCESS"
  | "POOL_EXECUTION"
  | "DELETE_USER_DATA"
  | "DISTRIBUTION_EXECUTION"
  | "DELETE_CONTRACT_FILES"
  | "CREATE_CONTRACT_FILES"
  | "TRANSFER_BALANCE_ADMIN"
  | "RETURN_INVESTMENT"
  | "UPDATE_POOL_DATA"
  | "UPDATE_REFERRAL_DATA"
  | "MAKE_BALANCE_TRANSFER"
  | "CREATE_SYS_ACCOUNT_PROFILE"
  | "UPDATE_INVESTMENT_CONFIG"
  | "MAKE_TAX_RETURN"
  | "FIX_INVESTMENT"
  | "WEB3_FUNCTION_EXCECUTION";

function mapAuthError(info: any, isRefresh = false) {
  const err = String(info || "");
  if (!err) {
    return null;
  }
  if (err.includes("TokenExpiredError")) {
    return isRefresh ? EXPIRED_SESSION_REFRESH : EXPIRED_SESSION;
  }
  return NO_SESSION;
}

export function getRequestUser(req: Request): _UserType {
  if (!req.user) throw AUTH_ERROR;
  return req?.user;
}

export function isValidObjectIdParam(attr: string) {
  return param(attr)
    .notEmpty()
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw NO_VALID_ID;
      }
      return true;
    });
}

export function isValidObjectIdBody(attr: string) {
  return body(attr)
    .notEmpty()
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw NO_VALID_ID;
      }
      return true;
    });
}

export const checkRoleFromUser = async (
  userIn: _UserType | undefined,
  mustHave: Array<number>,
) => {
  let userRole = [];
  const filter: any = !isEmpty(userIn)
    ? { _id: { $in: userIn._roles } }
    : { code: PublicRole };
  userRole = await _Role
    .find({
      ...filter,
      accessType: { $in: mustHave },
    })
    .cache(config.cache.time);
  return userRole.length > 0;
};

export const checkActionsFromUser = async (
  userIn: _UserType | undefined,
  mustHave: Array<string>,
) => {
  let userRole = [];
  const filter: any = !isEmpty(userIn)
    ? { _id: { $in: userIn._roles } }
    : { code: PublicRole };
  userRole = await _Role
    .find({
      ...filter,
      actions: { $in: mustHave },
    })
    .cache(config.cache.time);
  return userRole.length > 0;
};

function passportCb(req: Request, res: Response, next: NextFunction) {
  return function (error: any, user: any, info: any) {
    const mappedError = mapAuthError(info, false);
    if (mappedError) return res.status(UNAUTHORIZED).json(mappedError);
    if (!user?.session) return res.status(UNAUTHORIZED).json(EXPIRED_SESSION);
    req.user = user;
    return next();
  };
}

function passportRefreshCb(req: Request, res: Response, next: NextFunction) {
  return function (error: any, user: any, info: any) {
    const mappedError = mapAuthError(info, true);
    if (mappedError) return res.status(UNAUTHORIZED).json(mappedError);
    if (!user?.session) {
      return res.status(UNAUTHORIZED).json(EXPIRED_SESSION_REFRESH);
    }
    req.user = user;
    return next();
  };
}

export const _auth = (req: Request, res: Response, next: NextFunction) => {
  return passport.authenticate(
    "jwt",
    { session: false },
    passportCb(req, res, next),
  )(req, res, next);
};

export const _auth_refresh = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  return passport.authenticate(
    "jwt",
    { session: false },
    passportRefreshCb(req, res, next),
  )(req, res, next);
};

export const _authOrPublic = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let token: string | null = null;
  try {
    token = await ExtractJwt.fromAuthHeaderWithScheme("Bearer")(req);
    if (!token) {
      req.user = undefined;
      return next();
    }
  } catch (error) {}
  return passport.authenticate(
    "jwt",
    { session: false },
    passportCb(req, res, next),
  )(req, res, next);
};

export const _checkRoles = (mustHave: Array<number>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const hasaccess = await checkRoleFromUser(user, mustHave);
    if (hasaccess) {
      return next();
    } else {
      return res.sendStatus(FORBIDDEN);
    }
  };
};

export const _checkRoleAction = (mustHave: Array<ActionsList>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    const hasaccess = await checkActionsFromUser(user, mustHave);
    if (hasaccess) {
      next();
    } else {
      res.sendStatus(FORBIDDEN);
    }
  };
};

export const checkRoleForOriginAllow = async (
  userIn: _UserType,
  req: Request,
) => {
  let userRole = [];
  const origin = getReqOrigin(req);
  const filter: any = !isEmpty(userIn)
    ? { _id: { $in: userIn._roles } }
    : { name: PublicRole };
  userRole = await _Role
    .find({ ...filter, originAllow: { $in: [origin] } })
    .cache(config.cache.time);
  return userRole.length > 0;
};

export const validateRequestOPT = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (isEmpty(req.body["opt_token"]) && isEmpty(req.body["opt_time"])) {
      throw "";
    }
    const { opt_token, opt_time } = req.body;
    const reqUser: any = req.user;
    const delta: any = validateOpt(
      reqUser?.otp_base32,
      opt_token,
      opt_time,
    ).validation;
    if (delta) {
      next();
    } else {
      throw "";
    }
  } catch (error) {
    return res.status(FORBIDDEN).json(DATA_NOT_ACCESS);
  }
};

export const googlerecapcha = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (isEmpty(req.body["g-recaptcha-response"])) {
    return res.status(FORBIDDEN).json(DATA_NOT_ACCESS);
  }

  const secretKey = `${config.security.recapcha_key}`;
  const verificationUrl =
    "https://www.google.com/recaptcha/api/siteverify?secret=" +
    secretKey +
    "&response=" +
    req.body["g-recaptcha-response"] +
    "&remoteip=" +
    req?.ip;

  try {
    const rs: any = await axios(verificationUrl, {
      method: "POST",
    });

    if (rs.success) {
      next();
    } else {
      throw null;
    }
  } catch (error) {
    return res.status(FORBIDDEN).json(DATA_NOT_ACCESS);
  }
};
