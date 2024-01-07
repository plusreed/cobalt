import { maxVideoDuration } from "../../config.js";
import processingFailure from "../../prometheus/metrics/processingFailure.js";

export default async function(obj) {
    const pinId = obj.id.split('--').reverse()[0];
    if (!(/^\d+$/.test(pinId))) {
        processingFailure.labels('pinterest', 'ErrorCantGetID').inc();
        return { error: 'ErrorCantGetID' };
    }
    let data = await fetch(`https://www.pinterest.com/resource/PinResource/get?data=${encodeURIComponent(JSON.stringify({
        options: {
            field_set_key: "unauth_react_main_pin",
            id: pinId
        }
    }))}`).then((r) => { return r.json() }).catch(() => { return false });
    if (!data) {
        processingFailure.labels('pinterest', 'ErrorCouldntFetch').inc();
        return { error: 'ErrorCouldntFetch' };
    }

    data = data["resource_response"]["data"];

    let video = null;

    if (data.videos !== null) video = data.videos.video_list.V_720P;
    else if (data.story_pin_data !== null) video = data.story_pin_data.pages[0].blocks[0].video.video_list.V_EXP7;

    if (!video) {
        processingFailure.labels('pinterest', 'ErrorEmptyDownload').inc();
        return { error: 'ErrorEmptyDownload' };
    }
    if (video.duration > maxVideoDuration) {
        processingFailure.labels('pinterest', 'ErrorLengthLimit').inc();
        return { error: ['ErrorLengthLimit', maxVideoDuration / 60000] };
    }

    return {
        urls: video.url,
        filename: `pinterest_${pinId}.mp4`,
        audioFilename: `pinterest_${pinId}_audio`
    }
}
