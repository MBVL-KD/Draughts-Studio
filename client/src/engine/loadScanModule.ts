import ScanModule from "./scan/runtime/scan.js";
import { createScanApi } from "./scan/createScanApi";

export type ScanModuleFactory = (opts?: {
  locateFile?: (file: string) => string;
  noInitialRun?: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}) => Promise<Record<string, unknown>>;

type LoadedScanModule = Record<string, unknown> & {
  __lastStdout?: string[];
  __lastStderr?: string[];
};

let cachedApiPromise: Promise<Record<string, unknown>> | null = null;

export async function loadScanModule(): Promise<Record<string, unknown>> {
  if (!cachedApiPromise) {
    const factory = ScanModule as unknown as ScanModuleFactory;

    cachedApiPromise = factory({
      noInitialRun: true,
      locateFile: (file: string) =>
        new URL(`./scan/runtime/${file}`, import.meta.url).href,
      print: (text: string) => {
        console.log("[SCAN OUT]", text);
      },
      printErr: (text: string) => {
        console.error("[SCAN ERR]", text);
      },
    }).then((raw) => {
      const scan = raw as LoadedScanModule;

      scan.__lastStdout = [];
      scan.__lastStderr = [];

      const originalPrint = (scan as any).print;
      const originalPrintErr = (scan as any).printErr;

      (scan as any).print = (text: string) => {
        scan.__lastStdout!.push(String(text));
        console.log("[SCAN OUT]", text);
        if (typeof originalPrint === "function") {
          originalPrint(text);
        }
      };

      (scan as any).printErr = (text: string) => {
        scan.__lastStderr!.push(String(text));
        console.error("[SCAN ERR]", text);
        if (typeof originalPrintErr === "function") {
          originalPrintErr(text);
        }
      };

      console.log("RAW SCAN LOADED", scan);

      const api = createScanApi(scan);

      console.log("SCAN API READY", api);

      return api;
    });
  }

  return cachedApiPromise;
}