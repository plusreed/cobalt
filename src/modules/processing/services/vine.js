import processingFailure from "../../prometheus/metrics/processingFailure";

export default async function(obj) {
    let post = await fetch(`https://archive.vine.co/posts/${obj.id}.json`).then((r) => { return r.json() }).catch(() => {
        processingFailure.labels('vine', 'ErrorCouldntFetch').inc();
        return false
    });
    if (!post) {
        processingFailure.labels('vine', 'ErrorEmptyDownload').inc();
        return { error: 'ErrorEmptyDownload' };
    }

    if (post.videoUrl) return {
        urls: post.videoUrl.replace("http://", "https://"),
        filename: `vine_${obj.id}.mp4`,
        audioFilename: `vine_${obj.id}_audio`
    }

    processingFailure.labels('vine', 'ErrorEmptyDownload').inc();
    return { error: 'ErrorEmptyDownload' }
}
