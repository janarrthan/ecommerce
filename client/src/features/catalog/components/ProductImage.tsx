import { useState } from "react";

/** Replaces a failed image with readable text; changing its URL remounts this component through its caller's key. */
export function ProductImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  return failed ? (
    <p className="imageFallback">Image unavailable.</p>
  ) : (
    <img src={url} alt={alt} width="640" height="800" loading="lazy" onError={() => setFailed(true)} />
  );
}
