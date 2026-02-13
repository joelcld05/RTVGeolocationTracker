import { UNPROCESSABLE_ENTITY, NOT_ACCEPTABLE, DATA_VALIDATION } from "@/utils";
import { check, validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";
import Repo from "@/services/repository/Repo";
import { isEmpty } from "lodash";

export const checkReqDataError = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(UNPROCESSABLE_ENTITY)
        .json({ DATA_VALIDATION, ERRORS: errors.array() });
    } else {
      next();
    }
  } catch (error) {
    return res.status(NOT_ACCEPTABLE).json(DATA_VALIDATION);
  }
};

export const checkReqBodyInput = (modelName = "") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const promises = [];
      if (isEmpty(req.body) && ["PUT", "POST"].includes(req.method))
        throw "EMPTY_BODY";
      if (!isEmpty(modelName)) {
        const bodyData = Object.entries(req.body);
        const repo = new Repo(req.user, modelName);

        for (const bodyItem in bodyData) {
          const attributeName = bodyData[bodyItem][0];

          const type = repo.getTypeObj(attributeName);

          if (type?.instance) {
            let check_f;

            switch (type.instance) {
              case "String":
                check_f = check(attributeName).isString();
                break;
              case "Boolean":
                check_f = check(attributeName).isBoolean();
                break;
              case "Date":
                check_f = check(attributeName).isISO8601();
                break;
              case "Number":
                check_f = check(attributeName).isNumeric();
                break;
              case "Array":
                check_f = check(attributeName).optional();
                break;
              // default:
              //   check_f = check(attributeName).notEmpty()
            }
            if (check_f) {
              if (check_f && type?.options?.require) {
                check_f.notEmpty();
              }
              promises.push(check_f);
            }
          }
        }
      }

      await Promise.all(promises.map((validation) => validation.run(req)));
      return next();
    } catch (error) {
      console.log("🚀 ~ error:", error);
      return res.status(NOT_ACCEPTABLE).json({
        error,
        message: "AN ERROR OCCURRED VALIDATING DATA",
        statusCode: NOT_ACCEPTABLE,
      });
    }
  };
};
