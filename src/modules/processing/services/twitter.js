import { genericUserAgent } from "../../config.js";

function bestQuality(arr) {
    return arr.filter((v) => { if (v["content_type"] === "video/mp4") return true }).sort((a, b) => Number(b.bitrate) - Number(a.bitrate))[0]["url"].split("?")[0]
}
const apiURL = "https://api.twitter.com"

export default async function(obj) {
    let _headers = {
        "user-agent": genericUserAgent,
        "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        "host": "api.twitter.com",
        "x-twitter-client-language": "en",
        "x-twitter-active-user": "yes",
        "Accept-Language": "en"
    };
    let conversationURL = `${apiURL}/2/timeline/conversation/${obj.id}.json?cards_platform=Web-12&tweet_mode=extended&include_cards=1&include_ext_media_availability=true&include_ext_sensitive_media_warning=true&simple_quoted_tweet=true&trim_user=1`;
    let activateURL = `${apiURL}/1.1/guest/activate.json`;

    let req_act = await fetch(activateURL, {
        method: "POST",
        headers: _headers
    }).then((r) => { return r.status === 200 ? r.json() : false }).catch(() => { return false });
    if (!req_act) return { error: 'ErrorCouldntFetch' };

    _headers["x-guest-token"] = req_act["guest_token"];
    _headers["cookie"] = `guest_id=v1%3A${req_act["guest_token"]};`;

    if (!obj.spaceId) {
        let conversation = await fetch(conversationURL, { headers: _headers }).then((r) => { return r.status === 200 ? r.json() : false }).catch((e) => { return false });
        if (!conversation || !conversation.globalObjects.tweets[obj.id]) return { error: 'ErrorTweetUnavailable' };

        let baseMedia, baseTweet = conversation.globalObjects.tweets[obj.id];
        if (baseTweet.retweeted_status_id_str && conversation.globalObjects.tweets[baseTweet.retweeted_status_id_str].extended_entities) {
            baseMedia = conversation.globalObjects.tweets[baseTweet.retweeted_status_id_str].extended_entities
        } else if (baseTweet.extended_entities && baseTweet.extended_entities.media) {
            baseMedia = baseTweet.extended_entities
        }
        if (!baseMedia) return { error: 'ErrorNoVideosInTweet' };

        let single, multiple = [], media = baseMedia["media"];
        media = media.filter((i) => { if (i["type"] === "video" || i["type"] === "animated_gif") return true })
        if (media.length > 1) {
            for (let i in media) { multiple.push({type: "video", thumb: media[i]["media_url_https"], url: bestQuality(media[i]["video_info"]["variants"])}) }
        } else if (media.length === 1) {
            single = bestQuality(media[0]["video_info"]["variants"])
        } else {
            return { error: 'ErrorNoVideosInTweet' }
        }

        if (single) {
            return { urls: single, filename: `twitter_${obj.id}.mp4`, audioFilename: `twitter_${obj.id}_audio` }
        } else if (multiple) {
            return { picker: multiple }
        } else {
            return { error: 'ErrorNoVideosInTweet' }
        }
    } else {
        _headers["host"] = "twitter.com";
        _headers["content-type"] = "application/json";

        let query = {
            variables: {"id": obj.spaceId,"isMetatagsQuery":true,"withDownvotePerspective":false,"withReactionsMetadata":false,"withReactionsPerspective":false,"withReplays":true},
            features: {"spaces_2022_h2_clipping":true,"spaces_2022_h2_spaces_communities":true,"responsive_web_twitter_blue_verified_badge_is_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"tweetypie_unmention_optimization_enabled":true,"vibe_api_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":false,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true,"interactive_text_enabled":true,"responsive_web_text_conversations_enabled":false,"longform_notetweets_richtext_consumption_enabled":false,"responsive_web_enhance_cards_enabled":false}
        }
        query.variables = new URLSearchParams(JSON.stringify(query.variables)).toString().slice(0, -1);
        query.features = new URLSearchParams(JSON.stringify(query.features)).toString().slice(0, -1);
        query = `https://twitter.com/i/api/graphql/Gdz2uCtmIGMmhjhHG3V7nA/AudioSpaceById?variables=${query.variables}&features=${query.features}`;

        let AudioSpaceById = await fetch(query, { headers: _headers }).then((r) => {return r.status === 200 ? r.json() : false}).catch((e) => { return false });
        if (!AudioSpaceById) return { error: 'ErrorEmptyDownload' };

        if (!AudioSpaceById.data.audioSpace.metadata) return { error: 'ErrorEmptyDownload' };
        if (AudioSpaceById.data.audioSpace.metadata.is_space_available_for_replay !== true) return { error: 'TwitterSpaceWasntRecorded' };

        let streamStatus = await fetch(
            `https://twitter.com/i/api/1.1/live_video_stream/status/${AudioSpaceById.data.audioSpace.metadata.media_key}`, { headers: _headers }
        ).then((r) =>{ return r.status === 200 ? r.json() : false }).catch(() => { return false });
        if (!streamStatus) return { error: 'ErrorCouldntFetch' };

        let participants = AudioSpaceById.data.audioSpace.participants.speakers,
            listOfParticipants = `Twitter Space speakers: `;
        for (let i in participants) { listOfParticipants += `@${participants[i]["twitter_screen_name"]}, ` }
        listOfParticipants = listOfParticipants.slice(0, -2);

        return {
            urls: streamStatus.source.noRedirectPlaybackUrl,
            audioFilename: `twitterspaces_${obj.spaceId}`,
            isAudioOnly: true,
            fileMetadata: {
                title: AudioSpaceById.data.audioSpace.metadata.title,
                artist: `Twitter Space by @${AudioSpaceById.data.audioSpace.metadata.creator_results.result.legacy.screen_name}`,
                comment: listOfParticipants,
                // cover: AudioSpaceById.data.audioSpace.metadata.creator_results.result.legacy.profile_image_url_https.replace("_normal", "")
            }
        }
    }
}
