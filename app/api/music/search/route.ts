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

  // yt-search 자체에 타임아웃이 없다 - 응답이 없으면 이 요청이 영원히 대기하고,
  // 그러면 Realtime 쪽 play_song 호출도 function_call_output을 영영 못 받아서
  // 대화가 "생각 중"에서 멈춘 채로 굳는다. 8초로 끊어서 항상 응답을 돌려준다.
  const SEARCH_TIMEOUT_MS = 8000;
  try {
    const result = await Promise.race([
      yts(query),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("검색 타임아웃")), SEARCH_TIMEOUT_MS),
      ),
    ]);
    const video = result.videos[0];
    if (!video) {
      return NextResponse.json({ videoId: null });
    }
    return NextResponse.json({ videoId: video.videoId, title: video.title });
  } catch {
    return NextResponse.json({ videoId: null });
  }
}
