import { genericUserAgent, maxVideoDuration } from "../../config.js";
import { cleanString } from "../../sub/utils.js";
import processingFailure from "../../prometheus/metrics/processingFailure.js";

const resolutions = ["2160", "1440", "1080", "720", "480", "360", "240"];

export default async function(o) {
    let html, url, quality = o.quality === "max" ? 2160 : o.quality;

    html = await fetch(`https://vk.com/video${o.userId}_${o.videoId}`, {
        headers: { "user-agent": genericUserAgent }
    }).then((r) => { return r.arrayBuffer() }).catch(() => { return false });

    if (!html) {
        processingFailure.labels('vk', 'ErrorCouldntFetch').inc();
        return { error: 'ErrorCouldntFetch' };
    }

    // decode cyrillic from windows-1251 because vk still uses apis from prehistoring times
    let decoder = new TextDecoder('windows-1251');
    html = decoder.decode(html);

    if (!html.includes(`{"lang":`)) {
        processingFailure.labels('vk', 'ErrorEmptyDownload').inc();
        return { error: 'ErrorEmptyDownload' };
    }

    let js = JSON.parse('{"lang":' + html.split(`{"lang":`)[1].split(']);')[0]);

    if (Number(js.mvData.is_active_live) !== 0) {
        processingFailure.labels('vk', 'ErrorLiveVideo').inc();
        return { error: 'ErrorLiveVideo' };
    }
    if (js.mvData.duration > maxVideoDuration / 1000) {
        processingFailure.labels('vk', 'ErrorLengthLimit').inc();
        return { error: ['ErrorLengthLimit', maxVideoDuration / 60000] };
    }

    for (let i in resolutions) {
        if (js.player.params[0][`url${resolutions[i]}`]) {
            quality = resolutions[i];
            break
        }
    }
    if (Number(quality) > Number(o.quality)) quality = o.quality;

    url = js.player.params[0][`url${quality}`];

    let fileMetadata = {
        title: cleanString(js.player.params[0].md_title.trim()),
        artist: cleanString(js.player.params[0].md_author.trim()),
    }

    if (url) return {
        urls: url,
        filenameAttributes: {
            service: "vk",
            id: `${o.userId}_${o.videoId}`,
            title: fileMetadata.title,
            author: fileMetadata.artist,
            resolution: `${quality}p`,
            qualityLabel: `${quality}p`,
            extension: "mp4"
        }
    }

    processingFailure.labels('vk', 'ErrorEmptyDownload').inc();
    return { error: 'ErrorEmptyDownload' }
}
