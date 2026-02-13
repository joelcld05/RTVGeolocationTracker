import LogController from "@/controllers/configuration/LogsController";

import { sanitizeMiddleware } from "@/middleware/sanitize";

import Configuration from "@/controllers/configuration";
import Auth from "@/controllers/auth/AuthController";
import kycRoutes from "@/controllers/UserDataController";

import User from "@/controllers/UserController";
import Bus from "@/controllers/BusController";
import { BAD_REQUEST } from "@/utils";
import { engine } from "express-handlebars";
import rateLimit from "express-rate-limit";
import { Logging } from "@/libs/Logging";
import compression from "compression";
import bodyParser from "body-parser";
import express from "express";
import config from "@/config";
import helmet from "helmet";
import cors from "cors";

// import { isProd, isTest } from './utils';

const defaultrout = "/api/v1";
const app = express();

app.use(helmet());
app.use(compression());
app.use(cors(config.cors));
app.use(rateLimit(config.limits));
app.engine("handlebars", engine({ defaultLayout: "main" }));

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use((err: any, _req: any, res: any, next: any) => {
  const isJsonParseError =
    err?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && "body" in err);
  if (isJsonParseError) {
    return res.status(BAD_REQUEST).json({
      error: "INVALID_JSON",
      message:
        err?.message || "Bad control character in string literal in JSON",
    });
  }
  return next(err);
});

app.use(sanitizeMiddleware({ allowDots: true }));
app.use(Logging());

app.use(defaultrout, LogController.routes());
app.use(defaultrout, Configuration.routes());
app.use(defaultrout, kycRoutes.routes());
app.use(defaultrout, User.routes());
app.use(defaultrout, Bus.routes());
app.use(defaultrout, Auth.routes());
app.use(express.static("public"));

// app.use(function (req: any, res: any) {
//   console.log("req:", req.hostname, req?.ip, req?.url);
//   return res.redirect(301, "https://crowmie.com");
// });

export default app;
