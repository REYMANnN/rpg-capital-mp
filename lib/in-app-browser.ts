// Navegador interno de app (Instagram, Facebook, webview Android...): o Google bloqueia login ali.
export function isInAppBrowser(ua: string) {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|MicroMessenger|; wv\)|GSA\//i.test(ua)
}
