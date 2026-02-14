import {
  BAD_REQUEST,
  OK,
  checkReqBodyInput,
  checkReqDataError,
  queryFormatting,
} from "@/utils";
import _ModelRepo from "@/services/repository/_ModelRepo";
import { _auth, _checkRoles } from "@/middleware/auth";
import busRealtimeState from "@/services/BusRealtimeStateService";
import { Request, Response, Router } from "express";
import Bus, { modelName } from "@/models/Bus/bus";
import Routes from "@/models/Bus/routes";
import { check, query } from "express-validator";

type Direction = "FORWARD" | "BACKWARD";
type LatLng = { lat: number; lng: number };

const ALLOWED_DIRECTIONS = new Set<Direction>(["FORWARD", "BACKWARD"]);

function normalizeDirection(value: unknown): Direction | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!ALLOWED_DIRECTIONS.has(normalized as Direction)) {
    return null;
  }

  return normalized as Direction;
}

function toLatLng(entry: unknown, order: "lnglat" | "latlng"): LatLng | null {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }

  const first = Number(entry[0]);
  const second = Number(entry[1]);
  const lat = order === "lnglat" ? second : first;
  const lng = order === "lnglat" ? first : second;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function getRouteStartLocation(routeDoc: any): LatLng | null {
  const routeCoordinates = routeDoc?.route?.coordinates;
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length === 0) {
    return null;
  }

  return toLatLng(routeCoordinates[0], "lnglat");
}

function getRouteTerminalLocation(routeDoc: any): LatLng | null {
  const endZoneCoordinates = routeDoc?.end_zone?.coordinates;
  if (Array.isArray(endZoneCoordinates) && endZoneCoordinates.length > 0) {
    const endZonePoint = toLatLng(endZoneCoordinates[0], "lnglat");
    if (endZonePoint) {
      return endZonePoint;
    }
  }

  const routeCoordinates = routeDoc?.route?.coordinates;
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length === 0) {
    return null;
  }

  return toLatLng(routeCoordinates[routeCoordinates.length - 1], "lnglat");
}

function extractRealtimeRouteContext(bus: any): {
  busId: string;
  routeId: string;
  direction: Direction;
  startLocation: LatLng | null;
  endLocation: LatLng | null;
} | null {
  if (!bus?._id) {
    return null;
  }

  const routeDoc = bus?.route;
  const routeId = String(
    typeof routeDoc === "string"
      ? routeDoc
      : (routeDoc?._id ?? routeDoc?.id ?? ""),
  ).trim();
  const direction = normalizeDirection(routeDoc?.direction);
  const busId = String(bus._id).trim();

  if (!busId || !routeId || !direction) {
    return null;
  }

  return {
    busId,
    routeId,
    direction,
    startLocation: getRouteStartLocation(routeDoc),
    endLocation: getRouteTerminalLocation(routeDoc),
  };
}

class BusController {
  rt = Router();
  baseRoute = "/bus";

  routes() {
    this.rt
      .route(`${this.baseRoute}`)
      .get(this.get)
      .post(this.create)
      .put(this.update);
    this.rt.route(`${this.baseRoute}/finish`).post(this.finishRoute);
    this.rt.route(`${this.baseRoute}/routes`).get(this.getRouteCatalog);
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

  getRouteCatalog = [
    _auth,
    query("direction").optional().trim().isIn(["FORWARD", "BACKWARD"]),
    checkReqDataError,
    async (req: Request, res: Response) => {
      try {
        const directionParam = req.query.direction;
        const direction =
          typeof directionParam === "string"
            ? directionParam.trim().toUpperCase()
            : "";

        const filter = direction
          ? { direction: direction as "FORWARD" | "BACKWARD" }
          : {};

        const data = await Routes.find(filter, {
          _id: 1,
          name: 1,
          number: 1,
          direction: 1,
        })
          .sort({ number: 1, name: 1 })
          .lean()
          .exec();

        return res.status(OK).json({ data });
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
        const existingBus = await Bus.findOne({ userId: req.user?._id })
          .populate("route")
          .lean()
          .exec();

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

        const nextStatus =
          typeof data.status === "number" ? Math.trunc(data.status) : null;
        const previousStatus =
          typeof existingBus?.status === "number"
            ? Math.trunc(existingBus.status)
            : null;
        const isTripStartTransition = nextStatus === 1 && previousStatus !== 1;

        if (isTripStartTransition) {
          const currentBus = await Bus.findOne({ userId: req.user?._id })
            .populate("route")
            .lean()
            .exec();
          const routeContext = extractRealtimeRouteContext(currentBus);
          if (routeContext) {
            await busRealtimeState.resetAfterManualFinish({
              busId: routeContext.busId,
              routeId: routeContext.routeId,
              direction: routeContext.direction,
              fallbackLocation: routeContext.startLocation,
            });
          }
        }

        return res.status(OK).json({ saved: true, data: req.body });
      } catch (error) {
        return res.status(BAD_REQUEST).json({ saved: false, error });
      }
    },
  ];

  finishRoute = [
    _auth,
    async (req: Request, res: Response) => {
      try {
        const bus = await Bus.findOne({ userId: req.user?._id })
          .populate("route")
          .lean()
          .exec();

        if (!bus?._id) {
          return res.status(BAD_REQUEST).json({
            saved: false,
            message: "BUS_NOT_REGISTERED",
          });
        }

        const routeContext = extractRealtimeRouteContext(bus);
        if (!routeContext) {
          return res.status(BAD_REQUEST).json({
            saved: false,
            message: "BUS_ROUTE_NOT_CONFIGURED",
          });
        }

        const realtime = await busRealtimeState.markManualFinish({
          busId: routeContext.busId,
          routeId: routeContext.routeId,
          direction: routeContext.direction,
          fallbackLocation: routeContext.endLocation,
        });

        await Bus.updateOne({ _id: bus._id }, { $set: { status: 0 } }).exec();

        return res.status(OK).json({
          saved: true,
          data: {
            status: 0,
            tripStatus: "ARRIVED",
            arrivalTimestamp: realtime.arrivalTimestamp,
          },
        });
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
