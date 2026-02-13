import {
  OK,
  BAD_REQUEST,
  DATA_NOT_ACCESS,
  checkReqDataError,
  checkReqBodyInput,
  queryFormatting,
  NOT_FOUND_RESPONSE,
  toObjectId,
} from "@/utils";

import { _auth, _checkRoles, checkRoleFromUser } from "@/middleware/auth";

import { NextFunction, Request, Response, Router } from "express";

import _ModelRepo from "@/services/repository/_ModelRepo";
import KycModel, { modelName } from "@/models/User/user_data";
import { sendEmail } from "@/libs/Mailer";
import { check } from "express-validator";
import { relations } from "@/models";

import _User from "@/models/_User";
import { isEmpty } from "lodash";

class UserDataController {
  baseRoute = "/user";
  rt = Router();

  routes() {
    this.rt.route(`${this.baseRoute}`).put(this.update).get(this.get);
    return this.rt;
  }

  approve = [
    _auth,
    _checkRoles([0, 1]),
    check("id").notEmpty(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const adminUser = req.user;
        const user: any = await _User.findOne({ _id: toObjectId(id) });
        await user.save();
        const repo = new _ModelRepo(modelName, adminUser);
        await repo.updateOne({
          data: { ...req.body },
          filter: { $and: [{ userId: id }] },
        });

        res.status(OK).json({ sent: true });
      } catch (error) {
        console.error(error);
        res.status(BAD_REQUEST).json({ error });
      }
    },
  ];

  updateKyc = [
    _auth,
    _checkRoles([0, 1]),
    check("id").notEmpty(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const user: any = await _User.findOne({ _id: toObjectId(id) });

        const userToUpdate: any = await _User.findOne({ _id: toObjectId(id) });

        userToUpdate.valid = false;

        await userToUpdate.save();
        const repo = new _ModelRepo(modelName, req.user).systemAccess();
        const unsetData: any = {};
        for (const item in req.body.errorquestion) {
          unsetData[req.body.errorquestion[item]] = 1;
        }
        await repo.findOneAndUpdate(
          { userId: id },
          { $unset: unsetData, ...req.body },
        );
        await sendEmail(
          user?.email || "",
          "Hemos encontrado un error en los datos de tu cuenta",
          {},
          "user/makeachangekyc",
        );
        res.status(OK).json({ sent: true });
      } catch (error) {
        console.log("🚀 ~ error:", error);
        res.status(BAD_REQUEST).json({ error });
      }
    },
  ];

  get = [
    _auth,
    async (req: Request, res: Response) => {
      try {
        const { filter, populate, select } = queryFormatting(req.query);
        const repo = new _ModelRepo(modelName, req.user);
        const display = await checkRoleFromUser(req.user, [0, 1]);
        let data: any = [];
        if (display) {
          data = await repo.getMany({ filter, populate, select });
        } else {
          data = await repo.getOne({ filter, select });
        }
        res.status(OK).json(data);
      } catch (error) {
        res.status(BAD_REQUEST).json({ error });
      }
    },
  ];

  // getFile = [_auth, Bucket.getFile(modelName, "kyc", true)];

  update = [
    _auth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { filter } = queryFormatting(req.query);
        const repo = new _ModelRepo(modelName, req.user);
        const userInfo = await repo.getOne({
          filter,
          populate: [relations.user],
        });
        const makeUpdate = await checkRoleFromUser(req.user, [0, 1]);
        res.locals.idAdmin = makeUpdate;
        let validatAccess = false;

        if (validatAccess) throw DATA_NOT_ACCESS;
        next(null);
      } catch (error) {
        return res.status(BAD_REQUEST).json(error);
      }
    },
    checkReqBodyInput(modelName),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const { filter } = queryFormatting(req.query);
        const repo = new _ModelRepo(modelName, req.user);
        if (!res.locals?.idAdmin) delete req.body.userId;
        await repo.updateOne({
          data: req.body,
          filter,
          config: { upsert: true, new: true, setDefaultsOnInsert: true },
        });
        res.status(OK).json({ saved: true, data: req.body }).end();
      } catch (error) {
        res.status(BAD_REQUEST).json({ error, saved: false }).end();
      }
    },
  ];
}

export default new UserDataController();
