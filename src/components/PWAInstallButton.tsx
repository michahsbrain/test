import React, {useState} from 'react';
import {Download, Share} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({variant = 'compact'}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Application installée sur cet appareil
        </span>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 text-[#1A73E8] dark:text-blue-400" />
        Installer l’application
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share className="w-4 h-4 text-[#1A73E8] dark:text-blue-400" />
          Installer sur iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Installer sur iPhone / iPad</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                1. Touchez le bouton <strong>Partager</strong> dans la barre Safari.
                <br />
                2. Faites défiler et choisissez <strong>Sur l’écran d’accueil</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-900 dark:bg-[#1A73E8] py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-[#1557B0] transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Utilisez le menu de votre navigateur (« Installer TempoLocal ») pour l’épingler hors ligne.
      </span>
    );
  }

  return null;
};
