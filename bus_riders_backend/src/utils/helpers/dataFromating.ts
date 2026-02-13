import { has, concat, isNaN } from "lodash";
import { isValidObjectId } from "mongoose";
import dayjs, { locale } from "dayjs";
import { relations } from "@/models";
import { toObjectId } from "@/utils";
import Decimal from "decimal.js";

locale("es");

export function ifStringIsNumber(_string: any) {
  try {
    const isHex = /^0x[a-fA-F0-9]{40}$/i.test(_string);
    if (isHex) return false;
    return !isNaN(Number(_string));
  } catch (error) {
    return false;
  }
}

export function calculateDiffMosths(
  dateTo = new Date(),
  dateFrom = new Date(),
) {
  const date = dayjs(dateFrom);
  const date2 = dayjs(dateTo);
  const months = date.diff(date2, "months");
  return months;
}

export function calculateDiff(minutesIn: number, dateIn = new Date()) {
  const date = dayjs(new Date());
  const date2 = dayjs(dateIn);
  const minutes = date.diff(date2, "minutes");
  return minutes < minutesIn;
}

export function decimalToBalance(amount: number | string) {
  return new Decimal(amount).times(100).trunc().toNumber();
}

export function gReference(): string {
  const dateNumber = new Date().getTime();
  const rand = Math.floor(Math.random() * 10000 + 1);
  const ordernum =
    String(dateNumber).substring(String(dateNumber).length - 10) + rand;
  return ordernum;
}

export function getDataType(
  filterValues: string,
  filterName: string,
  keepformat: any = "",
) {
  const valuesOut = filterValues.split(",").map((valuesItem) => {
    let itmRs: any = valuesItem;
    if (keepformat !== "") {
      if (keepformat === "number") {
        itmRs = parseFloat(itmRs);
      } else if (keepformat === "boolean") {
        itmRs = itmRs === "true";
      } else if (keepformat === "objectId") {
        itmRs = toObjectId(itmRs);
      } else if (keepformat === "date") {
        itmRs = new Date(itmRs);
      } else {
        itmRs = String(itmRs);
      }
    } else {
      if (ifStringIsNumber(itmRs)) {
        itmRs = parseFloat(`${itmRs}`);
      } else if (["true", "false"].includes(itmRs)) {
        itmRs = itmRs === "true";
      } else if (isValidObjectId(itmRs)) {
        itmRs = toObjectId(itmRs);
      } else if (!isNaN(new Date(itmRs).getTime())) {
        itmRs = new Date(itmRs);
      } else {
        itmRs = String(itmRs);
      }
    }
    return itmRs;
  });
  return valuesOut;
}

export function queryFormatting(
  query: any = {},
  additional: any = [],
  keepformat: any = {},
) {
  let filter: any = {};
  const substringLength = 250;
  const workingQuery = { ...query };
  const { page = 0 } = workingQuery;
  let { rows = 10 } = workingQuery;

  delete workingQuery.page;
  delete workingQuery.rows;
  delete workingQuery.filterType;

  const populate: Array<string> = [];
  const prefilter = Object.entries(workingQuery);

  const numericRows = Number(rows);
  if (!Number.isNaN(numericRows) && numericRows > 500) {
    rows = 500;
  }

  const type = "$and";
  const andObj: any = { $and: [] };
  const orObj: any = { $or: [] };
  let select: Array<string> = [];
  let sort: any = { created_at: -1 };

  const sanitizeRegexValue = (value: string) =>
    value
      .substring(0, substringLength)
      .trim()
      .replaceAll(/[^a-zA-Z0-9@\-.áéíóúÁÉÍÓÚÜ ]/g, "");

  const pushCondition = (target: Array<any>, condition: any) => {
    if (condition && Object.keys(condition).length > 0) {
      target.push(condition);
    }
  };

  const getPrefilterEntry = (index: number) => prefilter[index] || [];

  const getFilterValues = (nextIndex: number) => {
    const entry = getPrefilterEntry(nextIndex);
    if (entry.length <= 0) {
      return undefined;
    }
    return String(entry[1]).split(";");
  };

  for (let i = 0; i < prefilter.length; i++) {
    try {
      const [rawType, rawAttributes] = prefilter[i];
      const filterType = String(rawType);
      const filterAttributes = String(rawAttributes).split(";");
      const filterNameParts = filterType.replace(/[0-9]/g, "").split(".");

      let filterValues: Array<string> | undefined;
      let outValue: any = {};

      switch (filterNameParts[0]) {
        case "likeand":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const condition: any = {};
            condition[filterName] = {
              $regex: `.*${sanitizeRegexValue(String(filterValues[index]))}.*`,
              $options: "i",
            };
            pushCondition(andObj[type], condition);
          }
          break;
        case "likeor":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const condition: any = {};
            condition[filterName] = {
              $regex: `.*${sanitizeRegexValue(String(filterValues[index]))}.*`,
              $options: "i",
            };
            pushCondition(orObj.$or, condition);
          }
          break;
        case "like":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          const filterOr = [];
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const condition: any = {};
            condition[filterName] = {
              $regex: `.*${sanitizeRegexValue(String(filterValues[index]))}.*`,
              $options: "i",
            };
            filterOr.push(condition);
          }
          andObj[type].push({ $or: filterOr });
          break;
        case "or":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            outValue = {};
            const valuesOut = getDataType(
              filterValues[index],
              filterName,
              keepformat[filterName],
            );
            outValue[filterName] = valuesOut[0];
            pushCondition(orObj.$or, outValue);
          }
          break;
        case "in":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].substring(0, substringLength).trim(),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = { $in: valuesOut };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "notin":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].substring(0, substringLength).trim(),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = { $nin: valuesOut };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "equal":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].substring(0, substringLength).trim(),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = valuesOut[0];
            pushCondition(andObj[type], outValue);
          }
          break;
        case "notequal":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].substring(0, substringLength).trim(),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = { $ne: valuesOut[0] };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "gt":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].substring(0, substringLength).trim(),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = { $gt: valuesOut[0] };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "gte":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].substring(0, substringLength).trim(),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = { $gte: valuesOut[0] };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "lt":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].trim().substring(0, substringLength),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = { $lt: valuesOut[0] };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "lte":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const valuesOut = getDataType(
              filterValues[index].trim().substring(0, substringLength),
              filterName,
              keepformat[filterName],
            );
            outValue = {};
            outValue[filterName] = { $lte: valuesOut[0] };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "between":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            const between = String(filterValues[index]).split(",");

            let val1: any = 0;
            let val2: any = 0;

            if (ifStringIsNumber(between[0])) {
              val1 = parseFloat(`${between[0]}`);
              val2 = parseFloat(`${between[1] || between[0]}`);
            } else if (!isNaN(new Date(between[0]).getTime())) {
              val1 = new Date(between[0]);
              val2 = new Date(between[1] || between[0]);
            }
            outValue = {};
            outValue[filterName] = {
              $gte: val1,
              $lte: val2,
            };
            pushCondition(andObj[type], outValue);
          }
          break;
        case "sort":
          filterValues = getFilterValues(++i);
          if (!filterValues) continue;
          sort = {};
          for (let index = 0; index < filterValues.length; index++) {
            const filterName = filterAttributes[index];
            if (String(filterValues[index]).toLowerCase() === "desc") {
              sort[filterName] = -1;
            } else {
              sort[filterName] = 1;
            }
          }
          break;
        case "add":
          filterValues = String(prefilter[i][1]).split(";");
          for (let index = 0; index < filterValues.length; index++) {
            if (has(relations, filterValues[index])) {
              populate.push(relations[filterValues[index]]);
            }
          }
          break;
        case "select":
          filterValues = String(prefilter[i][1]).split(",");
          if (filterValues.length > 0) {
            select = filterValues;
          }
          break;
      }
    } catch (error) {
      console.log(`queryFromating ~ error:`, error);
    }
  }

  if (orObj.$or.length > 0) andObj[type].push(orObj);
  if (additional.length > 0) andObj[type] = concat(andObj[type], additional);
  if (andObj[type].length > 0) filter = andObj;

  const parsedPage = parseInt(page);
  const parsedRows = parseInt(rows);

  return {
    sort,
    filter,
    select,
    page: parsedPage,
    rows: parsedRows,
    populate,
  };
}
