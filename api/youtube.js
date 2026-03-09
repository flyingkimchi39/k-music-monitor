// api/youtube.js
export default async function handler(req, res) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key missing' });
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=KR&videoCategoryId=10&maxResults=50&key=${apiKey}`
    );
    const data = await response.json();
    
    const chart = data.items.map((item, idx) => ({
      rank: idx + 1,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      views: Math.floor(item.statistics.viewCount / 1000) + 'K',
      imageUrl: item.snippet.thumbnails.default.url, // 썸네일 추가
      suspicionScore: Math.floor(Math.random() * 60),
      riskLevel: Math.floor(Math.random() * 60) >= 40 ? '주의' : '정상'
    }));

    res.setHeader('Cache-Control', 's-maxage=300');
    res.json({ chart: chart.slice(0, 100) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
