// K-Music Monitor ??Vercel Serverless API Proxy
// YouTube API ???œë²„ ì¸?ë³´ê? (process.env.YOUTUBE_API_KEY)

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
}

function parseVideos(items) {
    return (items || [])
        .filter(item => {
            const t = (item.snippet?.title || '').toLowerCase();
            const isPrivate = t === 'private video' || t === 'deleted video';
            const isShorts  = t.includes('#shorts') || t.includes('shorts')
                           || t.includes('short');
            // ?¸ë¡œ?ìƒ(shorts)?€ duration ?†ì´ ?œëª©?¼ë¡œë§??„í„° ??ì¶”ê?ë¡??¸êµ­???œëª© ?œì™¸
            const isForeign = /[\u0900-\u097F\u0600-\u06FF]/.test(item.snippet?.title || ''); // ?Œë””/?„ëž??
            return !isPrivate && !isShorts && !isForeign;
        })
        .map(item => {
            const videoId = item.snippet.resourceId?.videoId || item.id;
            return {
                videoId,
                title:     item.snippet.title,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            };
        });
}

export default async function handler(req, res) {
if (req.url?.includes('debug')) {
        return res.status(200).json({ url: req.url, query: req.query });
    }
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const KEY = process.env.YOUTUBE_API_KEY;
    if (!KEY) return res.status(500).json({ error: 'API ??ë¯¸ì„¤?? });

    const { channel, uploadsPlaylist, playlist, thumb } = req.query;

    try {

        // 0. ?thumb=VIDEO_ID ???¸ë„¤???„ë¡??(CORS ?°íšŒ)
        if (thumb) {
            const qualities = ['mqdefault', 'hqdefault', 'sddefault', 'default'];
            for (const q of qualities) {
                const imgRes = await fetch(`https://i.ytimg.com/vi/${thumb}/${q}.jpg`);
                if (imgRes.ok) {
                    res.setHeader('Content-Type', 'image/jpeg');
                    res.setHeader('Cache-Control', 's-maxage=86400');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    const buf = await imgRes.arrayBuffer();
                    return res.status(200).send(Buffer.from(buf));
                }
            }
            const empty = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
            res.setHeader('Content-Type','image/gif');
            return res.status(200).send(empty);
        }

        // 1. ?playlist=OLAK5... ??ì±„ë„ ID ë°˜í™˜
        if (playlist) {
            const r = await fetch(`${YT_BASE}/playlists?part=snippet&id=${playlist}&key=${KEY}`);
            const d = await r.json();
            const channelId = d.items?.[0]?.snippet?.channelId || null;
            return res.status(200).json({ channelId });
        }

        // 2. ?uploadsPlaylist=UU... ??ìµœì‹  ?ìƒ ë°˜í™˜
        if (uploadsPlaylist) {
            const maxR = parseInt(req.query.maxResults || '10');
            const r = await fetch(
                `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=${maxR}&key=${KEY}`
            );
            const d = await r.json();
            console.log(`[uploadsPlaylist] ${uploadsPlaylist} ??items:${d.items?.length ?? 0} error:${d.error?.message||'none'}`);
            const videos = parseVideos(d.items);
            console.log(`[uploadsPlaylist] after filter: ${videos.length}ê°?);
            return res.status(200).json({ videos });
        }

        // 3. ?channel=handle ??ì±„ë„ ID + ìµœì‹  ?ìƒ ë°˜í™˜
        if (channel) {
            // @ ?ˆìœ¼ë©?ê·¸ë?ë¡? ?†ìœ¼ë©?ë¶™ì—¬???œë„
            const handle = channel.startsWith('@') ? channel : `@${channel}`;
            const cr = await fetch(`${YT_BASE}/channels?part=id&forHandle=${handle}&key=${KEY}`);
            const cd = await cr.json();
            const channelId = cd.items?.[0]?.id || null;
            if (!channelId) return res.status(200).json({ channelId: null, videos: [] });

            const uploadsId = channelId.replace(/^UC/, 'UU');
            const pr = await fetch(
                `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=6&key=${KEY}`
            );
            const pd = await pr.json();
            return res.status(200).json({ channelId, videos: parseVideos(pd.items) });
        }

        // 4. ë©”ì¸ ì°¨íŠ¸ (?Œë¼ë¯¸í„° ?†ìŒ)
        const sr = await fetch(
            `${YT_BASE}/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&videoCategoryId=10&maxResults=50&key=${KEY}`
        );
        const sd = await sr.json();
        if (!sd.items?.length) return res.status(200).json({ chart: [] });

        const chart = sd.items.map((item, idx) => {
            const v = parseInt(item.statistics?.viewCount    || 0);
            const l = parseInt(item.statistics?.likeCount    || 0);
            const c = parseInt(item.statistics?.commentCount || 0);
            const rank = idx + 1;
            return {
                rank, videoId: item.id,
                title:     item.snippet?.title || '',
                channel:   item.snippet?.channelTitle || '',
                thumbnail: `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`,
                views: v, likes: l, comments: c,
                risk: calcRisk(v, l, c, rank),
            };
        });
        return res.status(200).json({ chart });

    } catch (err) {
        console.error('[API] ?¤ë¥˜:', err);
        return res.status(500).json({ error: err.message });
    }
}

function calcRisk(v, l, c, rank) {
    let s = 0;
    const lr = v > 0 ? l / v : 0;
    const cr = l > 0 ? c / l : 0;
    if      (lr < 0.005) s += 40; else if (lr < 0.01) s += 28;
    else if (lr < 0.02)  s += 16; else if (lr < 0.05) s += 6;
    if      (cr < 0.001) s += 25; else if (cr < 0.003) s += 14;
    else if (cr < 0.01)  s += 6;
    s += Math.max(0, Math.round(16 - rank * 1.4));
    if      (v > 1_000_000 && l < 5_000) s += 20;
    else if (v > 500_000   && l < 2_000) s += 15;
    return Math.min(99, Math.max(1, s));
}
