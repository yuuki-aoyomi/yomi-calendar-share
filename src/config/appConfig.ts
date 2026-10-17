export type RuntimeTarget = 'auto' | 'local' | 'cloudflare';

export type AppConfig = {
  runtimeTarget: RuntimeTarget;
  apiBaseUrl: string;
  calendarId: string;
  imagePublicBaseUrl?: string;
  aiEnabled: false;
};

const viteEnv = import.meta.env ?? {};

// Cloudflare Pages / Workers でも、他の環境でも差し替えやすい入口です。
export const appConfig: AppConfig = {
  runtimeTarget: (viteEnv.VITE_RUNTIME_TARGET as RuntimeTarget | undefined) ?? 'auto',
  apiBaseUrl: viteEnv.VITE_API_BASE_URL ?? '',
  calendarId: viteEnv.VITE_CALENDAR_ID ?? 'default',
  imagePublicBaseUrl: viteEnv.VITE_IMAGE_PUBLIC_BASE_URL,
  aiEnabled: false,
};
