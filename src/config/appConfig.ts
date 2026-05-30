export type RuntimeTarget = 'local' | 'cloudflare';

export type AppConfig = {
  runtimeTarget: RuntimeTarget;
  apiBaseUrl: string;
  calendarId: string;
  imagePublicBaseUrl?: string;
  aiEnabled: false;
};

// Cloudflare Pages / Workers でも、他の環境でも差し替えやすい入口です。
export const appConfig: AppConfig = {
  runtimeTarget: (import.meta.env.VITE_RUNTIME_TARGET as RuntimeTarget | undefined) ?? 'local',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  calendarId: import.meta.env.VITE_CALENDAR_ID ?? 'default',
  imagePublicBaseUrl: import.meta.env.VITE_IMAGE_PUBLIC_BASE_URL,
  aiEnabled: false,
};
