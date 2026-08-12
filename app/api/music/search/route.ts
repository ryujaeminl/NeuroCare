import { NextRequest, NextResponse } from "next/server";
import yts from "yt-search";
import { auth } from "@/lib/auth/authOptions";

/**
 * POST /api/music/search - Realtime 세션 중 모델이 play_song tool을 호출하면
 * 클라이언트가 이 라우트로 실제 검색을 대신 수행한다(브라우저에서 직접 유튜브를
 * 스크레이핑하지 않기 위함). 상위 1개 결과만 돌려준다 - 재생목록/선택 UI는
 * 범위 밖(스펙 참고).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { query?: string } | null;
  const query = body?.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "query가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await yts(query);
    const video = result.videos[0];
    if (!video) {
      return NextResponse.json({ videoId: null });
    }
    return NextResponse.json({ videoId: video.videoId, title: video.title });
  } catch {
    return NextResponse.json({ videoId: null });
  }
}
