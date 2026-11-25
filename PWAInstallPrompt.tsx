import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Smartphone, WifiOff, X } from 'lucide-react';
import { BrowserKind, useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallPromptProps {
  lang: 'am' | 'en';
  appKind?: 'tiny' | 'app1';
  targetPath?: string;
  relayParam?: string;
  roomParam?: string;
  directDownloadHref?: string;
  directDownloadFilename?: string;
  directApkHref?: string;
  hideCopyLink?: boolean;
  minimalInstallGate?: boolean;
  onContinueInBrowser?: () => void;
}

const LABELS = {
  am: {
    iframeTitle: 'Tiny Note ብቻ ወደ Home Screen ያስገቡ (ያለ AI Studio)',
    iframeTitleApp1: 'App 1 Controller-ን ብቻ ወደ Home Screen ያስገቡ',
    iframeBody:
      'አሁን በ AI Studio ገጽ ውስጥ ስለሆኑ የ Chrome ሜኑ ሲነኩ የሚወርደው AI Studio ነው። ከታች ያለውን ቀጥታ ሊንክ ሲነኩ መተግበሪያው ብቻውን ተከፍቶ በቀጥታ ወደ Home Screen ይገባል።',
    openStandalone: 'ቀጥታ Tiny Note (App 2) ክፈት',
    openStandaloneApp1: 'ቀጥታ App 1 ክፈት',
    copyLink: 'ሊንኩን ቅዳ',
    copied: 'ተቀድቷል!',
    title: 'ወደ ስልክዎ Home Screen መጨመር ይፈልጋሉ?',
    installModeTitle: 'Tiny Note (App 2) — አሁን ወደ Home Screen አስገባ',
    installModeTitleApp1: 'App 1 Controller — አሁን ወደ Home Screen አስገባ',
    bodyReady:
      'አዎ የሚለውን ሲነኩ የስልኩ Install መስኮት በቀጥታ ይከፈታል (Chrome ሜኑ መንካት አያስፈልግም፣ AI Studio አይወርድም)።',
    bodyPending:
      'ያለ Play Protect እና ያለ AI Studio በቀጥታ እንደ አፕ እንዲከፈት ወደ Home Screen ያስቀምጡት።',
    yesInstall: 'አዎ፣ አሁን አስገባ (Yes)',
    yes: 'አዎ (Yes)',
    no: 'አይ (No)',
    headerBtn: 'ወደ Home Screen ጨምር',
    guideTitle: 'በቀጥታ ወደ Home Screen ለመጨመር',
    iosSteps:
      '1. በ Safari ከታች ያለውን Share (↑) ቁልፍ ይንኩ። 2. "Add to Home Screen" የሚለውን ይምረጡ።',
    samsungSteps:
      '1. በ Samsung Internet ከታች በቀኝ ≡ (Menu) ይንኩ። 2. "Add page to" -> "Home screen" ይምረጡ።',
    edgeSteps:
      '1. በ Edge ከታች ⋯ (Menu) ይንኩ። 2. "Add to phone" ወይም "Install" ይምረጡ።',
    chromeSteps:
      '1. የ Chrome 1-Tap Install ገና ካልተነሳ ትንሽ ቆይተው "አዎ"ን ደግመው ይንኩ ወይም ⋮ (Menu) -> "Install app" / "Add to Home screen" ይምረጡ።',
    close: 'ዝጋ',
    offline: 'Offline ሁነታ — የተቀመጡ ማስታወሻዎች ከስልኩ ውስጥ እየሰሩ ነው።',
    directDownloadBtn: 'ፋይሉን በቀጥታ አውርድ',
    openChromeBtn: 'በ Chrome ክፈት (ለ 1-Tap Install)',
    gateTitle: 'Tiny Note',
    gateSubReady: 'ስልክዎ ላይ በቀጥታ ለመጫን Install የሚለውን ይንኩ።',
    gateSubPending: 'ስልክዎ ላይ ለመጫን ከታች ያለውን Install ይንኩ።',
    gateInstallBtn: 'አሁን ጫን (ያለ Play Protect)',
    gateInstallApkBtn: 'Tiny APK ቀጥታ ጫን (Install APK)',
    gateDownloadBtn: 'Tiny.html በቀጥታ አውርድ',
    gateContinueBtn: 'በ Chrome ውስጥ ቀጥታ ክፈት (USSD / Cast)',
  },
  en: {
    iframeTitle: 'Open Tiny Note Directly (Without AI Studio)',
    iframeTitleApp1: 'Open App 1 Controller Directly (Without AI Studio)',
    iframeBody:
      'You are inside the AI Studio preview frame, so Chrome’s Add to Home Screen would install AI Studio instead. Tap the direct link below to open the standalone app and install it cleanly.',
    openStandalone: 'Open Tiny Note (App 2) Install Link',
    openStandaloneApp1: 'Open App 1 Install Link',
    copyLink: 'Copy Direct Link',
    copied: 'Copied!',
    title: 'Add to your Home Screen?',
    installModeTitle: 'Install Tiny Note (App 2) to Home Screen',
    installModeTitleApp1: 'Install App 1 Controller to Home Screen',
    bodyReady:
      'Tap Yes below to open the native install dialog directly — no Chrome menu steps needed and no AI Studio wrapper.',
    bodyPending:
      'Install standalone with no APK upload needed, no Play Protect prompt, and offline support.',
    yesInstall: 'Yes, Install Now',
    yes: 'Yes, Add',
    no: 'No',
    headerBtn: 'Add to Home Screen',
    guideTitle: 'Add to Home Screen',
    iosSteps:
      '1. Tap Share in Safari toolbar. 2. Scroll down and tap "Add to Home Screen".',
    samsungSteps:
      '1. Tap ≡ Menu in Samsung Internet. 2. Tap "Add page to" -> "Home screen".',
    edgeSteps:
      '1. Tap ⋯ Menu in Microsoft Edge. 2. Tap "Add to phone" or "Install".',
    chromeSteps:
      '1. Wait a second for the native prompt and tap Yes again, or tap ⋮ Menu -> "Install app" / "Add to Home screen" on this standalone URL.',
    close: 'Close',
    offline: 'Offline Mode — Cached app and saved notes remain available.',
    directDownloadBtn: 'Download Offline File',
    openChromeBtn: 'Open in Chrome (1-Tap Install)',
    gateTitle: 'Tiny Note',
    gateSubReady: 'Tap Install below to install Tiny Note directly on your device.',
    gateSubPending: 'Tap Install below to add Tiny Note to your device.',
    gateInstallBtn: 'Install Now (No Play Protect)',
    gateInstallApkBtn: 'Install Tiny APK Directly',
    gateDownloadBtn: 'Download Tiny.html',
    gateContinueBtn: 'Continue in Browser (USSD / Cast)',
  },
} as const;

function getBrowserSteps(kind: BrowserKind, lang: 'am' | 'en'): string {
  const t = LABELS[lang];
  if (kind === 'ios') return t.iosSteps;
  if (kind === 'samsung') return t.samsungSteps;
  if (kind === 'edge') return t.edgeSteps;
  return t.chromeSteps;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  lang,
  appKind = 'tiny',
  targetPath,
  relayParam,
  roomParam,
  directDownloadHref,
  directDownloadFilename = 'Tiny.html',
  directApkHref,
  hideCopyLink = false,
  minimalInstallGate = false,
  onContinueInBrowser,
}) => {
  const {
    isInstallable,
    isInstalled,
    isInIframe,
    browserKind,
    isInstallLinkMode,
    standaloneInstallUrl,
    copyableInstallUrl,
    chromeIntentUrl,
    install,
  } = usePWAInstall({ targetPath, relayParam, roomParam });
  const [dismissed, setDismissed] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [copiedDirectLink, setCopiedDirectLink] = useState(false);

  const t = LABELS[lang];
  const isApp1 = appKind === 'app1';
  const iframeHeading = isApp1 ? t.iframeTitleApp1 : t.iframeTitle;
  const openStandaloneLabel = isApp1 ? t.openStandaloneApp1 : t.openStandalone;
  const installHeading = isApp1 ? t.installModeTitleApp1 : t.installModeTitle;

  if (isInstalled) {
    return null;
  }

  async function handleCopyDirectLink() {
    try {
      await navigator.clipboard.writeText(copyableInstallUrl);
      setCopiedDirectLink(true);
      setTimeout(() => setCopiedDirectLink(false), 1800);
    } catch {
      setCopiedDirectLink(false);
    }
  }

  async function handleYes() {
    const outcome = await install();
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDismissed(true);
      return;
    }
    setShowManualGuide(true);
  }

  function handleNo() {
    setShowManualGuide(false);
    setDismissed(true);
  }

  if (minimalInstallGate) {
    return (
      <div className="mx-auto flex min-h-[75vh] max-w-md flex-col items-center justify-center px-4 py-10">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-700 text-white">
            <Smartphone className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            {t.gateTitle}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {isInstallable ? t.gateSubReady : t.gateSubPending}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            {directApkHref && (
              <a
                href={directApkHref}
                download="TinyNote.apk"
                className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 py-3 text-base font-bold text-white hover:bg-teal-800 transition-colors"
              >
                <Download className="h-5 w-5" />
                <span>{t.gateInstallApkBtn}</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleYes}
              className={`inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-bold transition-colors ${
                directApkHref
                  ? 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                  : 'bg-teal-700 text-white hover:bg-teal-800'
              }`}
            >
              <Smartphone className="h-5 w-5" />
              <span>{t.gateInstallBtn}</span>
            </button>

            {directDownloadHref && (
              <a
                href={directDownloadHref}
                download={directDownloadFilename}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <Download className="h-4 w-4 text-teal-700" />
                <span>{t.gateDownloadBtn}</span>
              </a>
            )}

            {onContinueInBrowser && (
              <button
                type="button"
                onClick={onContinueInBrowser}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span>{t.gateContinueBtn}</span>
              </button>
            )}
          </div>

          {showManualGuide && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-slate-700">
              <p className="leading-relaxed">{getBrowserSteps(browserKind, lang)}</p>
              {chromeIntentUrl && !isInstallable && (
                <a
                  href={chromeIntentUrl}
                  className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>{t.openChromeBtn}</span>
                </a>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (isInIframe) {
    return (
      <section
        aria-label={iframeHeading}
        className="mb-8 rounded-2xl border border-teal-200 bg-teal-50/50 p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white shrink-0">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{iframeHeading}</h2>
              <p className="mt-1 text-sm text-slate-700">{t.iframeBody}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href={standaloneInstallUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <ExternalLink className="h-4 w-4" />
              <span>{openStandaloneLabel}</span>
            </a>
            <button
              type="button"
              onClick={handleCopyDirectLink}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedDirectLink ? (
                <>
                  <Check className="h-4 w-4 text-teal-700" />
                  <span>{t.copied}</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>{t.copyLink}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (dismissed) {
    return (
      <div className="mb-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setDismissed(false);
            setShowManualGuide(false);
          }}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5 text-teal-700" />
          <span>{t.headerBtn}</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label={isInstallLinkMode ? installHeading : t.title}
      className={`mb-8 rounded-2xl border p-5 sm:p-6 ${
        isInstallLinkMode ? 'border-teal-300 bg-teal-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700/10 text-teal-800 shrink-0">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isInstallLinkMode ? installHeading : t.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isInstallable ? t.bodyReady : t.bodyPending}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleYes}
            className="inline-flex min-h-[44px] flex-1 sm:flex-none items-center justify-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {isInstallable ? t.yesInstall : t.yes}
          </button>
          {directDownloadHref && (
            <a
              href={directDownloadHref}
              download={directDownloadFilename}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t.directDownloadBtn}</span>
            </a>
          )}
          <button
            type="button"
            onClick={handleNo}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {t.no}
          </button>
          {!hideCopyLink && (
            <button
              type="button"
              onClick={handleCopyDirectLink}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedDirectLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-teal-700" />
                  <span>{t.copied}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>{t.copyLink}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {showManualGuide && (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/70 pt-4 text-sm text-slate-700 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-semibold text-slate-900">{t.guideTitle}</div>
            <p className="mt-1 text-slate-600">{getBrowserSteps(browserKind, lang)}</p>
            {chromeIntentUrl && !isInstallable && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={chromeIntentUrl}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>{t.openChromeBtn}</span>
                </a>
                {directDownloadHref && (
                  <a
                    href={directDownloadHref}
                    download={directDownloadFilename}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5 text-teal-700" />
                    <span>{t.directDownloadBtn}</span>
                  </a>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowManualGuide(false)}
            aria-label={t.close}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 shrink-0 self-end sm:self-start"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
};

export const OfflineIndicator: React.FC<{ lang: 'am' | 'en' }> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-md items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 shadow-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
      <span>{LABELS[lang].offline}</span>
    </div>
  );
};
