import { PayloadAction, createSlice } from '@reduxjs/toolkit';

type AuthState = {
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  loginLoading: boolean;
  loginError: string;
};

const initialState: AuthState = {
  isBootstrapping: true,
  isAuthenticated: false,
  loginLoading: false,
  loginError: '',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    bootstrapStarted(state) {
      state.isBootstrapping = true;
    },
    bootstrapResolved(state, action: PayloadAction<boolean>) {
      state.isBootstrapping = false;
      state.isAuthenticated = action.payload;
    },
    loginStarted(state) {
      state.loginLoading = true;
      state.loginError = '';
    },
    loginSucceeded(state) {
      state.loginLoading = false;
      state.isAuthenticated = true;
      state.loginError = '';
    },
    loginFailed(state, action: PayloadAction<string>) {
      state.loginLoading = false;
      state.isAuthenticated = false;
      state.loginError = action.payload;
    },
    clearLoginError(state) {
      state.loginError = '';
    },
    markLoggedOut(state) {
      state.isAuthenticated = false;
      state.loginLoading = false;
      state.loginError = '';
    },
  },
});

export const {
  bootstrapStarted,
  bootstrapResolved,
  loginStarted,
  loginSucceeded,
  loginFailed,
  clearLoginError,
  markLoggedOut,
} = authSlice.actions;

export default authSlice.reducer;

