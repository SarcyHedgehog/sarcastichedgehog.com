import { LocalTransport } from "./local-transport.js";
import { PhotonTransport } from "./photon-transport.js";

export function createTransport(config) {
  const requested = String(config.MODE || "auto").toLowerCase();
  if (requested === "photon" || (requested === "auto" && config.PHOTON_APP_ID)) {
    return new PhotonTransport(config);
  }
  return new LocalTransport();
}
