import React, { useEffect, useState } from 'react';

const DISMISS_KEY = 'agri-funds-install-dismissed';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac — also check touch points
  return /iPhone|iPad|iPod/i.test(ua)
    || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
}

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && (Date.now() - ts) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(recentlyDismissed);

  useEffect(() => {
    if (isStandalone() || dismissed) return;

    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferred(e);
    }
    function onInstalled() {
      setDeferred(null);
      setShowIosHint(false);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari never fires beforeinstallprompt — show a hint instead.
    if (isIos()) setShowIosHint(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dismissed]);

  if (dismissed || isStandalone()) return null;
  if (!deferred && !showIosHint) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice?.outcome === 'accepted') {
      setDeferred(null);
    } else {
      dismiss();
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
      <div className="rounded-xl bg-white shadow-pop ring-1 ring-slate-200 p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-800 flex items-center justify-center text-white text-lg shrink-0">
            🌱
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">Install Agri Funds</div>
            {deferred ? (
              <p className="text-xs text-slate-500 mt-0.5">
                Add to your home screen for one-tap access to your portfolio.
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">
                Tap <span aria-label="share" className="inline-block px-1">⎋</span> then
                <strong className="font-medium"> Add to Home Screen</strong>.
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              {deferred && (
                <button
                  onClick={install}
                  className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  Install
                </button>
              )}
              <button
                onClick={dismiss}
                className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
