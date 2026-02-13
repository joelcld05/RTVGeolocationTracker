import {
  checkReqDataError,
  calculateDiff,
  PASSWORD_NOT_CHANGED,
  AUTH_DOESNOT_EXIST,
  TOO_MANY_ATTEMPTS,
  PASSWORD_CHANGED,
  EMAIL_NOT_VERIFY,
  NO_ACCESS_ALLOW,
  EMAIL_NOT_SENT,
  USER_CREATED,
  UNAUTHORIZED,
  EMAIL_VERIFY,
  BAD_REQUEST,
  AUTH_ERROR,
  EMAIL_SENT,
  OK,
  toObjectId,
  USER_EXTERNAL_LINK,
  AUTH_EXIST,
  EMAIL_15_WAIT,
  NO_SESSION,
} from "@/utils";
import {
  _auth,
  _auth_refresh,
  _checkRoleAction,
  checkRoleForOriginAllow,
} from "@/middleware/auth";
import {
  createSession,
  decodeToken,
  signToken,
} from "@/services/Authentication";
import _Role, { AffiliateRole, PublicRole, UserRole } from "@/models/_Role";
import Bus from "@/models/Bus/bus";
import { Request, Response, Router, NextFunction } from "express";
import _ModelRepo from "@/services/repository/_ModelRepo";
import _User, { modelName } from "@/models/_User";
import _Sessions from "@/models/_Sessions";
import { sendEmail } from "@/libs/Mailer";
import { check } from "express-validator";
import { randomUUID } from "crypto";
import OtpController from "./otp";
import { isEmpty } from "lodash";
import passport from "passport";
import axios from "axios";

const ALLOWED_DIRECTIONS = new Set(["FORWARD", "BACKWARD"]);

function normalizeDirection(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!ALLOWED_DIRECTIONS.has(normalized)) {
    return null;
  }

  return normalized;
}

function buildMqttClaimsFromBus(bus: any): Record<string, unknown> {
  if (!bus?._id) {
    return {};
  }

  const busId = String(bus._id).trim();
  const routeDoc = bus?.route;
  const routeId = String(
    typeof routeDoc === "string"
      ? routeDoc
      : (routeDoc?._id ?? routeDoc?.id ?? ""),
  ).trim();
  const direction = normalizeDirection(routeDoc?.direction);

  if (!busId || !routeId || !direction) {
    return {};
  }

  const mqttClientId = busId.startsWith("BUS_") ? busId : `BUS_${busId}`;
  const publishTopic = `gps/${routeId}/${direction}/${busId}`;

  return {
    sub: busId,
    busId,
    username: mqttClientId,
    clientid: mqttClientId,
    routeId,
    direction,
    acl: {
      pub: [publishTopic],
      sub: [],
    },
  };
}

async function attachBusClaimsToTokenPayload(
  userId: unknown,
  payload: Record<string, unknown>,
) {
  const bus = await Bus.findOne({ userId }).populate("route");
  return {
    bus,
    tokenPayload: {
      ...payload,
      ...buildMqttClaimsFromBus(bus),
    },
  };
}

class AuthController {
  rt = Router();
  baseRoute = "/auth";

  routes() {
    this.rt.route(`${this.baseRoute}/refresh`).post(this.refreshUser);
    this.rt.route(`${this.baseRoute}/logout`).post(this.logout);

    this.rt.route(`${this.baseRoute}/login`).post(this.login);
    this.rt.route(`${this.baseRoute}/register`).post(this.register);

    this.rt.route(`${this.baseRoute}/password/reset`).post(this.resetPassword);
    this.rt
      .route(`${this.baseRoute}/password/change`)
      .post(this.changePassword);

    this.rt
      .route(`${this.baseRoute}/email/verification`)
      .post(this.resendEmailvarification);
    this.rt
      .route(`${this.baseRoute}/email/verify`)
      .post(this.emailvarification);

    this.rt
      .route(`${this.baseRoute}/email/change/verification`)
      .post(this.emailChangeVerification);
    this.rt
      .route(`${this.baseRoute}/email/change/verify`)
      .post(this.emailChangeVerify);

    this.rt.use(`${this.baseRoute}/`, OtpController.routes());

    return this.rt;
  }

  login = [
    check("email").notEmpty(),
    check("password").notEmpty(),
    checkReqDataError,
    (req: Request, res: Response) => {
      try {
        req.body._hashed_password = req.body.password;
        delete req.body.password;
        passport.authenticate(
          "local",
          { session: false },
          (err: any, user: any, message: any) => {
            if (err || !user) return res.status(BAD_REQUEST).json(message);
            req.login(user, { session: false }, async (err: any) => {
              if (err || user?.blockedUser)
                return res.status(BAD_REQUEST).send(AUTH_ERROR);
              try {
                const canAccess: boolean = await checkRoleForOriginAllow(
                  user,
                  req,
                );
                const instance = new _ModelRepo(modelName, user);
                if (!canAccess) {
                  return res.status(UNAUTHORIZED).json(NO_ACCESS_ALLOW);
                }

                if (user?.otp_enabled) {
                  user.otp_verified = false;
                  await user.save();
                }

                const logUserIn = await instance.saveParseObject(user._doc);
                logUserIn.role = user?._roles[0]?.code || PublicRole;
                logUserIn.hd_role = user?._roles[0]?.hd_role || "USER";
                const { tokenPayload, bus } = await attachBusClaimsToTokenPayload(
                  logUserIn._id,
                  logUserIn,
                );
                const token = signToken(tokenPayload, true);
                await createSession(req, user._id, {
                  ...token,
                  logged_with: "password",
                });
                res.status(OK).json({ ...token, bus });
              } catch (err) {
                console.log("🚀 ~ AuthController ~ err:", err);
                res.status(BAD_REQUEST).json(AUTH_ERROR);
              }
            });
          },
        )(req, res);
      } catch (error) {
        console.log(error);
        return res.status(BAD_REQUEST).json(AUTH_ERROR);
      }
    },
  ];

  registerWithGoogle = [
    check("accessToken").notEmpty(),
    check("token_type").notEmpty(),
    check("referral").optional().isString(),
    check("customerReferral").optional().isString(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        let gettinUser: any = await axios(
          `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${req.body.accessToken}`,
          {
            method: "GET",
            headers: {
              Authorization: `${req.body.token_type} ${req.body.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
        gettinUser = gettinUser.data;
        const email = gettinUser.email.toLowerCase();
        if (!gettinUser) return res.status(BAD_REQUEST).json(AUTH_ERROR);
        const userData = {
          name: [
            `${gettinUser?.given_name || ""}`,
            `${gettinUser?.family_name || ""}`,
          ].join(" "),
          email,
          id: gettinUser.id,
          logged_with: "google",
        };
        await this.doRegistration(userData, req, res);
      } catch (error) {
        return res.status(BAD_REQUEST).json(AUTH_ERROR);
      }
    },
  ];

  loginWithGoogle = [
    check("accessToken").notEmpty(),
    check("token_type").notEmpty(),
    check("referral").optional().isString(),
    check("customerReferral").optional().isString(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        let gettinUser: any = await axios(
          `https://www.googleapis.com/oauth2/v1/userinfo?access_token=${req.body.accessToken}`,
          {
            method: "GET",
            headers: {
              Authorization: `${req.body.token_type} ${req.body.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
        gettinUser = gettinUser.data;
        const email = gettinUser.email.toLowerCase();
        if (!gettinUser) return res.status(BAD_REQUEST).json(AUTH_ERROR);
        const userData = {
          name: [
            `${gettinUser?.given_name || ""}`,
            `${gettinUser?.family_name || ""}`,
          ].join(" "),
          email,
          id: gettinUser.id,
          logged_with: "google",
        };
        await this.doLogin(userData, req, res);
      } catch (error) {
        return res.status(BAD_REQUEST).json(AUTH_ERROR);
      }
    },
  ];

  register = [
    check("email").notEmpty().isEmail(),
    check("password").notEmpty(),
    check("name").notEmpty(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { email, password, name } = req.body;
        const ramdomNumber = randomUUID();
        const findRole = req.host.includes("affiliate")
          ? AffiliateRole
          : UserRole;
        const role = await _Role.findOne({ code: findRole });
        const newUser = new _ModelRepo(modelName, req.user);
        const lowerEmail = String(email).toLowerCase();
        const user = await newUser.create({
          idEmailConfirmation: ramdomNumber,
          requestConfirmLink: new Date(),
          _hashed_password: password,
          _roles: [role?._id],
          logged_with: "password",
          email: lowerEmail,
          username: name,
          name,
        });
        const newUserIntance = new _ModelRepo(modelName, user);
        const tokenTosign = await newUserIntance.saveParseObject(user._doc);
        const token = signToken(tokenTosign);
        await createSession(req, user._id, {
          ...token,
          logged_with: "password",
        });
        res.status(OK).json({ ...USER_CREATED, ...token, new_user: true });
      } catch (error: any) {
        res
          .status(BAD_REQUEST)
          .json(error?.code === 11000 ? AUTH_ERROR : { saved: false });
      }
    },
  ];

  resetPassword = [
    check("email").notEmpty().isEmail(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { email } = req.body;
        const user: any = await _User.findOne({ email });
        if (!user || calculateDiff(15, user.requestPasswordLink)) {
          return res.status(BAD_REQUEST).json(EMAIL_NOT_SENT);
        }

        const ramdomNumber = randomUUID();
        const host = req.get("origin") || "";
        user.idPasswordConfirmation = ramdomNumber;
        user.requestPasswordLink = new Date();
        await user.save();
        await sendEmail(
          user.email || "",
          "Cambio de Contraseña",
          { token: `${host}/changepassword?token=${ramdomNumber}` },
          "user/resetPassword",
        );
        return res.status(OK).json(EMAIL_SENT);
      } catch (error) {
        return res.status(BAD_REQUEST).json(AUTH_ERROR);
      }
    },
  ];

  changePassword = [
    check("password").notEmpty(),
    check("password_verify").notEmpty(),
    check("token").notEmpty().isUUID(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { token, password, password_verify } = req.body;
        const user: any = await _User.findOne({
          idPasswordConfirmation: token,
        });
        if (password_verify !== password || !user)
          return res.status(BAD_REQUEST).json(PASSWORD_NOT_CHANGED);
        user._hashed_password = password;
        user.idPasswordConfirmation = null;
        user.requestPasswordLink = new Date();
        user.requestPasswordLink = new Date();
        user.logged_with = "password";
        user.logInAttempts = 0;
        await user.save();
        return res.status(OK).json(PASSWORD_CHANGED);
      } catch (error) {
        return res.status(BAD_REQUEST).json(PASSWORD_NOT_CHANGED);
      }
    },
  ];

  resendEmailvarification = [
    _auth,
    async (req: Request, res: Response) => {
      try {
        const userRequest: any = req.user;
        const user: any = await _User.findOne({
          email: userRequest?.email,
          emailVerified: false,
        });
        if (!user || calculateDiff(15, user.requestConfirmLink))
          return res.status(BAD_REQUEST).json(EMAIL_15_WAIT);
        const ramdomNumber = randomUUID();
        user.idEmailConfirmation = ramdomNumber;
        user.requestConfirmLink = new Date();
        await user.save();

        await sendEmail(
          user.email || "",
          "Completa la verificación de tu correo electrónico",
          { token: ramdomNumber },
          "user/verifyemail",
        );
        return res.status(OK).json(EMAIL_SENT);
      } catch (error) {
        return res.status(BAD_REQUEST).json(EMAIL_NOT_VERIFY);
      }
    },
  ];

  emailvarification = [
    check("token").notEmpty().isUUID(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { token } = req.body;
        const user: any = await _User.findOne({
          idEmailConfirmation: token,
          emailVerified: false,
        });
        if (!user) return res.status(BAD_REQUEST).json(EMAIL_NOT_VERIFY);
        user.emailVerified = true;
        user.idEmailConfirmation = null;
        user.requestConfirmLink = new Date();
        await user.save();
        return res.status(OK).json(EMAIL_VERIFY);
      } catch (error) {
        return res.status(BAD_REQUEST).json(EMAIL_NOT_VERIFY);
      }
    },
  ];

  emailChangeVerification = [
    _auth,
    check("newEmail").notEmpty().isEmail(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { newEmail } = req.body;
        const reqUser: any = req.user;
        const lowerEmail = String(newEmail).toLowerCase();
        const user: any = await _User.findOne({ _id: reqUser?._id });
        const emailInUse = await _User.findOne({
          email: lowerEmail,
          _id: { $ne: user._id },
        });

        if (!user) return res.status(BAD_REQUEST).json(AUTH_ERROR);
        if (user.email === lowerEmail)
          return res.status(BAD_REQUEST).json(EMAIL_NOT_SENT);
        if (emailInUse) return res.status(BAD_REQUEST).json(AUTH_EXIST);
        if (user?.logged_with !== "password" && !isEmpty(user?.logged_with))
          return res.status(BAD_REQUEST).json(USER_EXTERNAL_LINK);
        if (calculateDiff(15, user.requestConfirmLink))
          return res.status(BAD_REQUEST).json(EMAIL_15_WAIT);
        const token = randomUUID();
        user.newEmail = newEmail;
        user.idEmailChanging = token;
        user.requestConfirmLink = new Date();
        await user.save();
        await sendEmail(
          user.email || "",
          "Confirma el cambio de tu correo electrónico",
          { token, newEmail: lowerEmail },
          "user/emailchange",
        );
        return res.status(OK).json(EMAIL_SENT);
      } catch (error) {
        return res.status(BAD_REQUEST).json(EMAIL_NOT_SENT);
      }
    },
  ];

  emailChangeVerify = [
    check("token").notEmpty().isUUID(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { token } = req.body;
        const user: any = await _User.findOne({ idEmailChanging: token });
        if (!user) return res.status(BAD_REQUEST).json(EMAIL_NOT_VERIFY);
        const emailInUse = await _User.findOne({
          email: user.newEmail,
          _id: { $ne: user._id },
        });
        if (emailInUse) return res.status(BAD_REQUEST).json(EMAIL_NOT_VERIFY);
        user.email = user.newEmail;
        user.newEmail = null;
        user.idEmailChanging = null;
        user.requestConfirmLink = new Date();
        await user.save();
        return res.status(OK).json(EMAIL_VERIFY);
      } catch (error) {
        return res.status(BAD_REQUEST).json(EMAIL_NOT_VERIFY);
      }
    },
  ];

  logout = [
    _auth,
    async (req: Request, res: Response) => {
      try {
        const reqUser: any = req.user;
        const sessionId = reqUser?.session;
        if (!sessionId) return res.status(BAD_REQUEST).json(NO_SESSION);
        await _Sessions.updateOne(
          {
            _id: toObjectId(sessionId),
            userId: toObjectId(reqUser?._id),
            active: true,
          },
          { active: false, admin_active: false },
        );
        return res.status(OK).json({ message: "LOGGED_OUT" });
      } catch (error) {
        return res.status(BAD_REQUEST).json(AUTH_ERROR);
      }
    },
  ];

  refreshUser = [
    (req: any, res: Response, next: NextFunction) => {
      req.over_write_opt = true;
      req.is_refresh = true;
      return next();
    },
    _auth_refresh,
    async (req: Request, res: Response) => {
      try {
        const authHeader = req.headers["authorization"];

        const refresh_token = authHeader && authHeader.split(" ")[1];
        const decode: any = decodeToken(`${refresh_token}`);
        const reqUser: any = req.user;

        if (!decode?.is_refresh) throw AUTH_ERROR;
        const user: any = await _User
          .findOne({ _id: reqUser?._id })
          .populate("_roles")
          .lean();
        const canAccess = await checkRoleForOriginAllow(user, req);
        if (!canAccess) return res.status(UNAUTHORIZED).json(NO_ACCESS_ALLOW);
        const userFetch = new _ModelRepo(modelName, reqUser);
        const userRefresh = await userFetch.saveParseObject(user);
        const opt_verification =
          await OtpController.validateOptVaerification(user);
        userRefresh.role = user?._roles[0]?.code || PublicRole;
        userRefresh.hd_role = user?._roles[0]?.hd_role || "USER";
        const { tokenPayload, bus } = await attachBusClaimsToTokenPayload(
          userRefresh._id,
          userRefresh,
        );
        const token = signToken(tokenPayload, opt_verification);
        await createSession(
          req,
          user._id,
          { ...token, session: reqUser.session },
          true,
        );
        return res.status(OK).json({ ...token, bus });
      } catch (error) {
        console.log("🚀 ~ AuthController ~ error:", error);
        return res.status(BAD_REQUEST).json(AUTH_ERROR);
      }
    },
  ];

  doRegistration = async (
    auth: { email: string; id: string; name: string; logged_with: string },
    req: any,
    res: any,
  ) => {
    const user: any = await _User
      .findOne({
        $or: [{ google_token: auth?.id }, { email: auth.email }],
      })
      .populate("_roles");
    if (!user) {
      const role = await _Role.findOne({ code: UserRole });
      const newUser: any = new _ModelRepo(modelName, req.user);
      const ramdomNumber = randomUUID();
      const user = await newUser.create({
        email: auth.email,
        _hashed_password: auth.id,
        name: auth.name,
        username: auth.name,
        google_token: auth.id,
        emailVerified: true,
        idEmailConfirmation: ramdomNumber,
        requestConfirmLink: new Date(),
        _roles: [role?._id],
      });

      const instance = new _ModelRepo(modelName, user);
      const registered = await instance.saveParseObject(user._doc);
      registered.role = role?.code || PublicRole;
      registered.hd_role = role?.hd_role || "USER";
      const { tokenPayload, bus } = await attachBusClaimsToTokenPayload(
        user._id,
        registered,
      );
      const token = signToken(tokenPayload);
      await createSession(req, user._id, {
        ...token,
        logged_with: auth.logged_with,
      });
      res.status(OK).json({ ...USER_CREATED, ...token, bus, new_user: true });
    } else {
      try {
        const canAccess = await checkRoleForOriginAllow(user, req);
        const userInstance = new _ModelRepo(modelName, user);
        if (!canAccess) return res.status(UNAUTHORIZED).json(NO_ACCESS_ALLOW);
        if (user?.otp_enabled) user.otp_verified = false;
        if (user?.logInAttempts >= 5)
          return res.status(UNAUTHORIZED).json(TOO_MANY_ATTEMPTS);
        user.logInAttempts = 0;
        await user.save();
        const logeded = await userInstance.saveParseObject(user._doc);
        logeded.role = user?._roles[0]?.code || PublicRole;
        logeded.hd_role = user?._roles[0]?.hd_role || "USER";
        const { tokenPayload, bus } = await attachBusClaimsToTokenPayload(
          user._id,
          logeded,
        );
        const token = signToken(tokenPayload, true);
        await createSession(req, user._id, {
          ...token,
          logged_with: auth.logged_with,
        });
        return res.status(OK).json({ ...token, bus, new_user: false });
      } catch (errsing) {
        throw errsing;
      }
    }
  };

  doLogin = async (
    auth: { email: string; id: string; name: string; logged_with: string },
    req: any,
    res: any,
  ) => {
    const user: any = await _User
      .findOne({
        $or: [{ google_token: auth?.id }, { email: auth.email }],
      })
      .populate("_roles");

    if (user) {
      if (user?.blockedUser)
        return res.status(UNAUTHORIZED).json(NO_ACCESS_ALLOW);
      try {
        const canAccess = await checkRoleForOriginAllow(user, req);
        const userInstance = new _ModelRepo(modelName, user);
        if (!canAccess) return res.status(UNAUTHORIZED).json(NO_ACCESS_ALLOW);
        if (user?.otp_enabled) user.otp_verified = false;
        if (user?.logInAttempts >= 5)
          return res.status(UNAUTHORIZED).json(TOO_MANY_ATTEMPTS);
        user.logInAttempts = 0;
        await user.save();
        const logeded = await userInstance.saveParseObject(user._doc);
        logeded.role = user?._roles[0]?.code || PublicRole;
        logeded.hd_role = user?._roles[0]?.hd_role || "USER";
        const { tokenPayload, bus } = await attachBusClaimsToTokenPayload(
          user._id,
          logeded,
        );
        const token = signToken(tokenPayload, true);
        await createSession(req, user._id, {
          ...token,
          logged_with: auth.logged_with,
        });
        return res.status(OK).json({ ...token, bus, new_user: false });
      } catch (errsing) {
        throw "";
      }
    } else {
      return res.status(BAD_REQUEST).json(AUTH_DOESNOT_EXIST);
    }
  };
}

export default new AuthController();
