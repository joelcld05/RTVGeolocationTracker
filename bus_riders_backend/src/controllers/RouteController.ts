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
import { modelName } from "@/models/Bus/routes";
import { check, query } from "express-validator";

type GeometryInput = {
  type?: unknown;
  coordinates?: unknown;
};

function isCoordinatePair(entry: unknown): boolean {
  if (!Array.isArray(entry) || entry.length < 2) {
    return false;
  }

  const lng = Number(entry[0]);
  const lat = Number(entry[1]);
  return Number.isFinite(lng) && Number.isFinite(lat);
}

function isCoordinateList(value: unknown, minPairs: number): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  const pairs = value.filter((entry) => isCoordinatePair(entry));
  return pairs.length >= minPairs;
}

function validateGeometry(
  fieldName: string,
  allowedTypes: string[],
  minPairs: number,
  required: boolean,
) {
  return (value: unknown) => {
    if (value === undefined || value === null) {
      if (required) {
        throw new Error(`${fieldName} is required`);
      }
      return true;
    }

    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${fieldName} must be an object`);
    }

    const shape = value as GeometryInput;
    const geometryType = String(shape.type ?? "");
    if (!allowedTypes.includes(geometryType)) {
      throw new Error(
        `${fieldName}.type must be one of ${allowedTypes.join(", ")}`,
      );
    }

    if (!isCoordinateList(shape.coordinates, minPairs)) {
      throw new Error(`${fieldName}.coordinates is invalid`);
    }

    return true;
  };
}

class RouteController {
  rt = Router();
  baseRoute = "/route";

  routes() {
    this.rt
      .route(`${this.baseRoute}`)
      .get(this.get)
      .post(this.create)
      .put(this.update);
    this.rt.route(`/routes`).get(this.getMany);
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
    _checkRoles([0, 1]),
    checkReqBodyInput(modelName),
    check("direction").optional().trim().isIn(["FORWARD", "BACKWARD"]),
    check("name").optional().trim().notEmpty().isString(),
    check("number").optional().trim().notEmpty().isString(),
    check("start_point")
      .optional()
      .custom(validateGeometry("start_point", ["Point"], 1, false)),
    check("end_point")
      .optional()
      .custom(validateGeometry("end_point", ["Point"], 1, false)),
    check("route")
      .optional()
      .custom(validateGeometry("route", ["LineString", "Point"], 2, false)),
    check("end_zone")
      .optional()
      .custom(validateGeometry("end_zone", ["Polygon"], 3, false)),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const repo = new _ModelRepo(modelName, req.user);
        const { filter } = queryFormatting(req.query);
        const data = { ...req.body };
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
    _checkRoles([0, 1]),
    checkReqBodyInput(modelName),
    check("name").trim().notEmpty().isString(),
    check("number").trim().notEmpty().isString(),
    check("direction").trim().notEmpty().isIn(["FORWARD", "BACKWARD"]),
    check("start_point").custom(
      validateGeometry("start_point", ["Point"], 1, true),
    ),
    check("end_point").custom(validateGeometry("end_point", ["Point"], 1, true)),
    check("route").custom(
      validateGeometry("route", ["LineString", "Point"], 2, true),
    ),
    check("end_zone")
      .optional()
      .custom(validateGeometry("end_zone", ["Polygon"], 3, false)),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const repo = new _ModelRepo(modelName, req.user);
        const created = await repo.create(req.body);
        return res.status(OK).json({ saved: true, data: created });
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false, error });
      }
    },
  ];
}

export default new RouteController();
