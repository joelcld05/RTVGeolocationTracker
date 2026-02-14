import { FormEvent, useState } from "react";
import { _post, setSession } from "../../libs/request";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  clearLoginError,
  loginFailed,
  loginStarted,
  loginSucceeded,
} from "../../store/slices/authSlice";
import { resetDashboardState } from "../../store/slices/dashboardSlice";

type LoginResponse = {
  token: string;
  refresh: string;
};

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const { loginLoading, loginError } = useAppSelector((state) => state.auth);
  const [email, setEmail] = useState("joelcld05@gmail.com");
  const [password, setPassword] = useState("123123");
  const loginRequest = _post<LoginResponse>({
    url: "/auth/login",
    useAuth: false,
    saveData: false,
  });

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch(loginStarted());

    try {
      const response = await loginRequest.f_post({
        body: { email: email.trim(), password },
        url: "/auth/login",
        useAuth: false,
        saveData: false,
      });

      if (!response?.token || !response?.refresh) {
        dispatch(loginFailed("Invalid login response. Missing token payload."));
        return;
      }

      setSession({ token: response.token, refresh: response.refresh });
      dispatch(loginSucceeded());
      dispatch(resetDashboardState());
      setPassword("");
    } catch (error: any) {
      console.log("🚀 ~ handleLogin ~ error:", error);
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Login failed. Verify email/password.";
      dispatch(loginFailed(String(message)));
    }
  };

  const clearError = () => {
    if (loginError) {
      dispatch(clearLoginError());
    }
  };

  return (
    <div className="login-panel">
      <div className="brand-row">
        <div className="brand-badge">RM</div>
        <div>
          <h1>Route Manager</h1>
          <p>Backoffice for real-time route supervision</p>
        </div>
      </div>

      <form onSubmit={handleLogin} className="login-form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearError();
            }}
            placeholder="admin@company.com"
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
        </label>
        {loginError ? <p className="form-error">{loginError}</p> : null}
        <button type="submit" disabled={loginLoading}>
          {loginLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
