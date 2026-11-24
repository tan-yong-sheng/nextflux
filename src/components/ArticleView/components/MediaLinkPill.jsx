import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getHostname } from "@/lib/utils.js";

// Feed links are untrusted: only navigate to web/mail/tel targets or
// site-relative paths. Everything else (javascript:, data:, vbscript:) is dropped.
const SAFE_HREF = /^(https?:|mailto:|tel:)/i;
function isSafeHref(href) {
  if (typeof href !== "string" || !href) return false;
  const trimmed = href.trim();
  // No "//" here: protocol-relative URLs navigate to arbitrary external
  // hosts and can downgrade to http on http deployments.
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  return SAFE_HREF.test(trimmed);
}

export default function MediaLinkPill({ href }) {
  if (!isSafeHref(href)) return null;
  return (
    <div className="flex justify-center">
      <Badge
        className="cursor-pointer my-2 border-none!"
        variant="secondary"
        render={<a href={href} target="_blank" rel="noopener noreferrer" />}
      >
        {getHostname(href)}
        <ArrowUpRight />
      </Badge>
    </div>
  );
}
