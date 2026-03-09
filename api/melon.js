export default async function handler(req, res) {
  try {
    const response = await fetch('https://www.melon.com/chart/index.htm', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.melon.com',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      }
    });

    const html = await response.text();
    const chart = [];

    // 정규식으로 곡 정보 추출
    const songPattern = /data-song-no="(\d+)"[\s\S]*?<span class="rank"[^>]*>(\d+)<\/span>[\s\S]*?class="ellipsis rank01"[\s\S]*?title="([^"]+)"[\s\S]*?class="ellipsis rank02"[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;

    let match;
    let rank = 1;

    while ((match = songPattern.exec(html)) && rank <= 30) {
      const title = match[3]?.trim() || '';
      const artist = match[4]?.trim() || '';

      if (title && artist) {
        chart.push({
          rank,
          songId: match[1],
          title,
          artist,
          platform: 'melon',
          suspicionScore: Math.floor(Math.random() * 40), // 임시
          riskLevel: '정상'
        });
        rank++;
      }
    }

    // 폴백: 기본 파싱 실패 시
    if (chart.length === 0) {
      const titleMatches = [...html.matchAll(/class="ellipsis rank01"[^>]*>[\s\S]*?title="([^"]+)"/g)];
      const artistMatches = [...html.matchAll(/class="ellipsis rank02"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g)];

      titleMatches.slice(0, 30).forEach((m, i) => {
        chart.push({
          rank: i + 1,
          title: m[1]?.trim() || '파싱 오류',
          artist: artistMatches[i]?.[1]?.trim() || '-',
          platform: 'melon',
          suspicionScore: 0,
          riskLevel: '정상'
        });
      });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      platform: 'melon',
      timestamp: new Date().toISOString(),
      count: chart.length,
      chart
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
