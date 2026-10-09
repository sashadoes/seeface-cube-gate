// A shared upload, shown in the chat: an image thumbnail or a sound chip.
import { useEffect, useState } from "react";
import { assetUrl, type Asset } from "./api";

export function Thumb({ asset, admin, roomId }: { asset: Asset; admin?: string; roomId?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    assetUrl(asset.id, roomId, admin).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [asset.id]);
  if (asset.type === "audio") {
    return (
      <span className="ch-thumb sound" title={asset.name}>
        ♪ {asset.name}
        {src && <audio src={src} controls preload="none" />}
      </span>
    );
  }
  return <span className="ch-thumb" title={asset.description ?? asset.name}>{src ? <img src={src} alt={asset.description ?? asset.name} /> : null}</span>;
}
