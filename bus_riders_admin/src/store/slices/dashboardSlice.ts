import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { BusCatalogItem, LiveBusState, RouteItem, SocketStatus } from '../../types/domain';

type DashboardState = {
  routes: RouteItem[];
  buses: BusCatalogItem[];
  selectedRouteId: string;
  routeFilter: string;
  socketStatus: SocketStatus;
  liveBuses: Record<string, LiveBusState>;
  error: string;
};

const initialState: DashboardState = {
  routes: [],
  buses: [],
  selectedRouteId: '',
  routeFilter: '',
  socketStatus: 'idle',
  liveBuses: {},
  error: '',
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    resetDashboardState: () => initialState,
    setRoutes(state, action: PayloadAction<RouteItem[]>) {
      state.routes = action.payload;
    },
    setBuses(state, action: PayloadAction<BusCatalogItem[]>) {
      state.buses = action.payload;
    },
    setSelectedRouteId(state, action: PayloadAction<string>) {
      state.selectedRouteId = action.payload;
    },
    setRouteFilter(state, action: PayloadAction<string>) {
      state.routeFilter = action.payload;
    },
    setSocketStatus(state, action: PayloadAction<SocketStatus>) {
      state.socketStatus = action.payload;
    },
    setDashboardError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    clearLiveBuses(state) {
      state.liveBuses = {};
    },
    upsertLiveBus(state, action: PayloadAction<LiveBusState>) {
      state.liveBuses[action.payload.busId] = action.payload;
    },
  },
});

export const {
  resetDashboardState,
  setRoutes,
  setBuses,
  setSelectedRouteId,
  setRouteFilter,
  setSocketStatus,
  setDashboardError,
  clearLiveBuses,
  upsertLiveBus,
} = dashboardSlice.actions;

export default dashboardSlice.reducer;

