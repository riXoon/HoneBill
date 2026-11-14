/** Path of the APK redirect, relative to the site root. */
export const APK_PATH = '/download/honebill.apk';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The public download page at honebill.app/download: the newest version, a download button, and how to install an
 * APK. Plain HTML with the brand palette (background #ECF0F3, text #222021, primary #F08F31, coral #E6795E).
 */
export function renderDownloadPage(info: { version: string | null; notes: string | null; available: boolean }): string {
  const version = info.version ? escapeHtml(info.version) : null;
  const notes = info.notes ? `<p class="notes">${escapeHtml(info.notes)}</p>` : '';
  const action = info.available
    ? `<a class="button" href="${APK_PATH}" download>Download HoneBill${version ? ` ${version}` : ''}</a>
       <p class="small">Android only &middot; APK file</p>`
    : `<p class="soon">The download is not available yet. Please check back soon.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Download HoneBill</title>
<meta name="description" content="Download the HoneBill app for Android.">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #ECF0F3; color: #222021; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; }
  main { width: 100%; max-width: 420px; background: #F7F7FB; border-radius: 20px; padding: 32px 24px;
    box-shadow: 0 6px 20px rgba(211, 211, 211, 0.6); text-align: center; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  h1 span { color: #F08F31; }
  .version { margin: 0 0 16px; color: rgba(34, 32, 33, 0.6); font-size: 16px; }
  .notes { margin: 0 0 24px; font-size: 16px; line-height: 1.5; }
  .button { display: block; padding: 16px; border-radius: 30px; background: #F08F31; color: #FFFFFF;
    font-size: 18px; font-weight: 600; text-decoration: none; }
  .button:active { opacity: 0.8; }
  .small { margin: 8px 0 0; font-size: 13px; color: rgba(34, 32, 33, 0.6); }
  .soon { margin: 0; font-size: 16px; color: #E6795E; }
  h2 { margin: 28px 0 8px; font-size: 17px; text-align: left; }
  ol { margin: 0; padding-left: 20px; text-align: left; font-size: 15px; line-height: 1.6; }
  .safe { margin: 20px 0 0; padding: 12px 14px; border-radius: 12px; background: #FFF0D8; font-size: 14px;
    line-height: 1.5; text-align: left; }
</style>
</head>
<body>
<main>
  <h1>Hone<span>Bill</span></h1>
  <p class="version">${version ? `Version ${version}` : 'For Android'}</p>
  ${notes}
  ${action}
  <h2>How to install</h2>
  <ol>
    <li>Tap the download button and open the file when it finishes.</li>
    <li>If Android asks, allow your browser to install apps ("Install unknown apps").</li>
    <li>Tap <strong>Install</strong> (or <strong>Update</strong> if you already have HoneBill).</li>
  </ol>
  <p class="safe">Already using HoneBill? Install over your current app. Your wallet and your money stay on this phone. Never uninstall first unless you have your 12-word recovery phrase.</p>
</main>
</body>
</html>`;
}
