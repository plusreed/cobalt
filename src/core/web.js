import { appName, genericUserAgent, version } from "../modules/config.js";
import { languageCode } from "../modules/sub/utils.js";
import { Bright, Cyan } from "../modules/sub/consoleText.js";
import { buildFront } from "../modules/build.js";
import findRendered from "../modules/pageRender/findRendered.js";
import fs from 'fs'

// * will be removed in the future
import cors from "cors";
// *

export async function runWeb(app, gitCommit, gitBranch, __dirname) {
    await buildFront(gitCommit, gitBranch);

    app.register(require('@fastify/static'), {
        root: './build/min',
        prefix: '/'
    })

    app.register(require('@fastify/static'), {
        root: './src/front',
        prefix: '/'
    })

    app.addHook('preHandler', (req, res, done) => {
        try { decodeURIComponent(req.path) } catch (e) { return res.redirect('/') }
        done();
    })

    app.route({
        method: 'GET',
        url: '/status',
        handler: (request, reply) => {
            reply.status(200).send()
        }
    })

    app.route({
        method: 'GET',
        url: '/',
        handler: (request, reply) => {
            reply.sendFile(`${__dirname}/${findRendered(languageCode(req), req.header('user-agent') ? req.header('user-agent') : genericUserAgent)}`)
        }
    })

    app.route({
        method: 'GET',
        url: '/favicon.ico',
        handler: (request, reply) => {
            reply.sendFile(`${__dirname}/src/front/icons/favicon.ico`)
        }
    })

    app.route({
        method: 'GET',
        url: '/*',
        handler: (request, reply) => {
            reply.redirect(308, '/')
        }
    })

    app.listen({ port: process.env.webPort }, (err, address) => {
        if (err) throw err
        console.log(`\n${Cyan(appName)} WEB ${Bright(`v.${version}-${gitCommit} (${gitBranch})`)}\nStart time: ${Bright(`${startTime.toUTCString()} (${Math.floor(new Date().getTime())})`)}\n\nURL: ${Cyan(`${process.env.webURL}`)}\nPort: ${process.env.webPort}\n`)
    })
}
/*
export async function runWeb(express, app, gitCommit, gitBranch, __dirname) {
    await buildFront(gitCommit, gitBranch);

    // * will be removed in the future
    const corsConfig = process.env.cors === '0' ? { origin: process.env.webURL, optionsSuccessStatus: 200 } : {};
    app.use('/api/:type', cors(corsConfig));
    // *

    app.use('/', express.static('./build/min'));
    app.use('/', express.static('./src/front'));

    app.use((req, res, next) => {
        try { decodeURIComponent(req.path) } catch (e) { return res.redirect('/') }
        next();
    });
    app.get("/status", (req, res) => {
        res.status(200).end()
    });
    app.get("/", (req, res) => {
        res.sendFile(`${__dirname}/${findRendered(languageCode(req), req.header('user-agent') ? req.header('user-agent') : genericUserAgent)}`)
    });
    app.get("/favicon.ico", (req, res) => {
        res.sendFile(`${__dirname}/src/front/icons/favicon.ico`)
    });
    // * will be removed in the future
    app.get("/api/*", (req, res) => {
        res.redirect(308, process.env.apiURL.slice(0, -1)  + req.url)
    });
    app.post("/api/*", (req, res) => {
        res.redirect(308, process.env.apiURL.slice(0, -1)  + req.url)
    });
    // *
    app.get("/*", (req, res) => {
        res.redirect('/')
    });

    app.listen(process.env.webPort, () => {
        let startTime = new Date();
        console.log(`\n${Cyan(appName)} WEB ${Bright(`v.${version}-${gitCommit} (${gitBranch})`)}\nStart time: ${Bright(`${startTime.toUTCString()} (${Math.floor(new Date().getTime())})`)}\n\nURL: ${Cyan(`${process.env.webURL}`)}\nPort: ${process.env.webPort}\n`)
    })
}
*/