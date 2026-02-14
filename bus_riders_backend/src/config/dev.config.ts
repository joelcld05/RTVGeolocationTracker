export default {
  cors: {
    origin: ["http://192.168.1.155:8080", "http://192.168.1.155:3000"],
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
  },
  limits: {
    windowMs: 15 * 60 * 1000,
    max: 100000,
    standardHeaders: true,
    legacyHeaders: false,
  },
  security: {
    recapcha_key: "6LfTG38kAAAAANc01i_17paSP-UnbRb5q5_aSoD_",
    recapcha_site: "6LfTG38kAAAAAO9cpwx9JeJmJmdOsgb93dMoWR_k",
  },
  cache: {
    time: "1440 minute",
  },
};
