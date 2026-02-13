import dotenv from "dotenv";

dotenv.config();
import Authentication from "@/services/Authentication";
import routeStateSync from "@/services/RouteStateSync";
import cache from "@/libs/ts-cache-mongoose";
import mongoose from "mongoose";
import Server from "@/server";
import Socket from "@/socket";
import http from "http";

class App {
  static #instance: App;
  PORT = process.env.PORT || 8080;
  server: http.Server | undefined;
  running = "";
  status: "loading" | "running" | "error" | undefined = undefined;

  public static get instance(): App {
    if (!App.#instance) {
      App.#instance = new App();
    }
    return App.#instance;
  }

  async init() {
    this.status = "loading";
    await this.setAuth();
    await this.connect_db();
    await routeStateSync.start();
    await this.start_server();
  }

  async connect_db() {
    try {
      const options = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };
      cache.init(mongoose, { defaultTTL: "60 seconds", engine: "memory" });
      mongoose.set("strictQuery", false);
      const dbUri = process.env.MONGO_CONNECTION;
      console.log("🚀 ~ App ~ connect_db ~ dbUri:", dbUri);
      if (!dbUri) throw new Error("Missing MongoDB URI");
      await mongoose.connect(dbUri, options);
    } catch (error) {
      console.error("DB Connection error", error);
    }
  }

  async setAuth() {
    try {
      new Authentication();
    } catch (error) {
      console.error("Auth not Loaded", error);
    }
  }

  async start_server() {
    try {
      if (this.server || this.status === "running") return;
      this.server = http.createServer(Server);
      this.server.keepAliveTimeout = 30 * 1000;
      this.server.headersTimeout = 35 * 1000;
      Socket.configure(this.server);
      await this.server.listen(this.PORT, () => {
        console.log("Server running on port " + this.PORT);
      });
      this.status = "running";
    } catch (error) {
      console.log("🚀 ~ error:", error);
      this.status = "error";
    }
  }

  async stop_server() {
    if (this.server) this.server.close();
    await routeStateSync.stop();
    await mongoose.disconnect();
    this.status = undefined;
    this.server = undefined;
  }
}

const appInstance = App.instance;

void appInstance.init();

export { App, appInstance };
export default { instance: appInstance, server: Server };
