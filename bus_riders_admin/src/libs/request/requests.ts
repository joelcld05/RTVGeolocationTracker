import { useEffect, useRef, useState } from 'react';
import { jwtDecode } from './jwtDecode';
import Cookies from 'js-cookie';
import axios from 'axios';

type BaseResponseType = { data: Array<any>; count: number; page: number; rows: number } | { [key: string]: any } | any;
type HeadersMap = Record<string, string | number | boolean>;
type VoidFunction = (...args: any[]) => Promise<void>;
type BaseRequestType = { url?: string | null; useAuth?: boolean; saveData?: boolean; headersIn?: HeadersMap; iterations?: number };
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

const defaultHeaders: HeadersMap = { 'Content-Type': 'application/json' };

const getcookie = (name: string): string | null => {
  return Cookies.get(name) ?? null;
};

const setcookie = (
  name: string,
  value: string,
  options?: Cookies.CookieAttributes,
) => {
  Cookies.set(name, value, options);
};

const deletecookie = (name: string) => {
  Cookies.remove(name);
};

const resolveApiBaseUrl = () => {
  const fromEnv = process.env.REACT_APP_SERVER_API;
  return typeof fromEnv === 'string' ? fromEnv.replace(/\/$/, '') : '';
};

let url_endpoint = resolveApiBaseUrl();
let auth_token_name = 'token_v2';
let auth_refresh_token_name = 'refresh_v2';

const buildHeaders = (token: string | null, shouldUseAuth: boolean, extra?: HeadersMap): HeadersMap => ({
  ...defaultHeaders,
  ...(shouldUseAuth && token ? { Authorization: `Bearer ${token}` } : {}),
  ...(extra ?? {}),
});

const buildUrl = (url?: string | null, fallback?: string | null): string => {
  const target = url ?? fallback;
  if (!target) {
    throw new Error('A URL must be provided before performing a request.');
  }
  return `${url_endpoint}${target}`;
};

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

export const setSession = ({ token, refresh }: { token: string; refresh: string }) => {
  setcookie(auth_token_name, token, { expires: 1 });
  setcookie(auth_refresh_token_name, refresh, { expires: 1 });
  setcookie('session_id', refresh.split('.').pop() || '');
};

export const disconnect: VoidFunction = async () => {
  const token = getcookie(auth_token_name);
  try {
    if (token) {
      const reqInstance = axios.create({ headers: buildHeaders(token, true) });
      await reqInstance.post(buildUrl('/auth/logout'));
    }
  } catch {}
  Cookies.remove(auth_token_name);
  Cookies.remove(auth_refresh_token_name);
  Cookies.remove('session_id');
  window.location.reload();
};

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
    const token = getcookie(auth_token_name);
    const resolvedUseAuth = useAuthOverride ?? useAuth;
    const resolvedSaveData = saveDataOverride ?? saveData;
    const controller = next();

    try {
      const reqInstance = axios.create({
        headers: buildHeaders(token, resolvedUseAuth, headersIn),
        signal: controller.signal,
      });

      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.get(requestUrl);

      if (resolvedSaveData) {
        set_data(responseData);
      }

      return responseData;
    } catch (error: any) {
      switch (error?.response?.data?.message) {
        case 'EXPIRED_SESSION':
          await refreshUser();
          if (iterations < 3) {
            return await f_get({
              url,
              iterations: iterations + 1,
              saveData: resolvedSaveData,
              headersIn,
              useAuth: resolvedUseAuth,
            });
          }
          controller.abort();
          break;
        case 'NO_SESSION':
          controller.abort();
          await disconnect();
          break;
        case 'OTP_VALIDATION':
          window.history.go(0);
          break;
      }
      set_error(error);
      throw error;
    } finally {
      set_isLoading(false);
    }
  }

  return { data, isLoading, f_get, error };
}

export function _post<TResponse = unknown>({ url = null, useAuth = true, saveData = true }: PostType = {}): ReturnPostType<TResponse> {
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
    const token = getcookie(auth_token_name);
    const resolvedUseAuth = useAuthOverride ?? useAuth;
    const resolvedSaveData = saveDataOverride ?? saveData;
    const controller = next();

    try {
      const reqInstance = axios.create({
        headers: buildHeaders(token, resolvedUseAuth, headersIn),
        signal: controller.signal,
      });

      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.post(requestUrl, body);

      if (resolvedSaveData) set_data(responseData);
      return responseData;
    } catch (error: any) {
      switch (error?.response?.data?.message) {
        case 'EXPIRED_SESSION':
          await refreshUser();
          if (iterations < 3) {
            return await f_post({
              body,
              url,
              headersIn,
              iterations: iterations + 1,
              saveData: resolvedSaveData,
              useAuth: resolvedUseAuth,
            });
          }
          controller.abort();
          break;
        case 'NO_SESSION':
          controller.abort();
          await disconnect();
          break;
        case 'OTP_VALIDATION':
          window.history.go(0);
          break;
      }
      set_error(error);
      throw error;
    } finally {
      set_isLoading(false);
    }
  }

  return { data, isLoading, f_post, error };
}

export function _put<TResponse = unknown>({ url = null, useAuth = true, saveData = true }: PutType = {}): ReturnPutType<TResponse> {
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
    const token = getcookie(auth_token_name);
    const resolvedUseAuth = useAuthOverride ?? useAuth;
    const resolvedSaveData = saveDataOverride ?? saveData;
    const controller = next();

    try {
      const reqInstance = axios.create({
        headers: buildHeaders(token, resolvedUseAuth, headersIn),
        signal: controller.signal,
      });

      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.put(requestUrl, body);

      if (resolvedSaveData) set_data(responseData);

      return responseData;
    } catch (error: any) {
      switch (error?.response?.data?.message) {
        case 'EXPIRED_SESSION':
          await refreshUser();
          if (iterations < 3) {
            return await f_put({
              body,
              url,
              headersIn,
              iterations: iterations + 1,
              saveData: resolvedSaveData,
              useAuth: resolvedUseAuth,
            });
          }
          controller.abort();
          break;
        case 'NO_SESSION':
          controller.abort();
          await disconnect();
          break;
        case 'OTP_VALIDATION':
          window.history.go(0);
          break;
      }
      set_error(error);
      throw error;
    } finally {
      set_isLoading(false);
    }
  }

  return { data, isLoading, f_put, error };
}

export function _delete<TResponse = unknown>({ useAuth = true, url = null, saveData = true }: DeleteType): ReturnDeleteType<TResponse> {
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
    const token = getcookie(auth_token_name);
    const resolvedUseAuth = useAuthOverride ?? useAuth;
    const resolvedSaveData = saveDataOverride ?? saveData;
    const controller = next();

    try {
      const reqInstance = axios.create({
        headers: buildHeaders(token, resolvedUseAuth, headersIn),
        signal: controller.signal,
      });

      const requestUrl = buildUrl(url, url_default.current);
      const { data: responseData } = await reqInstance.delete(requestUrl, { data: body });

      if (resolvedSaveData) {
        set_data(responseData);
      }

      return responseData;
    } catch (error: any) {
      switch (error?.response?.data?.message) {
        case 'EXPIRED_SESSION':
          await refreshUser();
          if (iterations < 3) {
            return await f_delete({
              body,
              url,
              headersIn,
              iterations: iterations + 1,
              saveData: resolvedSaveData,
              useAuth: resolvedUseAuth,
            });
          }
          controller.abort();
          break;
        case 'NO_SESSION':
          controller.abort();
          await disconnect();
          break;
        case 'OTP_VALIDATION':
          window.history.go(0);
          break;
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
  const refreshToken = getcookie(auth_refresh_token_name);
  if (!refreshToken) throw new Error('NO_REFRESH_TOKEN');

  const instance = axios.create({
    headers: { Authorization: `Bearer ${refreshToken}` },
  });

  const { data } = await instance.post(url_endpoint + '/auth/refresh');
  setSession(data);

  const decoded = decodeJwtSafely(data.token);
  if (!decoded) throw new Error('INVALID_REFRESH_TOKEN');
  return decoded;
};

export async function refreshUser(fetchData = false) {
  try {
    if (refreshPromise) return await refreshPromise;

    const session = getcookie(auth_token_name);
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
      deletecookie(auth_token_name);
      deletecookie(auth_refresh_token_name);
      await disconnect();
    }
    return false;
  }
}
