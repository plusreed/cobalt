import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit"
import { randomBytes } from "crypto";

const ipSalt = randomBytes(64).toString('hex');

import { appName, version } from "../modules/config.js";
import { getJSON } from "../modules/api.js";
import { apiJSON, checkJSONPost, getIP, languageCode } from "../modules/sub/utils.js";
import { Bright, Cyan } from "../modules/sub/consoleText.js";
import stream from "../modules/stream/stream.js";
import loc from "../localization/manager.js";
import { changelogHistory } from "../modules/pageRender/onDemand.js";
import { sha256 } from "../modules/sub/crypto.js";
import { celebrationsEmoji } from "../modules/pageRender/elements.js";
import { verifyStream } from "../modules/stream/manage.js";

export async function runAPI(app, gitCommit, gitBranch, __dirname) {
    const corsConfig = process.env.cors === '0' ? { origin: process.env.webURL, optionsSuccessStatus: 200 } : {};

    // TODO: at the moment, this puts the rate limit headers on the response
    // old express impl explicitly disabled this
    app.register(rateLimit, {
        global: false, // this is a per-route rate limiter
        max: 25,
        keyGenerator: (req) => sha256(getIP(req), ipSalt),

        // TODO: figure out if this responds correctly when the limit is hit
        errorResponseBuilder: (req, context) => {
            context.statusCode = 429;
            return {
                status: 'error',
                text: loc(languageCode(req), 'ErrorRateLimit')
            }
        }
    })

    // TODO: Express impl registers this specifically on /api/:type
    app.register(cors, corsConfig);

    app.addHook('preHandler', (req, res, done) => {
        try { decodeURIComponent(req.path) } catch (e) { return res.redirect('/') }
        done();
    })

    const startTime = new Date();
    const startTimestamp = Math.floor(startTime.getTime());

    // TODO: express.json() on /api/json implementation
    /*
    try {
        JSON.parse(buf);
        if (buf.length > 720) throw new Error();
        if (String(req.header('Content-Type')) !== "application/json") {
            res.status(400).json({ 'status': 'error', 'text': 'invalid content type header' });
            return;
        }
        if (String(req.header('Accept')) !== "application/json") {
            res.status(400).json({ 'status': 'error', 'text': 'invalid accept header' });
            return;
        }
    } catch(e) {
        res.status(400).json({ 'status': 'error', 'text': 'invalid json body.' });
        return;
    }
    */
    app.route({
        method: 'POST',
        url: '/api/json',
        config: {
            rateLimit: {
                max: 25,
            }
        },
        bodyLimit: 720, // TODO: is this right?
        preHandler: async (request, reply) => {
            // Content-Type header must be application/json
            if (String(request.headers['content-type']) !== "application/json") {
                reply.code(400).send({ 'status': 'error', 'text': 'invalid content type header' });
                return;
            }

            if (String(request.headers['accept']) !== "application/json") {
                reply.code(400).send({ 'status': 'error', 'text': 'invalid accept header' });
                return;
            }

            // TODO: express implementation would send an error on an invalid json body
        },
        handler: async (request, reply) => {
            try {
                let ip = sha256(getIP(request), ipSalt);
                let lang = languageCode(request);
                let j = apiJSON(0, { t: "Bad request" });
                try {
                    let _request = request.body;
                    if (_request.url) {
                        _request.dubLang = _request.dubLang ? lang : false;
                        let chck = checkJSONPost(_request);
                        if (chck) chck["ip"] = ip;
                        j = chck ? await getJSON(chck["url"], lang, chck) : apiJSON(0, { t: loc(lang, 'ErrorCouldntFetch') });
                    } else {
                        j = apiJSON(0, { t: loc(lang, 'ErrorNoLink') });
                    }
                } catch (e) {
                    j = apiJSON(0, { t: loc(lang, 'ErrorCantProcess') });
                }
                reply.code(j.status).send(j.body);
                return;
            } catch (e) {
                // TODO: is this even the right way to do this LOL
                reply.hijack();
                reply.raw.destroy();
                return
            }
        }
    })

    app.route({
        method: 'GET',
        url: '/api/onDemand',
        config: {
            rateLimit: {
                max: 25,
            }
        },
        handler: async (request, reply) => {
            if (request.query.blockId) {
                let blockId = request.query.blockId.slice(0, 3);
                let r, j;
                switch(blockId) {
                    case "0": // changelog history
                        r = changelogHistory();
                        j = r ? apiJSON(3, { t: r }) : apiJSON(0, { t: "couldn't render this block" })
                        break;
                    case "1": // celebrations emoji
                        r = celebrationsEmoji();
                        j = r ? apiJSON(3, { t: r }) : false
                        break;
                    default:
                        j = apiJSON(0, { t: "couldn't find a block with this id" })
                        break;
                }
                if (j.body) {
                    reply.code(j.status).send(j.body)
                } else {
                    reply.code(204).end()
                }
            } else {
                let j = apiJSON(0, { t: "no block id" });
                reply.code(j.status).send(j.body)
            }
        }
    })

    app.route({
        method: 'GET',
        url: '/api/stream',
        config: {
            rateLimit: {
                max: 28,
            }
        },
        handler: async (request, reply) => {
            let ip = sha256(getIP(request), ipSalt);
            let streamInfo = verifyStream(ip, request.query.t, request.query.h, request.query.e);
            if (streamInfo.error) {
                reply.code(streamInfo.status).send(apiJSON(0, { t: streamInfo.error }).body)
                return;
            }
    
            if (request.query.p) {
                reply.code(200).send({ "status": "continue" });
                return;
            } else if (request.query.t && request.query.h && request.query.e) {
                stream(reply, ip, request.query.t, request.query.h, request.query.e);
            } else {
                let j = apiJSON(0, { t: "no stream id" })
                res.code(j.status).send(j.body);
                return;
            }
        }
    })

    // TODO: at this point it's probably best to just make this a wildcard with only the default branch in switch
    app.route({
        method: 'GET',
        url: '/api/:type',
        handler: async (request, reply) => {
            try {
                switch (request.params.type) {
                    case 'serverInfo':
                        reply.code(200).send({
                            version: version,
                            commit: gitCommit,
                            branch: gitBranch,
                            name: process.env.apiName ? process.env.apiName : "unknown",
                            url: process.env.apiURL,
                            cors: process.env.cors && process.env.cors === "0" ? 0 : 1,
                            startTime: `${startTimestamp}`
                        });
                        break;
                    default:
                        let j = apiJSON(0, { t: "unknown response type" })
                        reply.code(j.status).send(j.body);
                        break;
                }
            } catch (e) {
                reply.code(500).send({ 'status': 'error', 'text': loc(languageCode(req), 'ErrorCantProcess') });
                return;
            }
        }
    })

    app.route({
        method: 'GET',
        url: '/*',
        handler: async (request, reply) => {
            reply.redirect('/api/json');
        }
    })

    app.listen({ port: process.env.apiPort }, (err, address) => {
        if (err) throw err

        console.log(`\n${Cyan(appName)} API ${Bright(`v.${version}-${gitCommit} (${gitBranch})`)}\nStart time: ${Bright(`${startTime.toUTCString()} (${startTimestamp})`)}\n\nURL: ${Cyan(`${process.env.apiURL}`)}\nPort: ${process.env.apiPort}\n`)
    })
}

/*
export function runAPI(express, app, gitCommit, gitBranch, __dirname) {
    const corsConfig = process.env.cors === '0' ? { origin: process.env.webURL, optionsSuccessStatus: 200 } : {};

    const apiLimiter = rateLimit({
        windowMs: 60000,
        max: 20,
        standardHeaders: false,
        legacyHeaders: false,
        keyGenerator: (req, res) => sha256(getIP(req), ipSalt),
        handler: (req, res, next, opt) => {
            res.status(429).json({ "status": "error", "text": loc(languageCode(req), 'ErrorRateLimit') });
            return;
        }
    });
    const apiLimiterStream = rateLimit({
        windowMs: 60000,
        max: 25,
        standardHeaders: false,
        legacyHeaders: false,
        keyGenerator: (req, res) => sha256(getIP(req), ipSalt),
        handler: (req, res, next, opt) => {
            res.status(429).json({ "status": "error", "text": loc(languageCode(req), 'ErrorRateLimit') });
            return;
        }
    });
    
    const startTime = new Date();
    const startTimestamp = Math.floor(startTime.getTime());

    app.use('/api/:type', cors(corsConfig));
    app.use('/api/json', apiLimiter);
    app.use('/api/stream', apiLimiterStream);
    app.use('/api/onDemand', apiLimiter);

    app.use((req, res, next) => {
        try { decodeURIComponent(req.path) } catch (e) { return res.redirect('/') }
        next();
    });
    app.use('/api/json', express.json({
        verify: (req, res, buf) => {
            try {
                JSON.parse(buf);
                if (buf.length > 720) throw new Error();
                if (String(req.header('Content-Type')) !== "application/json") {
                    res.status(400).json({ 'status': 'error', 'text': 'invalid content type header' });
                    return;
                }
                if (String(req.header('Accept')) !== "application/json") {
                    res.status(400).json({ 'status': 'error', 'text': 'invalid accept header' });
                    return;
                }
            } catch(e) {
                res.status(400).json({ 'status': 'error', 'text': 'invalid json body.' });
                return;
            }
        }
    }));

    app.post('/api/json', async (req, res) => {
        try {
            let lang = languageCode(req);
            let j = apiJSON(0, { t: "Bad request" });
            try {
                let request = req.body;
                if (request.url) {
                    request.dubLang = request.dubLang ? lang : false;
                    let chck = checkJSONPost(request);
                    j = chck ? await getJSON(chck["url"], lang, chck) : apiJSON(0, { t: loc(lang, 'ErrorCouldntFetch') });
                } else {
                    j = apiJSON(0, { t: loc(lang, 'ErrorNoLink') });
                }
            } catch (e) {
                j = apiJSON(0, { t: loc(lang, 'ErrorCantProcess') });
            }
            res.status(j.status).json(j.body);
            return;
        } catch (e) {
            res.destroy();
            return
        }
    });

    app.get('/api/:type', (req, res) => {
        try {
            switch (req.params.type) {
                case 'stream':
                    if (req.query.t && req.query.h && req.query.e && req.query.t.toString().length === 21
                    && req.query.h.toString().length === 64 && req.query.e.toString().length === 13) {
                        let streamInfo = verifyStream(req.query.t, req.query.h, req.query.e);
                        if (streamInfo.error) {
                            res.status(streamInfo.status).json(apiJSON(0, { t: streamInfo.error }).body);
                            return;
                        }
                        if (req.query.p) {
                            res.status(200).json({ "status": "continue" });
                            return;
                        }
                        stream(res, streamInfo);
                    } else {
                        let j = apiJSON(0, { t: "stream token, hmac, or expiry timestamp is missing." })
                        res.status(j.status).json(j.body);
                        return;
                    }
                    break;
                case 'onDemand':
                    if (req.query.blockId) {
                        let blockId = req.query.blockId.slice(0, 3);
                        let r, j;
                        switch(blockId) {
                            case "0": // changelog history
                                r = changelogHistory();
                                j = r ? apiJSON(3, { t: r }) : apiJSON(0, { t: "couldn't render this block" })
                                break;
                            case "1": // celebrations emoji
                                r = celebrationsEmoji();
                                j = r ? apiJSON(3, { t: r }) : false
                                break;
                            default:
                                j = apiJSON(0, { t: "couldn't find a block with this id" })
                                break;
                        }
                        if (j.body) {
                            res.status(j.status).json(j.body)
                        } else {
                            res.status(204).end()
                        }
                    } else {
                        let j = apiJSON(0, { t: "no block id" });
                        res.status(j.status).json(j.body)
                    }
                    break;
                case 'serverInfo':
                    res.status(200).json({
                        version: version,
                        commit: gitCommit,
                        branch: gitBranch,
                        name: process.env.apiName ? process.env.apiName : "unknown",
                        url: process.env.apiURL,
                        cors: process.env.cors && process.env.cors === "0" ? 0 : 1,
                        startTime: `${startTimestamp}`
                    });
                    break;
                default:
                    let j = apiJSON(0, { t: "unknown response type" })
                    res.status(j.status).json(j.body);
                    break;
            }
        } catch (e) {
            res.status(500).json({ 'status': 'error', 'text': loc(languageCode(req), 'ErrorCantProcess') });
            return;
        }
    });
    app.get('/api/status', (req, res) => {
        res.status(200).end()
    });
    app.get('/favicon.ico', (req, res) => {
        res.sendFile(`${__dirname}/src/front/icons/favicon.ico`)
    });
    app.get('/*', (req, res) => {
        res.redirect('/api/json')
    });

    app.listen(process.env.apiPort, () => {
        console.log(`\n${Cyan(appName)} API ${Bright(`v.${version}-${gitCommit} (${gitBranch})`)}\nStart time: ${Bright(`${startTime.toUTCString()} (${startTimestamp})`)}\n\nURL: ${Cyan(`${process.env.apiURL}`)}\nPort: ${process.env.apiPort}\n`)
    });
}
*/