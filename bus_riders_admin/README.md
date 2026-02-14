# Bus Riders Admin

Route-admin backoffice with:

- Email/password login
- Route list
- Real-time OpenStreetMap bus map

## Environment

Create `bus_riders_admin/.env`:

```env
REACT_APP_SERVER_API=http://192.168.1.155:8080/api/v1
REACT_APP_WS_URL=ws://192.168.1.155:8081
```

## Run

```bash
npm install
npm start
```

## Build / Test

```bash
npm run build
CI=true npm test -- --watchAll=false --runInBand
```
