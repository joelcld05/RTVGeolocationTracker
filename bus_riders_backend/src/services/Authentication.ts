import {
  TOO_MANY_ATTEMPTS,
  NO_SESSION,
  UNAUTHORIZED,
  OTP_AUTH_INVALID,
  USER_BLOCKED,
  toObjectId,
} from "@/utils";
import {
  Strategy as JWTStrategy,
  ExtractJwt,
  VerifiedCallback,
} from "passport-jwt";
import { Strategy as LocalStrategy } from "passport-local";
import { randomBytes, createHmac } from "crypto";
import base32, { encode } from "hi-base32";
import _Sessions from "@/models/_Sessions";
import _Role, { PublicRole } from "@/models/_Role";
import _User from "@/models/_User";
import { Request } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { TOTP } from "otpauth";

class Authentication {
  constructor() {
    passport.use(
      new LocalStrategy(
        {
          usernameField: "email",
          passwordField: "_hashed_password",
        },
        async function (email: string, password: string, done: any) {
          try {
            const user: any = await _User
              .findOne({ email: email.toLocaleLowerCase() })
              .populate("_roles");

            if (!user) return done(null, false, UNAUTHORIZED);
            if (user?.logInAttempts >= 10)
              return done(null, false, TOO_MANY_ATTEMPTS);

            const isValidPassword = await user.isValidPassword(password);
            if (isValidPassword) {
              if (user?.otp_enabled) user.otp_verified = false;
              user.logInAttempts = 0;
              user.role = user?._roles[0]?.code || PublicRole;
              user.hd_role = user?._roles[0]?.hd_role || "USER";
              delete user._roles;
              await user.save();
              return done(null, user, { message: "Logged In Successfully" });
            } else {
              user.$inc("logInAttempts", 1);
              await user.save();
              return done(null, false, UNAUTHORIZED);
            }
          } catch (error) {
            done(null, false, { message: "Incorrect password" });
          }
        },
      ),
    );

    passport.use(
      new JWTStrategy(
        {
          jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme("Bearer"),
          secretOrKey: `${process.env.APP_ID}`,
          passReqToCallback: true,
        },
        async function (req: any, jwtPayload: any, cb: VerifiedCallback) {
          try {
            const user = await findSession(req, jwtPayload, req?.is_refresh);
            if (!user) throw NO_SESSION;
            if (
              user?.otp_enabled &&
              !user?.otp_verified &&
              !req?.over_write_opt
            )
              throw OTP_AUTH_INVALID;
            if (user?.blockedUser) throw USER_BLOCKED;
            return cb(null, user);
          } catch (err) {
            return cb(err);
          }
        },
      ),
    );
  }
}

const createSession = async (
  req: Request,
  userId: any,
  data: any,
  isRefresh?: boolean,
) => {
  try {
    if (!userId || !data?.token || !data?.refresh) throw NO_SESSION;

    const extractSignature = (token: string) => token.split(".")[2];
    const tokenSignature = extractSignature(data.token);
    const refreshSignature = extractSignature(data.refresh);
    if (!tokenSignature || !refreshSignature) throw NO_SESSION;

    const sessionUserId = toObjectId(userId);
    const { session: sessionId, ...rest } = data;
    const sessionPayload = {
      ...rest,
      token: tokenSignature,
      refresh: refreshSignature,
      refresh_active: true,
      active: true,
      ip: req?.ip || "",
      userId: sessionUserId,
    };

    if (isRefresh) {
      const refreshFilter = sessionId
        ? {
            _id: toObjectId(sessionId),
            userId: sessionUserId,
            active: true,
            refresh_active: true,
          }
        : {
            userId: sessionUserId,
            refresh: refreshSignature,
            active: true,
            refresh_active: true,
          };

      const { matchedCount } = await _Sessions.updateOne(
        refreshFilter,
        sessionPayload,
      );
      if (!matchedCount) throw NO_SESSION;
    } else {
      await _Sessions.updateMany(
        { userId: sessionUserId },
        { active: false, refresh_active: false },
      );
      await _Sessions.create([sessionPayload]);
    }

    return true;
  } catch (error) {
    throw NO_SESSION;
  }
};

const findSession = async (req: Request, data: any, isRefresh?: boolean) => {
  const token = ExtractJwt.fromAuthHeaderWithScheme("Bearer")(req);
  const tokenSignature = token?.split(".")[2];
  if (!tokenSignature || !data?._id) throw NO_SESSION;

  const userId = toObjectId(data._id);
  const sessionFilter = isRefresh
    ? { userId, refresh: tokenSignature, refresh_active: true }
    : { userId, token: tokenSignature, active: true };

  const session: any = await _Sessions
    .findOne(sessionFilter)
    .populate("userId")
    .lean();
  if (!session?._id) {
    const cleanupFilter = isRefresh
      ? { userId, refresh_active: true }
      : { userId, active: true };
    const cleanupUpdate = isRefresh
      ? { refresh_active: false }
      : { active: false };
    await _Sessions.updateMany(cleanupFilter, cleanupUpdate);
    throw NO_SESSION;
  }

  const roleId = session.userId?._roles?.[0];
  const role = roleId
    ? await _Role.findOne({ _id: roleId }).cache("15M").lean()
    : null;

  return {
    ...session.userId,
    session: String(session._id),
    role: role?.code || PublicRole,
    hd_role: role?.hd_role || "USER",
  };
};

const signToken = (userIn: any, opt_verification = false) => {
  let objTosign = userIn;
  const serverTime = Number(new Date());
  objTosign.serverTime = serverTime;

  if (opt_verification && userIn?.otp_enabled) {
    objTosign = {
      _id: userIn._id,
      otp_last_verified: userIn.otp_last_verified,
      otp_verified: false,
      otp_enabled: userIn.otp_enabled,
    };
  }

  const expiresIn = 1800 * 2;
  const formatedUser = JSON.parse(JSON.stringify(objTosign));
  const token = jwt.sign(formatedUser, process.env.APP_ID || "", {
    expiresIn: expiresIn,
  });
  const refresh = jwt.sign(
    { _id: formatedUser._id, serverTime, is_refresh: true },
    process.env.APP_ID || "",
    {
      expiresIn: 86400,
    },
  );

  return { token, refresh };
};

const decodeToken = (string_token: string) => {
  const decoded = jwt.verify(`${string_token}`, process.env.APP_ID || "");
  return decoded;
};

const generateRandomBase32 = () => {
  const buffer = randomBytes(15);
  const base32 = encode(buffer).replace(/=/g, "").substring(0, 24);
  return base32;
};

const validateOpt = (
  otp_base32: string,
  token: string,
  time: number,
  email = "",
) => {
  const totp = new TOTP({
    issuer: "bus-riders",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: otp_base32,
  });
  const top = totp.validate({
    token: token.trim(),
    timestamp: time,
    window: 1,
  });
  const is_valid: boolean = top === 0 || top === -1;
  return { validation: is_valid, otpauth_url: totp.toString() };
};

const generateHOTP = (secret: string, counter: number) => {
  const decodedSecret = base32.decode.asBytes(secret.toUpperCase());
  const buffer = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    buffer[7 - i] = counter & 0xff;
    counter = counter >> 8;
  }
  const hmac = createHmac("sha1", Buffer.from(decodedSecret));
  hmac.update(buffer);
  const hmacResult: any = hmac.digest();

  const offset: any = hmacResult[hmacResult.length - 1] & 0xf;

  const code =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  return code % 10 ** 6;
};

const generateTOTP = (secret: string, window = 0) => {
  const counter = Math.floor(Date.now() / 30000);
  return generateHOTP(secret, counter + window);
};

export default Authentication;

export {
  signToken,
  createSession,
  validateOpt,
  generateRandomBase32,
  generateTOTP,
  decodeToken,
};
