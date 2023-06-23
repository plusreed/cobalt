import "dotenv/config";

import fastify from "fastify";

import { Bright, Green, Red } from "./modules/sub/consoleText.js";
import { getCurrentBranch, shortCommit } from "./modules/sub/currentCommit.js";
import { loadLoc } from "./localization/manager.js";

import path from 'path';
import { fileURLToPath } from 'url';

import { runWeb } from "./core/web.js";
import { runAPI } from "./core/api.js";
import { runBoth } from "./core/both.js";

const app = fastify();

const gitCommit = shortCommit();
const gitBranch = getCurrentBranch();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename).slice(0, -4); // go up another level (get rid of src/)

// remove x-powered-by header
app.addHook('onSend', (req, res, payload, next) => {
    res.removeHeader('x-powered-by');
    next();
})

await loadLoc(); // preload localization

// i don't like this at all
if (process.env.apiURL && process.env.apiPort && !((process.env.webURL && process.env.webPort) || (process.env.selfURL && process.env.port))) {
    await runAPI(app, gitCommit, gitBranch, __dirname);
} else if (process.env.webURL && process.env.webPort && !((process.env.apiURL && process.env.apiPort) || (process.env.selfURL && process.env.port))) {
    await runWeb(app, gitCommit, gitBranch, __dirname);
} else if (process.env.selfURL && process.env.port && !((process.env.apiURL && process.env.apiPort) || (process.env.webURL && process.env.webPort))) {
    await runBoth(express, app, gitCommit, gitBranch, __dirname)
} else {
    console.log(Red(`cobalt hasn't been configured yet or configuration is invalid.\n`) + Bright(`please run the setup script to fix this: `) + Green(`npm run setup`));
}
