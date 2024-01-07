import { Innertube } from 'youtubei.js';
import { maxVideoDuration } from '../../config.js';
import { cleanString } from '../../sub/utils.js';
import processingFailure from '../../prometheus/metrics/processingFailure.js';

const yt = await Innertube.create();

const c = {
    h264: {
        codec: "avc1",
        aCodec: "mp4a",
        container: "mp4"
    },
    av1: {
        codec: "av01",
        aCodec: "mp4a",
        container: "mp4"
    },
    vp9: {
        codec: "vp9",
        aCodec: "opus",
        container: "webm"
    }
}

export default async function(o) {
    let info, isDubbed, quality = o.quality === "max" ? "9000" : o.quality; //set quality 9000(p) to be interpreted as max
    function qual(i) {
        return i['quality_label'].split('p')[0].split('s')[0]
    }

    try {
        info = await yt.getBasicInfo(o.id, 'ANDROID');
    } catch (e) {
        processingFailure.labels('youtube', 'ErrorCantConnectToServiceAPI').inc();
        return { error: 'ErrorCantConnectToServiceAPI' };
    }

    if (!info) {
        processingFailure.labels('youtube', 'ErrorCantConnectToServiceAPI').inc();
        return { error: 'ErrorCantConnectToServiceAPI' };
    }

    if (info.playability_status.status !== 'OK') {
        processingFailure.labels('youtube', 'ErrorYTUnavailable').inc();
        return { error: 'ErrorYTUnavailable' };
    }
    if (info.basic_info.is_live) {
        processingFailure.labels('youtube', 'ErrorLiveVideo').inc();
        return { error: 'ErrorLiveVideo' };
    }

    let bestQuality, hasAudio, adaptive_formats = info.streaming_data.adaptive_formats.filter(e => 
        e["mime_type"].includes(c[o.format].codec) || e["mime_type"].includes(c[o.format].aCodec)
    ).sort((a, b) => Number(b.bitrate) - Number(a.bitrate));

    bestQuality = adaptive_formats.find(i => i["has_video"]);
    hasAudio = adaptive_formats.find(i => i["has_audio"]);

    if (bestQuality) bestQuality = qual(bestQuality);
    if (!bestQuality && !o.isAudioOnly || !hasAudio) {
        processingFailure.labels('youtube', 'ErrorYTTryOtherCodec').inc();
        return { error: 'ErrorYTTryOtherCodec' };
    }
    if (info.basic_info.duration > maxVideoDuration / 1000) {
        processingFailure.labels('youtube', 'ErrorLengthLimit').inc();
        return { error: ['ErrorLengthLimit', maxVideoDuration / 60000] };
    }

    let checkBestAudio = (i) => (i["has_audio"] && !i["has_video"]),
        audio = adaptive_formats.find(i => checkBestAudio(i) && !i["is_dubbed"]);

    if (o.dubLang) {
        let dubbedAudio = adaptive_formats.find(i =>
            checkBestAudio(i) && i["language"] === o.dubLang && i["audio_track"] && !i["audio_track"].audio_is_default
        );
        if (dubbedAudio) {
            audio = dubbedAudio;
            isDubbed = true
        }
    }
    let fileMetadata = {
        title: cleanString(info.basic_info.title.trim()),
        artist: cleanString(info.basic_info.author.replace("- Topic", "").trim()),
    }
    if (info.basic_info.short_description && info.basic_info.short_description.startsWith("Provided to YouTube by")) {
        let descItems = info.basic_info.short_description.split("\n\n");
        fileMetadata.album = descItems[2];
        fileMetadata.copyright = descItems[3];
        if (descItems[4].startsWith("Released on:")) {
            fileMetadata.date = descItems[4].replace("Released on: ", '').trim()
        }
    }

    let filenameAttributes = {
        service: "youtube",
        id: o.id,
        title: fileMetadata.title,
        author: fileMetadata.artist,
        youtubeDubName: isDubbed ? o.dubLang : false
    }

    if (filenameAttributes.title === "Video Not Available" && filenameAttributes.author === "YouTube Viewers") {
        processingFailure.labels('youtube', 'ErrorCantConnectToServiceAPI').inc();
        return {
            error: 'ErrorCantConnectToServiceAPI',
            critical: true
        }
    }
    if (hasAudio && o.isAudioOnly) return {
        type: "render",
        isAudioOnly: true,
        urls: audio.url,
        filenameAttributes: filenameAttributes,
        fileMetadata: fileMetadata
    }
    let checkSingle = (i) => ((qual(i) === quality || qual(i) === bestQuality) && i["mime_type"].includes(c[o.format].codec)),
        checkBestVideo = (i) => (i["has_video"] && !i["has_audio"] && qual(i) === bestQuality),
        checkRightVideo = (i) => (i["has_video"] && !i["has_audio"] && qual(i) === quality);

    if (!o.isAudioOnly && !o.isAudioMuted && o.format === 'h264') {
        let single = info.streaming_data.formats.find(i => checkSingle(i));
        if (single) {
            filenameAttributes.qualityLabel = single.quality_label;
            filenameAttributes.resolution = `${single.width}x${single.height}`;
            filenameAttributes.extension = c[o.format].container;
            filenameAttributes.youtubeFormat = o.format;
            return {
                type: "bridge",
                urls: single.url,
                filenameAttributes: filenameAttributes,
                fileMetadata: fileMetadata
            }
        }
    }

    let video = adaptive_formats.find(i => ((Number(quality) > Number(bestQuality)) ? checkBestVideo(i) : checkRightVideo(i)));
    if (video && audio) {
        filenameAttributes.qualityLabel = video.quality_label;
        filenameAttributes.resolution = `${video.width}x${video.height}`;
        filenameAttributes.extension = c[o.format].container;
        filenameAttributes.youtubeFormat = o.format;
        return {
            type: "render",
            urls: [video.url, audio.url],
            filenameAttributes: filenameAttributes,
            fileMetadata: fileMetadata
        }
    }

    processingFailure.labels('youtube', 'ErrorYTTryOtherCodec').inc();
    return { error: 'ErrorYTTryOtherCodec' }
}
