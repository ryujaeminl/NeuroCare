const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

const KOREAN_WEATHER_DESCRIPTIONS: Record<string, string> = {
  Clear: "맑음",
  Clouds: "흐림",
  Rain: "비",
  Drizzle: "이슬비",
  Thunderstorm: "천둥번개",
  Snow: "눈",
  Mist: "옅은 안개",
  Fog: "안개",
  Haze: "실안개",
};

/**
 * 환자의 대략적 위치(navigator.geolocation, hooks/useConversationEngine.ts)로 현재 날씨를
 * 조회해 프롬프트에 넣을 한 줄을 만든다. 위치가 없거나 API 키 미설정, 요청 실패는 전부
 * 빈 문자열로 - 날씨 없이도 대화 자체는 항상 정상 진행돼야 한다(chat/route.ts 규칙 13).
 */
export async function buildWeatherContext(location: { lat: number; lon: number } | undefined): Promise<string> {
  if (!location || !OPENWEATHER_API_KEY) return "";

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("lat", String(location.lat));
    url.searchParams.set("lon", String(location.lon));
    url.searchParams.set("appid", OPENWEATHER_API_KEY);
    url.searchParams.set("units", "metric");

    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return "";

    const data = await response.json();
    const main = data.weather?.[0]?.main as string | undefined;
    const description = (main && KOREAN_WEATHER_DESCRIPTIONS[main]) || data.weather?.[0]?.description || "";
    const temp = data.main?.temp;
    if (temp === undefined || !description) return "";

    return `${description}, 기온 ${Math.round(temp)}도`;
  } catch {
    return "";
  }
}
