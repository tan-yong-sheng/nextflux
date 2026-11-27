import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isSafeHref, getLinkLabel } from "@/lib/safeHref.js";

export default function MediaLinkPill({ href }) {
  if (!isSafeHref(href)) return null;
  return (
    <div className="flex justify-center">
      <Badge
        className="cursor-pointer my-2 border-none!"
        variant="secondary"
        render={<a href={href} target="_blank" rel="noopener noreferrer" />}
      >
        {getLinkLabel(href)}
        <ArrowUpRight />
      </Badge>
    </div>
  );
}
