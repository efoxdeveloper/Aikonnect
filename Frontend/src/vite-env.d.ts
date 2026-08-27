/// <reference types="vite/client" />

declare global {
  type FacebookLoginResponse = {
    status?: string;
    authResponse?: { code?: string };
  };

  type FacebookLoginOptions = {
    config_id: string;
    response_type: "code";
    override_default_response_type: true;
    extras: { feature: "whatsapp_embedded_signup"; sessionInfoVersion: "3" };
  };

  type FacebookSdk = {
    init: (options: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
    login: (callback: (response: FacebookLoginResponse) => void, options: FacebookLoginOptions) => void;
  };

  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export {};
