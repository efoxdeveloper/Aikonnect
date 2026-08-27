let sdkPromise: Promise<FacebookSdk> | null = null;

export function loadFacebookSdk(appId: string): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  if (!appId) return Promise.reject(new Error("Meta App ID is not configured."));
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const scriptId = "facebook-jssdk";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    const initialize = () => {
      if (!window.FB) {
        reject(new Error("Meta SDK could not be initialized."));
        return;
      }
      window.FB.init({ appId, cookie: true, xfbml: true, version: "v23.0" });
      resolve(window.FB);
    };

    window.fbAsyncInit = initialize;
    if (existingScript) {
      existingScript.addEventListener("load", initialize, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.addEventListener("error", () => reject(new Error("Meta SDK could not be loaded.")), { once: true });
    document.head.appendChild(script);
  });

  return sdkPromise;
}
