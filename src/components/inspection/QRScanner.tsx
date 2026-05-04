'use client';

import { useEffect, useRef, useState } from 'react';
import { QrCode, X } from 'lucide-react';

interface Props {
  onScan: (tagNumber: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
  const containerID = 'qr-reader';
  const scannerRef  = useRef<any>(null);
  const [error, setError]   = useState('');
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    let scanner: any;

    async function start() {
      // Dynamically import to avoid SSR issues
      const { Html5Qrcode } = await import('html5-qrcode');
      scanner = new Html5Qrcode(containerID);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded: string) => {
            onScan(decoded.trim());
            stop();
          },
          () => {}
        );
        setReady(true);
      } catch (err: any) {
        setError(err?.message ?? 'Camera access denied.');
      }
    }

    async function stop() {
      try {
        if (scanner?.isScanning) {
          await scanner.stop();
          scanner.clear();
        }
      } catch {}
    }

    start();
    return () => { stop(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-white">
            <QrCode size={18} />
            <span className="text-sm font-medium">Scan Asset QR Code</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scanner */}
        <div className="relative rounded-2xl overflow-hidden bg-black">
          <div id={containerID} className="w-full" />

          {/* Corner overlay */}
          {ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-52 relative">
                {[
                  'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                  'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-brand-400 ${cls}`} />
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400 text-center bg-black/60 px-4 py-2 rounded-xl">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-white/60 text-center">
          Point at the QR code label on the asset
        </p>
      </div>
    </div>
  );
}
