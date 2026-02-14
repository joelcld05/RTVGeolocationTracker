import { useEffect } from "react";
import Cookies from "js-cookie";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen";
import AdminLayout from "../layouts/AdminLayout";
import AuthLayout from "../layouts/AuthLayout";
import { refreshUser } from "../libs/request";
import LoginPage from "../pages/auth/LoginPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { bootstrapResolved, bootstrapStarted } from "../store/slices/authSlice";
import { resetDashboardState } from "../store/slices/dashboardSlice";
import ProtectedRoute from "./guards/ProtectedRoute";
import PublicOnlyRoute from "./guards/PublicOnlyRoute";

const TOKEN_KEY = "token_v2";
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 8000;
const parsedBootstrapTimeout = Number(
  process.env.REACT_APP_AUTH_BOOTSTRAP_TIMEOUT_MS,
);
const BOOTSTRAP_TIMEOUT_MS =
  Number.isFinite(parsedBootstrapTimeout) && parsedBootstrapTimeout > 0
    ? parsedBootstrapTimeout
    : DEFAULT_BOOTSTRAP_TIMEOUT_MS;

async function refreshSessionWithTimeout(timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const refreshed = await Promise.race([
      // Force refresh call on every full page reload.
      refreshUser(true),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);

    return Boolean(refreshed);
  } catch {
    return false;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export default function AppRouter() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, isBootstrapping } = useAppSelector(
    (state) => state.auth,
  );

  useEffect(() => {
    let ignore = false;

    const bootstrap = async () => {
      dispatch(bootstrapStarted());
      const token = Cookies.get(TOKEN_KEY);

      if (!token) {
        if (!ignore) {
          dispatch(bootstrapResolved(false));
          dispatch(resetDashboardState());
        }
        return;
      }

      const refreshed = await refreshSessionWithTimeout(
        BOOTSTRAP_TIMEOUT_MS,
      );
      if (!ignore) {
        dispatch(bootstrapResolved(refreshed));
        if (!refreshed) {
          dispatch(resetDashboardState());
        }
      }
    };

    void bootstrap();

    return () => {
      ignore = true;
    };
  }, [dispatch]);

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/"
          element={
            <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
          }
        />
        <Route element={<PublicOnlyRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
