import {
  checkReqBodyInput,
  checkReqDataError,
  queryFormatting,
  BAD_REQUEST,
  OK,
} from "@/utils";
import { _checkRoleAction, _checkRoles } from "@/middleware/auth";
import { modelName as roleModel } from "@/models/_Role";
import _ModelRepo from "@/services/repository/_ModelRepo";
import { Request, Response, Router } from "express";
import { modelName } from "@/models/_User";
import { query } from "express-validator";
import { _auth } from "@/middleware/auth";

class UserController {
  rt = Router();
  baseRoute = "/user";

  routes() {
    this.rt.route(`${this.baseRoute}`).get(this.get).put(this.update);
    this.rt.route(`/users`).get(this.getMany);
    return this.rt;
  }

  get = [
    _auth,
    async (req: Request, res: Response) => {
      try {
        const { filter, select } = queryFormatting(req.query);
        const userData = new _ModelRepo(modelName, req.user);
        const filterOptions: any = { filter, select };
        const data = await userData.getOne(filterOptions);
        return res.status(OK).json(data);
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error });
      }
    },
  ];

  getMany = [
    _auth,
    _checkRoles([0, 1]),
    query("page").optional().isNumeric(),
    query("rows").optional().isNumeric(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const model = new _ModelRepo(modelName, req.user);
        const role = new _ModelRepo(roleModel, req.user);

        const roleModelItems: any = await role
          .systemAccess()
          .find({ accessType: { $in: [2] } })
          .select(["_id"]);

        const rsRoles = roleModelItems.map((r: any) => r._id);

        const filterOptions = queryFormatting(req.query, [
          { _roles: { $in: rsRoles } },
        ]);

        const data = await model.getMany(filterOptions);

        return res.status(OK).json(data);
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error });
      }
    },
  ];

  create = [];

  update = [
    _auth,
    checkReqBodyInput(modelName),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        // const user = getRequestUser(req);
        const { filter } = queryFormatting(req.query);
        const userData = new _ModelRepo(modelName, req.user);
        await userData.updateOne({ data: req.body, filter });
        return res.status(OK).json({ saved: true, data: req.body });
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error, saved: false });
      }
    },
  ];

  // deleteUser = [
  //   _auth,
  //   _checkRoleAction(["DELETE_USER_DATA"]),
  //   isValidObjectIdParam("id"),
  //   checkReqDataError,
  //   async (req: Request, res: Response) => {
  //     const dbSession = await startSession();
  //     dbSession.startTransaction();

  //     const abortWithError = async (error: any) => {
  //       await dbSession.abortTransaction();
  //       await dbSession.endSession();
  //       return res.status(BAD_REQUEST).json({ deleted: false, error });
  //     };

  //     try {
  //       const { id } = req.params;
  //       const userId = toObjectId(id);
  //       const userRepo = new _ModelRepo(modelName, req.user);
  //       const userModel = userRepo.systemAccess();
  //       const kycRepo = new _ModelRepo(KycMn, req.user);
  //       const kycModel = kycRepo.systemAccess();
  //       const user = await userModel
  //         .findOne({ _id: userId })
  //         .session(dbSession);
  //       if (!user) {
  //         return await abortWithError(NO_VALID_USER);
  //       }

  //       if (user.affiliate_enabled) {
  //         return await abortWithError({ message: "USER_AFFILIATE_ENABLED" });
  //       }

  //       const [
  //         hasInvestments,
  //         hasMovements,
  //         hasPreMovements,
  //         hasAffiliate,
  //         hasAffiliateUser,
  //       ] = await Promise.all([
  //         new _ModelRepo(InvestmentsMN, req.user)
  //           .systemAccess()
  //           .exists({ userId })
  //           .session(dbSession),
  //         new _ModelRepo(MovementsTrxMN, req.user)
  //           .systemAccess()
  //           .exists({ userId })
  //           .session(dbSession),
  //         new _ModelRepo(PreMovementsTrxMN, req.user)
  //           .systemAccess()
  //           .exists({ userId })
  //           .session(dbSession),
  //         new _ModelRepo(AffiliateMN, req.user)
  //           .systemAccess()
  //           .exists({ userId })
  //           .session(dbSession),
  //         new _ModelRepo(AffiliateUserMN, req.user)
  //           .systemAccess()
  //           .exists({ $or: [{ userId }, { userReferralId: userId }] })
  //           .session(dbSession),
  //       ]);

  //       if (hasInvestments) {
  //         return await abortWithError({ message: "USER_HAS_INVESTMENTS" });
  //       }

  //       if (hasMovements || hasPreMovements) {
  //         return await abortWithError({ message: "USER_HAS_MOVEMENTS" });
  //       }

  //       if (hasAffiliate || hasAffiliateUser) {
  //         return await abortWithError({ message: "USER_HAS_AFFILIATE_DATA" });
  //       }

  //       const kycDocs = await kycModel
  //         .find({ userId })
  //         .session(dbSession)
  //         .lean();
  //       const kycFileFields: string[] = kycRepo.model_schema_files || [];
  //       const kycFileTargets: Array<{ user: string; fileName: string }> = [];
  //       const kycFileKeys = new Set<string>();

  //       for (const kycDoc of kycDocs) {
  //         for (const field of kycFileFields) {
  //           const fileRef = kycDoc?.[field];
  //           if (typeof fileRef !== "string" || !fileRef.trim()) continue;
  //           const parts = fileRef.split("/").filter(Boolean);
  //           const fileUser = parts.length > 1 ? parts[0] : String(userId);
  //           const fileName =
  //             parts.length > 1 ? parts.slice(1).join("/") : fileRef;
  //           const key = `${fileUser}/${fileName}`;
  //           if (kycFileKeys.has(key)) continue;
  //           kycFileKeys.add(key);
  //           kycFileTargets.push({ user: fileUser, fileName });
  //         }
  //       }

  //       for (const fileTarget of kycFileTargets) {
  //         try {
  //           await Bucket.deleteFile(KycMn, "kyc", true, fileTarget, user);
  //         } catch (error) {
  //           console.log(
  //             "🚀 ~ UserController ~ deleteUser ~ Bucket.deleteFile ~ error:",
  //             error,
  //           );
  //         }
  //       }

  //       const sessionsModel = new _ModelRepo(
  //         SessionsMN,
  //         req.user,
  //       ).systemAccess();
  //       const investmentConfigModel = new _ModelRepo(
  //         InvesmentConfigMN,
  //         req.user,
  //       ).systemAccess();
  //       const maitingListAddressesMN = new _ModelRepo(
  //         WaitingListAddressesMN,
  //         req.user,
  //       ).systemAccess();
  //       const custodialModel = new _ModelRepo(
  //         CustodialAddressesMN,
  //         req.user,
  //       ).systemAccess();
  //       const referralMovementModel = new _ModelRepo(
  //         ReferralMovementMN,
  //         req.user,
  //       ).systemAccess();
  //       const referedUserModel = new _ModelRepo(
  //         ReferedUserMN,
  //         req.user,
  //       ).systemAccess();
  //       const assetsPresale = new _ModelRepo(
  //         AssetsPresaleMN,
  //         req.user,
  //       ).systemAccess();
  //       const referralCodeModel = await new _ModelRepo(
  //         CustomerReferralMN,
  //         req.user,
  //       );

  //       const referralCode = await referralCodeModel
  //         .systemAccess()
  //         .findOne({ userId })
  //         .session(dbSession);

  //       if (referralCode) {
  //         await referedUserModel
  //           .deleteMany({ referralId: referralCode._id })
  //           .session(dbSession);
  //         await referralMovementModel
  //           .deleteMany({ referralId: referralCode._id })
  //           .session(dbSession);
  //         await referralCodeModel
  //           .systemAccess()
  //           .deleteMany({ userId })
  //           .session(dbSession);
  //       }

  //       await Promise.all([
  //         kycModel.deleteMany({ userId }).session(dbSession),
  //         sessionsModel
  //           .deleteMany({ $or: [{ userId }, { admin_access: userId }] })
  //           .session(dbSession),
  //         investmentConfigModel.deleteMany({ userId }).session(dbSession),
  //         maitingListAddressesMN.deleteMany({ userId }).session(dbSession),
  //         custodialModel
  //           .updateMany({ userId }, { $set: { deleted: true } })
  //           .session(dbSession),
  //         assetsPresale.deleteMany({ userId }).session(dbSession),
  //       ]);

  //       const deleted = await userModel.findOneAndDelete(
  //         { _id: userId },
  //         { session: dbSession },
  //       );

  //       await dbSession.commitTransaction();
  //       await dbSession.endSession();
  //       return res.status(OK).json({ deleted: Boolean(deleted?._id) });
  //     } catch (error) {
  //       console.log("🚀 ~ UserController ~ error:", error);
  //       await dbSession.abortTransaction();
  //       await dbSession.endSession();
  //       return res.status(BAD_REQUEST).json({ deleted: false, error });
  //     }
  //   },
  // ];
}

export default new UserController();
