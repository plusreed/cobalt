import "dotenv/config";

import fastify from "fastify";

import { Bright, Green, Red } from "./modules/sub/consoleText.js";
import { getCurrentBranch, shortCommit } from "./modules/sub/currentCommit.js";
import { loadLoc } from "./localization/manager.js";

import path from 'path';
import { fileURLToPath } from 'url';

import { runWeb } from "./core/web.js";
import { runAPI } from "./core/api.js";

const app = fastify();

const gitCommit = shortCommit();
const gitBranch = getCurrentBranch();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename).slice(0, -4);

// remove x-powered-by header
app.addHook('onSend', (req, res, payload, next) => {
    res.removeHeader('x-powered-by');
    next();
})

app.addContentTypeParser('*', (req, done) => {
    done();
})

await loadLoc();

if (process.env.apiURL && process.env.apiPort && !((process.env.webURL && process.env.webPort) || (process.env.selfURL && process.env.port))) {
    await runAPI(app, gitCommit, gitBranch, __dirname);
} else if (process.env.webURL && process.env.webPort && !((process.env.apiURL && process.env.apiPort) || (process.env.selfURL && process.env.port))) {
    await runWeb(app, gitCommit, gitBranch, __dirname);
} else {
    console.log(Red(`cobalt wasn't configured yet or configuration is invalid.\n`) + Bright(`please run the setup script to fix this: `) + Green(`npm run setup`));
}
