// K-Music Monitor — Vercel Serverless API Proxy
// YouTube API 키 서버 측 보관 (process.env.YOUTUBE_API_KEY)

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
            return t !== 'private video' && t !== 'deleted video'
                && !t.includes('#shorts') && !t.includes('shorts');
        })
        .map(item => ({
            videoId:   item.snippet.resourceId?.videoId || item.id,
            title:     item.snippet.title,
            thumbnail: item.snippet.thumbnails?.high?.url
                    || item.snippet.thumbnails?.medium?.url
                    || item.snippet.thumbnails?.default?.url
                    || null,
        }));
}

export default async function handler(req, res) {
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const KEY = process.env.YOUTUBE_API_KEY;
    if (!KEY) return res.status(500).json({ error: 'API 키 미설정' });

    const { channel, uploadsPlaylist, playlist } = req.query;

    try {

        // 1. ?playlist=OLAK5... → 채널 ID 반환
        if (playlist) {
            const r = await fetch(`${YT_BASE}/playlists?part=snippet&id=${playlist}&key=${KEY}`);
            const d = await r.json();
            const channelId = d.items?.[0]?.snippet?.channelId || null;
            return res.status(200).json({ channelId });
        }

        // 2. ?uploadsPlaylist=UU... → 최신 영상 반환
        if (uploadsPlaylist) {
            const maxR = parseInt(req.query.maxResults || '10');
            const r = await fetch(
                `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=${maxR}&key=${KEY}`
            );
            const d = await r.json();
            return res.status(200).json({ videos: parseVideos(d.items) });
        }

        // 3. ?channel=handle → 채널 ID + 최신 영상 반환
        if (channel) {
            const cr = await fetch(`${YT_BASE}/channels?part=id&forHandle=${channel}&key=${KEY}`);
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

        // 4. 메인 차트 (파라미터 없음)
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
                thumbnail: item.snippet?.thumbnails?.medium?.url
                        || item.snippet?.thumbnails?.default?.url || null,
                views: v, likes: l, comments: c,
                risk: calcRisk(v, l, c, rank),
            };
        });
        return res.status(200).json({ chart });

    } catch (err) {
        console.error('[API] 오류:', err);
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