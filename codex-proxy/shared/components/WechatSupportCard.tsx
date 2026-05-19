import { useState } from "preact/hooks";
import { useT } from "../i18n/context";

interface WechatSupportCardProps {
  qrSrc?: string;
}

export function WechatSupportCard({ qrSrc }: WechatSupportCardProps) {
  const t = useT();
  const [imageFailed, setImageFailed] = useState(false);
  const src = qrSrc ?? new URL("../assets/wechat-support-qr.png", import.meta.url).href;

  return (
    <section class="rounded-2xl border border-gray-200 dark:border-border-dark bg-white dark:bg-card-dark shadow-sm overflow-hidden">
      <div class="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="p-5 md:p-6 flex flex-col justify-center gap-3">
          <div class="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {t("wechatSupportTitle")}
          </div>
          <div class="space-y-1">
            <h2 class="text-[1rem] md:text-[1.05rem] font-bold tracking-tight">
              {t("wechatSupportTitle")}
            </h2>
            <p class="text-sm text-slate-500 dark:text-text-dim">
              {t("wechatSupportDesc")}
            </p>
          </div>
          <p class="text-xs text-slate-400 dark:text-text-dim">
            {t("wechatSupportTip")}
          </p>
        </div>
        <div class="border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-border-dark p-5 md:p-6 bg-slate-50/80 dark:bg-border-dark/20 flex items-center justify-center">
          {!imageFailed ? (
            <img
              src={src}
              alt={t("wechatSupportTitle")}
              class="w-full max-w-[280px] rounded-xl border border-gray-200 dark:border-border-dark bg-white p-3 shadow-sm"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div class="w-full max-w-[280px] rounded-xl border border-dashed border-gray-300 dark:border-border-dark bg-white/80 dark:bg-card-dark p-6 text-center">
              <div class="mx-auto mb-3 flex size-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <svg class="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5v10.5H3.75z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 10.5h7.5M8.25 13.5h4.5" />
                </svg>
              </div>
              <p class="text-sm font-semibold text-slate-700 dark:text-text-main">
                {t("wechatSupportTitle")}
              </p>
              <p class="mt-1 text-xs text-slate-500 dark:text-text-dim">
                {t("wechatSupportFallback")}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
