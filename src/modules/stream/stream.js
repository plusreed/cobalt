import { apiJSON } from "../sub/utils.js";
import { verifyStream } from "./manage.js";
import { streamAudioOnly, streamDefault, streamLiveRender, streamVideoOnly } from "./types.js";

export default function(res, ip, id, hmac, exp) {
    try {
        let streamInfo = verifyStream(ip, id, hmac, exp);
        if (streamInfo.error) {
            res.code(streamInfo.status).send(apiJSON(0, { t: streamInfo.error }).body);
            return;
        }
        if (streamInfo.isAudioOnly && streamInfo.type !== "bridge") {
            streamAudioOnly(streamInfo, res);
            return;
        }
        switch (streamInfo.type) {
            case "render":
                streamLiveRender(streamInfo, res);
                break;
            case "videoM3U8":
            case "mute":
                streamVideoOnly(streamInfo, res);
                break;
            default:
                streamDefault(streamInfo, res);
                break;
        }
    } catch (e) {
        res.code(500).send({ status: "error", text: "Internal Server Error" });
    }
}
