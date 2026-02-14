export type Direction = 'FORWARD' | 'BACKWARD';
export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type RouteItem = {
  _id: string;
  name: string;
  number: string;
  direction: Direction;
};

export type BusCatalogItem = {
  _id: string;
  name?: string;
  number?: string;
  route?: string | { _id?: string; name?: string; number?: string; direction?: Direction };
};

export type LiveBusState = {
  busId: string;
  routeId: string;
  direction: Direction;
  lat: number;
  lng: number;
  speed: number;
  timestamp: number;
  tripStatus: 'IN_ROUTE' | 'ARRIVED';
  isOffTrack: boolean;
};

