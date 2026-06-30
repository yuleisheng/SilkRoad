/// <reference types="vite/client" />

import type { SilkRoadAPI } from "../shared/types";

declare global {
  interface Window {
    silkroad: SilkRoadAPI;
  }
}
