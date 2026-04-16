import path from "path";
import { pathToFileURL } from "url";
import { createScanApi } from "../scan/createScanApi";

type ScanModuleFactory = (opts?: {
  locateFile?: (file: string) => string;
  noInitialRun?: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}) => Promise<Record<string, unknown>>;

type LoadedScanModule = Record<string, unknown> & {
  __lastStdout?: string[];
  __lastStderr?: string[];
};

let cachedApiPromise: Promise<ReturnType<typeof createScanApi>> | null = null;

function scanRuntimeDir(): string {
  return path.resolve(
    __dirname,
    "../../../../client/src/engine/scan/runtime"
  );
}

function scanJsPath(): string {
  return path.join(scanRuntimeDir(), "scan.js");
}

/** ts-node rewrites `import()` to `require()` for local ESM; keep real dynamic import. */
function dynamicImport<T>(specifier: string): Promise<T> {
  const load = new Function("s", "return import(s)") as (
    s: string
  ) => Promise<T>;
  return load(specifier);
}

export async function loadScanModuleForImport() {
  if (!cachedApiPromise) {
    const runtimeDir = scanRuntimeDir();
    const mod = await dynamicImport<{ default: ScanModuleFactory }>(
      pathToFileURL(scanJsPath()).href
    );
    const factory = mod.default as unknown as ScanModuleFactory;

    cachedApiPromise = factory({
      noInitialRun: true,
      locateFile: (file: string) => path.join(runtimeDir, file),
      print: () => {},
      printErr: () => {},
    }).then((raw) => {
      const scan = raw as LoadedScanModule;
      scan.__lastStdout = [];
      scan.__lastStderr = [];

      const originalPrint = (scan as { print?: (t: string) => void }).print;
      const originalPrintErr = (scan as { printErr?: (t: string) => void })
        .printErr;

      (scan as { print: (t: string) => void }).print = (text: string) => {
        scan.__lastStdout!.push(String(text));
        if (typeof originalPrint === "function") originalPrint(text);
      };
      (scan as { printErr: (t: string) => void }).printErr = (text: string) => {
        scan.__lastStderr!.push(String(text));
        if (typeof originalPrintErr === "function") originalPrintErr(text);
      };

      return createScanApi(scan, { silent: true });
    });
  }

  return cachedApiPromise;
}
