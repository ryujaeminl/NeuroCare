import { NextRequest, NextResponse } from "next/server";
import yts from "yt-search";
import { auth } from "@/lib/auth/authOptions";

/**
 * POST /api/music/search - Realtime 세션 중 모델이 play_song tool을 호출하면
 * 클라이언트가 이 라우트로 실제 검색을 대신 수행한다(브라우저에서 직접 유튜브를
 * 스크레이핑하지 않기 위함). 상위 1개 결과만 돌려준다 - 재생목록/선택 UI는
 * 범위 밖(스펙 참고).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { query?: string } | null;
  const query = body?.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query가 필요합니다." }, { status: 400 });
  }

  const SEARCH_TIMEOUT_MS = 6000;
  try {
    const result = await Promise.race([
      yts(query),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("검색 타임아웃")), SEARCH_TIMEOUT_MS),
      ),
    ]);
    const video = result.videos?.[0];
    if (video && video.videoId) {
      return NextResponse.json({ videoId: video.videoId, title: video.title });
    }
  } catch (err) {
    console.warn("yts search failed, trying HTML fallback:", err);
  }

  // Fallback: Direct YouTube HTML search regex parsing
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const htmlRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(5000),
    });
    const html = await htmlRes.text();
    const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (videoIdMatch && videoIdMatch[1]) {
      const videoId = videoIdMatch[1];
      const titleMatch = html.match(/"title":{"runs":\[{"text":"([^"]+)"}\]/);
      const title = titleMatch?.[1] || query;
      return NextResponse.json({ videoId, title });
    }
  } catch (err) {
    console.error("Fallback search failed:", err);
  }

  return NextResponse.json({ videoId: null });
}
