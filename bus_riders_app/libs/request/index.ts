import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { jwtDecode } from "./jwtDecode";
import axios from "axios";

type BaseResponseType =
  | { data: Array<any>; count: number; page: number; rows: number }
  | { [key: string]: any }
  | any;
type HeadersMap = Record<string, string | number | boolean>;
type VoidFunction = (...args: any[]) => Promise<void>;
type BaseRequestType = {
  url?: string | null;
  useAuth?: boolean;
  saveData?: boolean;
  headersIn?: HeadersMap;
  iterations?: number;
};
type GetType = BaseRequestType & { onLoad?: boolean };
type PostType = BaseRequestType;
type PutType = BaseRequestType;
type DeleteType = BaseRequestType;
type FPostType = BaseRequestType & { body: unknown };
type FPutType = BaseRequestType & { body: unknown };
type FDeleteType = BaseRequestType & { body?: unknown };

export type ReturnGetType<T = BaseResponseType> = {
  f_get: (params?: Partial<GetType>) => Promise<T | any>;
  data: T | null;
  isLoading: boolean;
  error: unknown;
};

export type ReturnPostType<T = BaseResponseType> = {
  f_post: (params: FPostType) => Promise<T | any>;
  isLoading: boolean;
  data: T | null;
  error: unknown;
};

export type ReturnPutType<T = BaseResponseType> = {
  f_put: (params: FPutType) => Promise<BaseResponseType>;
  isLoading: boolean;
  error: unknown;
  data: T | null;
};

export type ReturnDeleteType<T = BaseResponseType> = {
  f_delete: (params: FDeleteType) => Promise<BaseResponseType>;
  isLoading: boolean;
  error: unknown;
  data: T | null;
};

const defaultHeaders: HeadersMap = { "Content-Type": "application/json" };
const MAX_RETRIES = 3;
const NO_RETRY: unique symbol = Symbol("NO_RETRY");

let url_endpoint = `http://192.168.1.155:8080/api/v1`;

const buildHeaders = (
  token: string | null,
  shouldUseAuth: boolean,
  extra?: HeadersMap,
): HeadersMap => ({
  ...defaultHeaders,
  ...(shouldUseAuth && token ? { Authorization: `Bearer ${token}` } : {}),
  ...(extra ?? {}),
});

const buildUrl = (url?: string | null, fallback?: string | null): string => {
  const target = url ?? fallback;
  if (!target) {
    throw new Error("A URL must be provided before performing a request.");
  }
  return `${url_endpoint}${target}`;
};

const createRequestInstance = (
  token: string | null,
  shouldUseAuth: boolean,
  headersIn: HeadersMap | undefined,
  controller: AbortController,
) =>
  axios.create({
    headers: buildHeaders(token, shouldUseAuth, headersIn),
    signal: controller.signal,
  });

const resolveRequestOptions = (
  useAuthDefault: boolean,
  saveDataDefault: boolean,
  useAuthOverride?: boolean,
  saveDataOverride?: boolean,
) => ({
  useAuth: useAuthOverride ?? useAuthDefault,
  saveData: saveDataOverride ?? saveDataDefault,
});

const useAbortController = () => {
  const controllerRef = useRef<AbortController | null>(null);

  const next = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller;
  };

  const abort = () => {
    controllerRef.current?.abort();
  };

  return { next, abort };
};

export const setSession = async ({
  token,
  refresh,
}: {
  token: string;
  refresh: string;
}) => {
  await SecureStore.setItemAsync("accessToken", token);
  await SecureStore.setItemAsync("refreshToken", refresh);
  await SecureStore.setItemAsync("session_id", refresh.split(".").pop() || "");
};

export const disconnectSession: VoidFunction = async () => {
  let token: string | null = null;

  try {
    token = await SecureStore.getItemAsync("accessToken");
  } catch (error) {
    console.log("Error reading session token:", error);
  }

  try {
    await SecureStore.deleteItemAsync("accessToken");
    await SecureStore.deleteItemAsync("refreshToken");
    await SecureStore.deleteItemAsync("session_id");
  } catch (error) {
    console.log("Error clearing stored session:", error);
  }

  if (!token) {
    return;
  }

  try {
    const reqInstance = axios.create({
      headers: buildHeaders(token, true),
      timeout: 5000,
    });
    await reqInstance.post(buildUrl("/auth/logout"));
  } catch (error) {
    console.log("Error during session disconnect:", error);
  }
};

async function handleRequestError<TResponse>({
  error,
  iterations,
  controller,
  retry,
}: {
  error: any;
  iterations: number;
  controller: AbortController;
  retry: () => Promise<TResponse>;
}): Promise<TResponse | typeof NO_RETRY> {
  switch (error?.response?.data?.message) {
    case "EXPIRED_SESSION":
      await refreshUser();
      if (iterations < MAX_RETRIES) {
        return await retry();
      }
      controller.abort();
      break;
    case "NO_SESSION":
      controller.abort();
      await disconnectSession();
      break;
    case "OTP_VALIDATION":
      window.history.go(0);
      break;
  }
  return NO_RETRY;
}

export function calculate_remening_time_session(jwt: any) {
  const now = Date.now();
  // Token `exp` is an absolute timestamp, so no offset adjustment is needed here
  return Math.max(0, jwt.exp * 1000 - now);
}

export function _get<TResponse = BaseResponseType>({
  url = null,
  saveData = true,
  useAuth = true,
  onLoad = true,
}: GetType = {}): ReturnGetType<TResponse> {
  const url_default = useRef<string | null | undefined>(url);
  const [data, set_data] = useState<TResponse | null>(null);
  const [error, set_error] = useState<unknown>(null);
  const [isLoading, set_isLoading] = useState(onLoad);
  const { next, abort } = useAbortController();

  useEffect(() => {
    if (onLoad) {
      f_get({ url, saveData, useAuth });
    }
    return () => abort();
  }, []);

  async function f_get({
    url,
    iterations = 0,
    useAuth: useAuthOverride,
    headersIn,
    saveData: saveDataOverride,
  }: Partial<GetType> = {}): Promise<BaseResponseType> {
    set_isLoading(true);
    const token = await SecureStore.getItemAsync("accessToken");
    const { useAuth: resolvedUseAuth, saveData: resolvedSaveData } =
      resolveRequestOptions(
        useAuth,
        saveData,
        useAuthOverride,
        saveDataOverride,
      );
    const controller = next();

    try {
      const reqInstance = createRequestInstance(
        token,
        resolvedUseAuth,
        headersIn,
        controller,
      );
      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.get(requestUrl);

      if (resolvedSaveData) {
        set_data(responseData);
      }

      return responseData;
    } catch (error: any) {
      const maybeRetry = await handleRequestError({
        error,
        iterations,
        controller,
        retry: () =>
          f_get({
            url,
            iterations: iterations + 1,
            saveData: resolvedSaveData,
            headersIn,
            useAuth: resolvedUseAuth,
          }),
      });
      if (maybeRetry !== NO_RETRY) {
        return maybeRetry;
      }
      set_error(error);
      throw error;
    } finally {
      set_isLoading(false);
    }
  }

  return { data, isLoading, f_get, error };
}

export function _post<TResponse = unknown>({
  url = null,
  useAuth = true,
  saveData = true,
}: PostType = {}): ReturnPostType<TResponse> {
  const url_default = useRef<string | null | undefined>(url);
  const [data, set_data] = useState<TResponse | null>(null);
  const [error, set_error] = useState<unknown>(null);
  const [isLoading, set_isLoading] = useState(false);
  const { next, abort } = useAbortController();

  useEffect(() => {
    return () => abort();
  }, []);

  async function f_post({
    body = {},
    url,
    headersIn,
    iterations = 0,
    useAuth: useAuthOverride,
    saveData: saveDataOverride,
  }: FPostType): Promise<BaseResponseType> {
    set_isLoading(true);
    const token = await SecureStore.getItemAsync("accessToken");
    const { useAuth: resolvedUseAuth, saveData: resolvedSaveData } =
      resolveRequestOptions(
        useAuth,
        saveData,
        useAuthOverride,
        saveDataOverride,
      );
    const controller = next();

    try {
      const reqInstance = createRequestInstance(
        token,
        resolvedUseAuth,
        headersIn,
        controller,
      );
      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.post(requestUrl, body);

      if (resolvedSaveData) set_data(responseData);
      return responseData;
    } catch (error: any) {
      const maybeRetry = await handleRequestError({
        error,
        iterations,
        controller,
        retry: () =>
          f_post({
            body,
            url,
            headersIn,
            iterations: iterations + 1,
            saveData: resolvedSaveData,
            useAuth: resolvedUseAuth,
          }),
      });
      if (maybeRetry !== NO_RETRY) {
        return maybeRetry;
      }
      set_error(error);
      throw error;
    } finally {
      set_isLoading(false);
    }
  }

  return { data, isLoading, f_post, error };
}

export function _put<TResponse = unknown>({
  url = null,
  useAuth = true,
  saveData = true,
}: PutType = {}): ReturnPutType<TResponse> {
  const url_default = useRef<string | null | undefined>(url);
  const [data, set_data] = useState<TResponse | null>(null);
  const [error, set_error] = useState<unknown>(null);
  const [isLoading, set_isLoading] = useState(false);
  const { next, abort } = useAbortController();

  useEffect(() => {
    return () => abort();
  }, []);

  async function f_put({
    body = {},
    url,
    headersIn,
    iterations = 0,
    useAuth: useAuthOverride,
    saveData: saveDataOverride,
  }: FPutType): Promise<BaseResponseType> {
    set_isLoading(true);
    const token = await SecureStore.getItemAsync("accessToken");
    const { useAuth: resolvedUseAuth, saveData: resolvedSaveData } =
      resolveRequestOptions(
        useAuth,
        saveData,
        useAuthOverride,
        saveDataOverride,
      );
    const controller = next();

    try {
      const reqInstance = createRequestInstance(
        token,
        resolvedUseAuth,
        headersIn,
        controller,
      );
      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.put(requestUrl, body);

      if (resolvedSaveData) set_data(responseData);

      return responseData;
    } catch (error: any) {
      const maybeRetry = await handleRequestError({
        error,
        iterations,
        controller,
        retry: () =>
          f_put({
            body,
            url,
            headersIn,
            iterations: iterations + 1,
            saveData: resolvedSaveData,
            useAuth: resolvedUseAuth,
          }),
      });
      if (maybeRetry !== NO_RETRY) {
        return maybeRetry;
      }
      set_error(error);
      throw error;
    } finally {
      set_isLoading(false);
    }
  }

  return { data, isLoading, f_put, error };
}

export function _delete<TResponse = unknown>({
  useAuth = true,
  url = null,
  saveData = true,
}: DeleteType): ReturnDeleteType<TResponse> {
  const url_default = useRef<string | null | undefined>(url);
  const [data, set_data] = useState<TResponse | null>(null);
  const [isLoading, set_isLoading] = useState(false);
  const [error, set_error] = useState<unknown>(null);
  const { next, abort } = useAbortController();

  useEffect(() => {
    return () => abort();
  }, []);

  async function f_delete({
    url,
    body = {},
    headersIn,
    iterations = 0,
    useAuth: useAuthOverride,
    saveData: saveDataOverride,
  }: FDeleteType = {}): Promise<BaseResponseType> {
    set_isLoading(true);
    const token = await SecureStore.getItemAsync("accessToken");
    const { useAuth: resolvedUseAuth, saveData: resolvedSaveData } =
      resolveRequestOptions(
        useAuth,
        saveData,
        useAuthOverride,
        saveDataOverride,
      );
    const controller = next();

    try {
      const reqInstance = createRequestInstance(
        token,
        resolvedUseAuth,
        headersIn,
        controller,
      );
      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.delete(requestUrl, {
        data: body,
      });

      if (resolvedSaveData) {
        set_data(responseData);
      }

      return responseData;
    } catch (error: any) {
      const maybeRetry = await handleRequestError({
        error,
        iterations,
        controller,
        retry: () =>
          f_delete({
            body,
            url,
            headersIn,
            iterations: iterations + 1,
            saveData: resolvedSaveData,
            useAuth: resolvedUseAuth,
          }),
      });
      if (maybeRetry !== NO_RETRY) {
        return maybeRetry;
      }
      set_error(error);
      throw error;
    } finally {
      set_isLoading(false);
    }
  }

  return { data, isLoading, f_delete, error };
}

let refreshPromise: Promise<any> | null = null;

const decodeJwtSafely = (token: string) => {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

const shouldRefreshSession = (decodedToken: any, fetchData: boolean) => {
  if (!decodedToken) return false;
  const remaining = calculate_remening_time_session(decodedToken);
  return (decodedToken && fetchData) || remaining <= 0;
};

const requestSessionRefresh = async () => {
  const refreshToken = await SecureStore.getItemAsync("refreshToken");
  if (!refreshToken) throw new Error("NO_REFRESH_TOKEN");

  const instance = axios.create({
    headers: { Authorization: `Bearer ${refreshToken}` },
  });

  const { data } = await instance.post(url_endpoint + "/auth/refresh");
  setSession(data);

  const decoded = decodeJwtSafely(data.token);
  if (!decoded) throw new Error("INVALID_REFRESH_TOKEN");
  return decoded;
};

export async function refreshUser(fetchData = false) {
  try {
    if (refreshPromise) return await refreshPromise;

    const session = await SecureStore.getItemAsync("accessToken");
    if (!session) return false;

    const decoded = decodeJwtSafely(session);
    if (!decoded) return false;

    if (!shouldRefreshSession(decoded, fetchData)) {
      return decoded;
    }

    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          return await requestSessionRefresh();
        } finally {
          refreshPromise = null;
        }
      })();
    }

    return await refreshPromise;
  } catch (e: any) {
    if (e?.response?.data?.code === 100026) {
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");
      await disconnectSession();
    }
    return false;
  }
}
