// 외부 링크를 "게임 창은 그대로 두고" 새 창(또는 바깥 브라우저)으로 여는 도우미
// - 일반 브라우저(사파리·크롬): 새 탭
// - 카카오톡 인앱 브라우저: 기본 브라우저(사파리/크롬)로 열기
// - 라인 인앱 브라우저: 바깥 브라우저로 열기
// - 안드로이드 인앱(네이버앱·인스타 등 웹뷰): 크롬으로 열기
// - 그래도 같은 창에서 열리는 경우를 대비해, 열기 직전에 "돌아오면 이어서 하기" 표시를 남김

const UA = navigator.userAgent || "";
const isAndroid = /Android/i.test(UA);
const isKakao = /KAKAOTALK/i.test(UA);
const isLine = /\bLine\//i.test(UA);
const isAndroidWebView = isAndroid && (/; wv\)/.test(UA) || /NAVER|Instagram|FBAN|FBAV|DaumApps|everytimeApp|BAND\//i.test(UA));

export const RESUME_KEY = "cm_resume_link"; // 링크를 연 시각 (이후 30분 안에 돌아오면 자동 입장)

export function openExternal(url) {
  try {
    localStorage.setItem(RESUME_KEY, String(Date.now()));
  } catch {
    /* 저장 안 돼도 링크는 연다 */
  }
  if (isKakao) {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return;
  }
  if (isLine) {
    const u = url + (url.includes("?") ? "&" : "?") + "openExternalBrowser=1";
    window.location.href = u;
    return;
  }
  if (isAndroidWebView) {
    const noScheme = url.replace(/^https?:\/\//, "");
    window.location.href =
      `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;` +
      `S.browser_fallback_url=${encodeURIComponent(url)};end`;
    return;
  }
  const w = window.open(url, "_blank");
  if (w) {
    try {
      w.opener = null;
    } catch {
      /* 무시 */
    }
  } else {
    window.location.href = url; // 팝업이 막힌 경우: 같은 창으로 (돌아오면 자동 이어하기)
  }
}

// 링크를 열고 30분 안에 돌아왔는지
export function shouldAutoResume() {
  try {
    const t = Number(localStorage.getItem(RESUME_KEY));
    return t > 0 && Date.now() - t < 30 * 60 * 1000;
  } catch {
    return false;
  }
}
export function clearResume() {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    /* 무시 */
  }
}
