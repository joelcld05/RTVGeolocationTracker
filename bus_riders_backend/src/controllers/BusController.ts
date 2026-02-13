import {
  BAD_REQUEST,
  OK,
  checkReqBodyInput,
  checkReqDataError,
  queryFormatting,
} from "@/utils";
import _ModelRepo from "@/services/repository/_ModelRepo";
import { _auth, _checkRoles } from "@/middleware/auth";
import { Request, Response, Router } from "express";
import { modelName } from "@/models/Bus/bus";
import { check, query } from "express-validator";

class BusController {
  rt = Router();
  baseRoute = "/bus";

  routes() {
    this.rt
      .route(`${this.baseRoute}`)
      .get(this.get)
      .post(this.create)
      .put(this.update);
    this.rt.route(`/buses`).get(this.getMany);
    return this.rt;
  }

  get = [
    _auth,
    async (req: Request, res: Response) => {
      try {
        const { filter, select, populate } = queryFormatting(req.query);
        const repo = new _ModelRepo(modelName, req.user);
        const data = await repo.getOne({ filter, select, populate });
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
        const repo = new _ModelRepo(modelName, req.user);
        const filterOptions = queryFormatting(req.query);
        const data = await repo.getMany(filterOptions);
        return res.status(OK).json(data);
      } catch (error) {
        return res.status(BAD_REQUEST).json({ error });
      }
    },
  ];

  update = [
    _auth,
    checkReqBodyInput(modelName),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const repo = new _ModelRepo(modelName, req.user);
        const { filter } = queryFormatting(req.query, [
          { userId: req.user?._id },
        ]);
        const data = { ...req.body };
        delete data.userId;
        await repo.updateOne({
          data,
          filter,
          config: { upsert: true, new: true, setDefaultsOnInsert: true },
        });
        return res.status(OK).json({ saved: true, data: req.body });
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false, error });
      }
    },
  ];

  create = [
    _auth,
    checkReqBodyInput(modelName),
    check("name").trim().notEmpty().isString(),
    check("route").trim().notEmpty().isString(),
    check("number").trim().notEmpty().isString(),
    check("plate").trim().notEmpty().isString(),
    check("phone").trim().notEmpty().isString(),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const repo = new _ModelRepo(modelName, req.user);
        const existing = await repo
          .systemAccess()
          .findOne({ userId: req.user?._id }, { _id: 1 })
          .lean();

        if (existing) {
          return res.status(BAD_REQUEST).json({
            saved: false,
            message: "BUS_ALREADY_REGISTERED",
          });
        }

        const data = { ...req.body };
        delete data.userId;
        const created = await repo.create(data);
        return res.status(OK).json({ saved: true, data: created });
      } catch (error: any) {
        console.log("🚀 ~ BusController ~ error:", error);
        if (error?.code === 11000) {
          return res.status(BAD_REQUEST).json({
            saved: false,
            message: "BUS_ALREADY_REGISTERED",
          });
        }
        return res.status(BAD_REQUEST).json({ saved: false, error });
      }
    },
  ];
}

export default new BusController();
