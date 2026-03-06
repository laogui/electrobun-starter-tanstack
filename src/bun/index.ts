import { BrowserWindow, Updater } from "electrobun/bun";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEV_SERVER_RETRY_COUNT = 20;
const DEV_SERVER_RETRY_DELAY_MS = 250;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevServer(): Promise<boolean> {
  for (let attempt = 0; attempt < DEV_SERVER_RETRY_COUNT; attempt += 1) {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      return true;
    } catch {
      await sleep(DEV_SERVER_RETRY_DELAY_MS);
    }
  }

  return false;
}

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    const isDevServerReady = await waitForDevServer();

    if (isDevServerReady) {
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    }

    console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
  }
  return "views://mainview/index.html";
}

// Create the main application window
const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
  title: "React + Tailwind + Vite",
  url,
  frame: {
    width: 900,
    height: 700,
    x: 200,
    y: 200,
  },
});

console.log("React Tailwind Vite app started!");
