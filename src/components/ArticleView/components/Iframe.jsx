import { useMemo, useState } from "react";
import { cn } from "@/lib/utils.js";

// A same-origin iframe can reach this app's DOM through the sandbox
// (allow-same-origin + allow-scripts), so never embed one.
function isSameOriginSrc(url) {
  try {
    return (
      new URL(url, window.location.href).origin === window.location.origin
    );
  } catch {
    return false;
  }
}

/**
 * 处理文章内容中的iframe，支持特殊平台（如Bilibili）的适配
 * @param {Object} props
 * @param {Object} props.domNode - html-react-parser解析的DOM节点
 * @returns {JSX.Element|null}
 */
const Iframe = ({ domNode }) => {
  const [isLoading, setIsLoading] = useState(true);

  const { iframeProps, finalSrc } = useMemo(() => {
    if (!domNode || domNode.type !== "tag" || domNode.name !== "iframe") {
      return { iframeProps: null, finalSrc: null };
    }

    const { src, ...otherAttribs } = domNode.attribs || {};

    // 添加默认的 referrerpolicy
    const attribs = {
      ...otherAttribs,
      referrerpolicy: "strict-origin-when-cross-origin",
    };

    // 判断是否为 Bilibili iframe
    const isBilibili = src && src.includes("bilibili");

    let result;
    if (isBilibili) {
      // 获取bilibili视频 bvid
      const bvid = src.match(/bvid=([^&]+)/)?.[1];
      if (bvid) {
        result = {
          iframeProps: { allowFullScreen: true, ...attribs },
          finalSrc: `//bilibili.com/blackboard/html5mobileplayer.html?isOutside=true&bvid=${bvid}&p=1&hideCoverInfo=1&danmaku=0`,
        };
      }
    }

    // 默认返回原始iframe（带referrerpolicy）
    result ??= { iframeProps: attribs, finalSrc: src };

    if (result.finalSrc && isSameOriginSrc(result.finalSrc)) {
      return { iframeProps: null, finalSrc: null };
    }
    return result;
  }, [domNode]);

  if (!iframeProps || !finalSrc) {
    return null;
  }

  return (
    <div className="relative w-full my-4">
      {/* 加载占位符 */}
      {isLoading && (
        <div className="absolute inset-0 bg-secondary w-[calc(100%+2.5rem)]! max-w-[calc(100%+2.5rem)]! -mx-5" />
      )}
      {/* iframe */}
      <iframe
        src={finalSrc}
        {...iframeProps}
        // Remote embeds are untrusted: no same-origin access to us (a
        // same-origin feed URL could otherwise reach this app's DOM through
        // allow-same-origin + allow-scripts and drop the sandbox), no
        // top-navigation, no downloads. Scripts/popups/fullscreen stay so
        // players work (Bilibili requests allowFullScreen).
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-fullscreen"
        className={cn(
          "w-full border-0",
          isLoading ? "opacity-0" : "opacity-100",
          "transition-opacity duration-300",
          iframeProps.className,
        )}
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
};

export default Iframe;
